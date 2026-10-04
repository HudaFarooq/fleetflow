"""Drives the fleet around the map, so the live view has something to show without real vans.

Each tick moves every vehicle a step toward its own waypoint, drains or recharges EV batteries,
and broadcasts the new positions. Vehicles keep their real statuses; the simulator only adds
movement and battery behaviour on top.
"""

import asyncio
import math
import random

from sqlalchemy import select

from . import database
from .fleet import refresh_vehicle_status
from .models import Vehicle, VehicleStatus, VehicleType
from .realtime import manager, publish_vehicle

TICK_SECONDS = 2
STEP_DEGREES = 0.0018  # about 200 m per tick
AREA_RADIUS = 0.05  # waypoints within roughly 5 km of the fleet's centre
LOW_BATTERY, CHARGED = 15.0, 90.0


class FleetSimulator:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stopping = asyncio.Event()
        self._waypoints: dict[int, tuple[float, float]] = {}
        self._rng = random.Random()

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self) -> None:
        if not self.running:
            self._stopping = asyncio.Event()
            self._task = asyncio.get_running_loop().create_task(self._run(self._stopping))
        manager.publish({"type": "simulation", "running": True})

    async def stop(self) -> None:
        if self._task:
            # Ask the loop to finish rather than cancelling it: a tick already running in its
            # worker thread can't be interrupted, and must not overlap with unplugging below.
            self._stopping.set()
            await self._task
            self._task = None
            await asyncio.to_thread(self.unplug_all)
        manager.publish({"type": "simulation", "running": False})

    def unplug_all(self) -> None:
        """Charging is simulated, so when the simulation stops nothing is really plugged in any more."""
        with database.SessionLocal() as db:
            charging = db.scalars(select(Vehicle).where(Vehicle.status == VehicleStatus.charging)).all()
            for vehicle in charging:
                vehicle.status = VehicleStatus.available
                refresh_vehicle_status(db, vehicle)
            db.commit()
            for vehicle in charging:
                publish_vehicle(vehicle)

    async def _run(self, stopping: asyncio.Event) -> None:
        while not stopping.is_set():
            # Database work is blocking, so it runs off the event loop
            await asyncio.to_thread(self.tick)
            try:
                await asyncio.wait_for(stopping.wait(), TICK_SECONDS)  # sleep, but wake at once on stop
            except asyncio.TimeoutError:
                pass

    def _waypoint(self, vehicle: Vehicle, centre: tuple[float, float]) -> tuple[float, float]:
        target = self._waypoints.get(vehicle.id)
        if target is None or math.dist(target, (vehicle.latitude, vehicle.longitude)) < STEP_DEGREES:
            angle = self._rng.uniform(0, 2 * math.pi)
            distance = AREA_RADIUS * math.sqrt(self._rng.random())
            target = (centre[0] + distance * math.cos(angle), centre[1] + distance * math.sin(angle))
            self._waypoints[vehicle.id] = target
        return target

    def tick(self) -> None:
        with database.SessionLocal() as db:
            vehicles = db.scalars(select(Vehicle).where(Vehicle.latitude.is_not(None))).all()
            if not vehicles:
                return
            centre = (
                sum(v.latitude for v in vehicles) / len(vehicles),
                sum(v.longitude for v in vehicles) / len(vehicles),
            )
            for vehicle in vehicles:
                self._update_battery(db, vehicle)
                if vehicle.status in (VehicleStatus.maintenance, VehicleStatus.charging):
                    continue
                target = self._waypoint(vehicle, centre)
                d_lat, d_lng = target[0] - vehicle.latitude, target[1] - vehicle.longitude
                distance = math.hypot(d_lat, d_lng)
                step = min(STEP_DEGREES * (0.6 if vehicle.type == VehicleType.bike else 1), distance)
                vehicle.latitude += d_lat / distance * step if distance else 0
                vehicle.longitude += d_lng / distance * step if distance else 0
            db.commit()
            for vehicle in vehicles:
                publish_vehicle(vehicle)

    def _update_battery(self, db, vehicle: Vehicle) -> None:
        if vehicle.type != VehicleType.ev_van or vehicle.battery_level is None:
            return
        if vehicle.status == VehicleStatus.charging:
            vehicle.battery_level = min(100.0, vehicle.battery_level + 4)
            if vehicle.battery_level >= CHARGED:
                vehicle.status = VehicleStatus.available
                refresh_vehicle_status(db, vehicle)
        elif vehicle.status != VehicleStatus.maintenance:
            vehicle.battery_level = max(0.0, vehicle.battery_level - 0.5)
            if vehicle.battery_level <= LOW_BATTERY:
                vehicle.status = VehicleStatus.charging


simulator = FleetSimulator()
