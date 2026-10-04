"""Connects the solvers to the database: build inputs, run, and optionally apply the plan."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..fleet import refresh_vehicle_status
from ..models import Parcel, ParcelStatus, TrackingEvent, Vehicle, VehicleStatus, VehicleType
from ..realtime import publish_parcel
from .charging import EV, Slot, plan_charging
from .routing import Stop, Truck, booking_order_km, solve_routes

COMMITTED = (ParcelStatus.assigned, ParcelStatus.picked_up, ParcelStatus.in_transit)
SLOT_MINUTES = 30
DEFAULT_DAILY_KM = 80  # assumed driving for an EV with no planned route yet


def battery_kwh(vehicle: Vehicle) -> float:
    return settings.ev_battery_kwh * (vehicle.battery_level or 0) / 100


def ev_range_km(vehicle: Vehicle) -> float:
    reserve = settings.ev_battery_kwh * settings.ev_reserve_pct / 100
    return max(0.0, battery_kwh(vehicle) - reserve) / settings.ev_kwh_per_km


def plannable_vehicles(db: Session) -> list[Vehicle]:
    return list(db.scalars(
        select(Vehicle)
        .where(Vehicle.latitude.is_not(None), Vehicle.status != VehicleStatus.maintenance)
        .order_by(Vehicle.id)
    ))


def route_inputs(db: Session, vehicles: list[Vehicle]) -> tuple[list[Truck], list[Stop], list[Parcel], list[Parcel]]:
    """Trucks and stops for the solver, the parcels behind them, and parcels we can't plan (no pin)."""
    ids = {v.id for v in vehicles}
    parcels = db.scalars(
        select(Parcel)
        .options(selectinload(Parcel.payments))
        .where(Parcel.status.in_((ParcelStatus.created, *COMMITTED)))
        .order_by(Parcel.id)
    ).all()
    plannable, unlocated = [], []
    for parcel in parcels:
        waiting = parcel.status == ParcelStatus.created
        if waiting and not parcel.paid:
            continue  # not dispatchable until paid
        if not waiting and parcel.vehicle_id not in ids:
            continue  # on a vehicle that's in maintenance or has no location
        (plannable if parcel.delivery_latitude is not None else unlocated).append(parcel)

    trucks = [
        Truck(
            vehicle_id=v.id,
            position=(v.latitude, v.longitude),
            capacity_kg=v.capacity_kg,
            max_km=ev_range_km(v) if v.type == VehicleType.ev_van else None,
        )
        for v in vehicles
    ]
    stops = [
        Stop(
            parcel_id=p.id,
            position=(p.delivery_latitude, p.delivery_longitude),
            weight_kg=p.weight_kg,
            vehicle_id=None if p.status == ParcelStatus.created else p.vehicle_id,
        )
        for p in plannable
    ]
    return trucks, stops, plannable, unlocated


def plan_routes(db: Session, apply: bool = False) -> dict:
    vehicles = plannable_vehicles(db)
    trucks, stops, parcels, unlocated = route_inputs(db, vehicles)
    result = solve_routes(trucks, stops, settings.road_factor, settings.route_solver_seconds)

    by_id = {p.id: p for p in parcels}
    stop_by_id = {s.parcel_id: s for s in stops}
    vehicle_by_id = {v.id: v for v in vehicles}
    truck_by_id = {t.vehicle_id: t for t in trucks}

    plan_routes_out, total_km, baseline_km = [], 0.0, 0.0
    for route in result.routes:
        vehicle, truck = vehicle_by_id[route.vehicle_id], truck_by_id[route.vehicle_id]
        baseline = booking_order_km(truck, [stop_by_id[pid] for pid in route.parcel_ids], settings.road_factor)
        total_km += route.distance_km
        baseline_km += baseline
        energy = route.distance_km * settings.ev_kwh_per_km if vehicle.type == VehicleType.ev_van else None
        plan_routes_out.append({
            "vehicle_id": vehicle.id,
            "plate_number": vehicle.plate_number,
            "type": vehicle.type,
            "start": {"latitude": vehicle.latitude, "longitude": vehicle.longitude},
            "stops": [
                {
                    "parcel_id": pid,
                    "tracking_id": by_id[pid].tracking_id,
                    "latitude": by_id[pid].delivery_latitude,
                    "longitude": by_id[pid].delivery_longitude,
                    "weight_kg": by_id[pid].weight_kg,
                    "new": by_id[pid].status == ParcelStatus.created,
                }
                for pid in route.parcel_ids
            ],
            "distance_km": round(route.distance_km, 2),
            "booking_order_km": round(baseline, 2),
            "load_kg": round(route.load_kg, 1),
            "capacity_kg": vehicle.capacity_kg,
            "energy_kwh": round(energy, 1) if energy is not None else None,
            "range_km": round(truck.max_km, 1) if truck.max_km is not None else None,
        })

    unplanned = [
        {"parcel_id": pid, "tracking_id": by_id[pid].tracking_id, "reason": "No vehicle has enough capacity or range left"}
        for pid in result.dropped
    ] + [
        {"parcel_id": p.id, "tracking_id": p.tracking_id, "reason": "No delivery location pinned"}
        for p in unlocated
    ]

    if apply:
        apply_routes(db, result.routes, by_id, vehicle_by_id)

    return {
        "routes": plan_routes_out,
        "unplanned": unplanned,
        "total_km": round(total_km, 2),
        "booking_order_km": round(baseline_km, 2),
        "saving_pct": round(100 * (1 - total_km / baseline_km), 1) if baseline_km > 0 else 0.0,
        "applied": apply,
    }


def apply_routes(db: Session, routes, parcels: dict[int, Parcel], vehicles: dict[int, Vehicle]) -> None:
    """Assign waiting parcels to their planned vehicle and record every vehicle's stop order."""
    changed: list[Parcel] = []
    for route in routes:
        vehicle = vehicles[route.vehicle_id]
        for position, parcel_id in enumerate(route.parcel_ids, start=1):
            parcel = parcels[parcel_id]
            parcel.stop_order = position
            if parcel.status == ParcelStatus.created:
                parcel.vehicle = vehicle
                parcel.status = ParcelStatus.assigned
                parcel.events.append(TrackingEvent(
                    status=ParcelStatus.assigned,
                    note=f"Assigned to vehicle {vehicle.plate_number} by the route planner",
                ))
                changed.append(parcel)
    db.flush()
    for vehicle in vehicles.values():
        refresh_vehicle_status(db, vehicle)
    db.commit()
    for parcel in changed:
        publish_parcel(parcel)


# --- EV charging ---

def tariff_cents(local_hour: int) -> float:
    if local_hour >= 22 or local_hour < 7:
        return settings.tariff_offpeak_cents
    if 17 <= local_hour < 21:
        return settings.tariff_peak_cents
    return settings.tariff_mid_cents


def plan_ev_charging(db: Session, departure_hour: int = 8, site_limit_kw: float | None = None, now: datetime | None = None) -> dict:
    zone = ZoneInfo(settings.depot_timezone)
    now = (now or datetime.now(timezone.utc)).astimezone(zone)
    start = now.replace(minute=0 if now.minute < SLOT_MINUTES else SLOT_MINUTES, second=0, microsecond=0)
    departure = start.replace(hour=departure_hour, minute=0)
    if departure <= start:
        departure += timedelta(days=1)
    step = timedelta(minutes=SLOT_MINUTES)
    slots = [Slot(start + k * step, tariff_cents((start + k * step).hour)) for k in range(int((departure - start) / step))]

    # How far each EV must drive tomorrow: its committed parcels' best route, or a default day
    vehicles = [v for v in plannable_vehicles(db) if v.type == VehicleType.ev_van and v.battery_level is not None]
    trucks, stops, _, _ = route_inputs(db, vehicles)
    committed = [s for s in stops if s.vehicle_id is not None]
    unlimited = [Truck(t.vehicle_id, t.position, t.capacity_kg, None) for t in trucks]  # plan the route, ignore today's range
    routes = {r.vehicle_id: r for r in solve_routes(unlimited, committed, settings.road_factor, 1).routes}

    evs, needs = [], {}
    reserve = settings.ev_battery_kwh * settings.ev_reserve_pct / 100
    for vehicle in vehicles:
        route = routes.get(vehicle.id)
        km = route.distance_km if route and route.parcel_ids else DEFAULT_DAILY_KM
        needs[vehicle.id] = km
        # Enough for the route plus reserve, and never less than the standard morning charge
        target = max(km * settings.ev_kwh_per_km + reserve, settings.ev_battery_kwh * settings.ev_departure_pct / 100)
        evs.append(EV(vehicle.id, settings.ev_battery_kwh, battery_kwh(vehicle), target))

    site_kw = site_limit_kw if site_limit_kw is not None else settings.site_limit_kw
    slot_hours = SLOT_MINUTES / 60
    result = plan_charging(evs, slots, slot_hours, settings.charger_kw, site_kw) if evs and slots else None

    vehicles_out = []
    for i, (vehicle, ev) in enumerate(zip(vehicles, evs)):
        schedule = result.schedules[i]
        vehicles_out.append({
            "vehicle_id": vehicle.id,
            "plate_number": vehicle.plate_number,
            "battery_now_pct": round(100 * ev.energy_kwh / ev.capacity_kwh, 1),
            "target_pct": round(100 * min(ev.target_kwh, ev.capacity_kwh) / ev.capacity_kwh, 1),
            "final_pct": round(100 * schedule.final_kwh / ev.capacity_kwh, 1),
            "planned_km": round(needs[vehicle.id], 1),
            "energy_kwh": round(schedule.grid_kwh, 2),
            "cost_cents": round(schedule.cost_cents),
            "shortfall_kwh": schedule.shortfall_kwh,
            "power_kw": schedule.power_kw,
            "baseline_power_kw": [round(kw, 3) for kw in result.baseline_power_kw[i]],
        })

    cost = result.cost_cents if result else 0.0
    baseline = result.baseline_cost_cents if result else 0.0
    return {
        "slots": [{"start": s.start.isoformat(), "price_cents": s.price_cents} for s in slots],
        "slot_minutes": SLOT_MINUTES,
        "departure": departure.isoformat(),
        "timezone": settings.depot_timezone,
        "site_limit_kw": site_kw,
        "charger_kw": settings.charger_kw,
        "vehicles": vehicles_out,
        "cost_cents": round(cost),
        "baseline_cost_cents": round(baseline),
        "saving_pct": round(100 * (1 - cost / baseline), 1) if baseline > 0 else 0.0,
        "currency": settings.currency,
    }
