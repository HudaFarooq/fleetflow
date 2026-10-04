"""Live updates pushed to dashboards over WebSockets.

Endpoints mostly run in FastAPI's thread pool (they're plain `def`), while WebSockets live on the
event loop. `publish()` works from either side, so any endpoint can announce a change.

Each message carries an audience check, so a socket only receives what its user could also
read through the REST API: admins see everything, drivers only their own vehicle and parcels.
"""

import asyncio
import json
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import WebSocket

from .models import Parcel, Role, Vehicle
from .schemas import VehicleOut


@dataclass(frozen=True)
class Viewer:
    user_id: int
    role: Role


Audience = Callable[[Viewer], bool]


def everyone(_: Viewer) -> bool:
    return True


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[WebSocket, Viewer] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def add(self, websocket: WebSocket, viewer: Viewer) -> None:
        """Start sending updates to an accepted, authenticated socket."""
        self._connections[websocket] = viewer

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.pop(websocket, None)

    async def broadcast(self, message: dict, audience: Audience = everyone) -> None:
        text = json.dumps(message, default=str)
        for websocket, viewer in list(self._connections.items()):
            if not audience(viewer):
                continue
            try:
                await websocket.send_text(text)
            except Exception:  # the client went away mid-send
                self.disconnect(websocket)

    def publish(self, message: dict, audience: Audience = everyone) -> None:
        """Send to matching dashboards. Safe to call from sync endpoints and background tasks."""
        if self._loop is None or not self._connections:
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self._loop:
            self._loop.create_task(self.broadcast(message, audience))
        else:
            asyncio.run_coroutine_threadsafe(self.broadcast(message, audience), self._loop)


manager = ConnectionManager()


def admins_and_driver(driver_id: int | None) -> Audience:
    return lambda viewer: viewer.role == Role.admin or (driver_id is not None and viewer.user_id == driver_id)


def publish_vehicle(vehicle: Vehicle) -> None:
    # Same shape as GET /vehicles, so the dashboard can drop it straight into its list
    manager.publish(
        {"type": "vehicle", "vehicle": VehicleOut.model_validate(vehicle).model_dump(mode="json")},
        admins_and_driver(vehicle.driver_id),
    )


def publish_parcel(parcel: Parcel) -> None:
    manager.publish(
        {
            "type": "parcel",
            "parcel_id": parcel.id,
            "tracking_id": parcel.tracking_id,
            "status": parcel.status.value,
            "vehicle_id": parcel.vehicle_id,
        },
        admins_and_driver(parcel.vehicle.driver_id if parcel.vehicle else None),
    )
