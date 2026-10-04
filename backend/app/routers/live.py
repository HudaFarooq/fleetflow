import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel

from .. import database
from ..deps import AdminUser, user_from_token
from ..models import Role
from ..realtime import Viewer, manager
from ..simulator import simulator

router = APIRouter(tags=["live"])


class SimulationState(BaseModel):
    running: bool


AUTH_TIMEOUT_SECONDS = 5


@router.websocket("/ws/fleet")
async def fleet_updates(websocket: WebSocket):
    """Live vehicle positions and parcel changes for admins and drivers.

    Browsers can't add an Authorization header to a WebSocket. Putting the token in the URL
    would leak it into server and proxy logs, so the client sends {"token": ...} as its first
    message instead, and nothing is pushed until that checks out.
    """
    await websocket.accept()
    try:
        first = await asyncio.wait_for(websocket.receive_json(), AUTH_TIMEOUT_SECONDS)
        token = first.get("token", "") if isinstance(first, dict) else ""
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        token = ""
    with database.SessionLocal() as db:
        user = user_from_token(db, token)
        viewer = Viewer(user.id, user.role) if user and user.role in (Role.admin, Role.driver) else None
    if viewer is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    manager.add(websocket, viewer)
    await websocket.send_json({"type": "hello", "simulation": simulator.running})
    try:
        while True:
            await websocket.receive_text()  # we only push; this just notices disconnects
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.get("/simulation", response_model=SimulationState)
def simulation_state(_: AdminUser):
    return SimulationState(running=simulator.running)


@router.post("/simulation/start", response_model=SimulationState)
async def start_simulation(_: AdminUser):
    simulator.start()
    return SimulationState(running=True)


@router.post("/simulation/stop", response_model=SimulationState)
async def stop_simulation(_: AdminUser):
    await simulator.stop()
    return SimulationState(running=False)
