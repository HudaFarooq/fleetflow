"""Read-only tools the assistant can call. None of them change anything.

Each tool is a plain function taking the DB session and keyword arguments, returning JSON-ready
data. TOOL_SPECS describes them to the model (JSON Schema parameters).
"""

from collections.abc import Callable
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Parcel, ParcelStatus, User, Vehicle
from ..planning.service import plan_ev_charging, plan_routes
from ..routers.analytics import analytics as analytics_endpoint

LIST_LIMIT = 25  # keep tool results small; the model doesn't need every row


def fleet_status(db: Session) -> dict:
    vehicles = db.scalars(select(Vehicle).order_by(Vehicle.id)).all()
    drivers = {u.id: u.full_name for u in db.scalars(select(User))}
    load: dict[int, float] = {}
    for parcel in db.scalars(select(Parcel).where(Parcel.status.in_((ParcelStatus.assigned, ParcelStatus.picked_up, ParcelStatus.in_transit)))):
        load[parcel.vehicle_id] = load.get(parcel.vehicle_id, 0) + parcel.weight_kg
    return {
        "vehicles": [
            {
                "plate": v.plate_number,
                "type": v.type.value,
                "status": v.status.value,
                "driver": drivers.get(v.driver_id),
                "battery_pct": v.battery_level,
                "load_kg": round(load.get(v.id, 0), 1),
                "capacity_kg": v.capacity_kg,
                "location": {"lat": v.latitude, "lng": v.longitude} if v.latitude is not None else None,
            }
            for v in vehicles
        ]
    }


def find_parcel(db: Session, tracking_id: str) -> dict:
    parcel = db.scalar(
        select(Parcel).options(selectinload(Parcel.events), selectinload(Parcel.payments))
        .where(Parcel.tracking_id == tracking_id.strip().upper())
    )
    if parcel is None:
        return {"error": f"No parcel with tracking ID {tracking_id}"}
    return {
        "tracking_id": parcel.tracking_id,
        "status": parcel.status.value,
        "paid": parcel.paid,
        "receiver": parcel.receiver_name,
        "delivery_address": parcel.delivery_address,
        "weight_kg": parcel.weight_kg,
        "vehicle": parcel.vehicle.plate_number if parcel.vehicle else None,
        "stop_order": parcel.stop_order,
        "history": [{"status": e.status.value, "at": e.created_at.isoformat(), "note": e.note} for e in parcel.events],
    }


def list_parcels(db: Session, status: str | None = None) -> dict:
    query = select(Parcel).options(selectinload(Parcel.payments)).order_by(Parcel.created_at.desc())
    if status:
        try:
            query = query.where(Parcel.status == ParcelStatus(status))
        except ValueError:
            return {"error": f"Unknown status '{status}'. Use one of: {', '.join(s.value for s in ParcelStatus)}"}
    parcels = db.scalars(query).all()
    return {
        "total": len(parcels),
        "parcels": [
            {
                "tracking_id": p.tracking_id,
                "status": p.status.value,
                "paid": p.paid,
                "weight_kg": p.weight_kg,
                "vehicle": p.vehicle.plate_number if p.vehicle else None,
                "booked": p.created_at.isoformat(),
            }
            for p in parcels[:LIST_LIMIT]
        ],
        "truncated": len(parcels) > LIST_LIMIT,
    }


def delivery_stats(db: Session, days: int = 7) -> dict:
    data = analytics_endpoint(db, None, days=max(1, min(days, 90)))
    return data.model_dump(mode="json", exclude={"vehicles", "daily"}) | {
        "vehicles": [v.model_dump(mode="json") for v in data.vehicles]
    }


def preview_routes(db: Session) -> dict:
    plan = plan_routes(db, apply=False)  # preview only, never applied from chat
    return {
        "total_km": plan["total_km"],
        "booking_order_km": plan["booking_order_km"],
        "saving_pct": plan["saving_pct"],
        "routes": [
            {"vehicle": r["plate_number"], "stops": [s["tracking_id"] for s in r["stops"]], "km": r["distance_km"],
             "load_kg": r["load_kg"], "capacity_kg": r["capacity_kg"]}
            for r in plan["routes"]
        ],
        "unplanned": plan["unplanned"],
    }


def preview_charging(db: Session, departure_hour: int = 8) -> dict:
    plan = plan_ev_charging(db, departure_hour=max(0, min(int(departure_hour), 23)))
    slots = plan["slots"]
    return {
        "currency": plan["currency"],
        "cost_cents": plan["cost_cents"],
        "charge_immediately_cost_cents": plan["baseline_cost_cents"],
        "saving_pct": plan["saving_pct"],
        "timezone": plan["timezone"],
        "vans": [
            {
                "vehicle": v["plate_number"],
                "battery_now_pct": v["battery_now_pct"],
                "at_departure_pct": v["final_pct"],
                "charging_slots": [slots[i]["start"] for i, kw in enumerate(v["power_kw"]) if kw > 0.01],
            }
            for v in plan["vehicles"]
        ],
    }


def current_time(db: Session) -> dict:
    return {"utc": datetime.now(timezone.utc).isoformat()}


TOOLS: dict[str, Callable[..., dict]] = {
    "fleet_status": fleet_status,
    "find_parcel": find_parcel,
    "list_parcels": list_parcels,
    "delivery_stats": delivery_stats,
    "preview_routes": preview_routes,
    "preview_charging": preview_charging,
    "current_time": current_time,
}

TOOL_SPECS = [
    {"name": "fleet_status", "description": "Every vehicle: type, status, driver, battery %, current load and location.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "find_parcel", "description": "One parcel's status, payment, vehicle and full tracking history.",
     "parameters": {"type": "object", "properties": {"tracking_id": {"type": "string", "description": "e.g. FF7K2M9QX4LP"}},
                    "required": ["tracking_id"]}},
    {"name": "list_parcels", "description": "Recent parcels, optionally filtered by status.",
     "parameters": {"type": "object", "properties": {"status": {
         "type": "string", "enum": [s.value for s in ParcelStatus],
         "description": "created means booked and waiting for dispatch"}}}},
    {"name": "delivery_stats", "description": "Delivered/failed counts, success rate, average delivery time, revenue and per-vehicle performance.",
     "parameters": {"type": "object", "properties": {"days": {"type": "integer", "description": "Look-back window, 1-90"}}}},
    {"name": "preview_routes", "description": "Run the route optimizer as a preview (changes nothing): proposed stops per vehicle and distance saved.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "preview_charging", "description": "Run the EV charging planner as a preview: cheapest overnight schedule and savings.",
     "parameters": {"type": "object", "properties": {"departure_hour": {"type": "integer", "description": "Hour the vans must be ready, 0-23"}}}},
    {"name": "current_time", "description": "The current date and time.", "parameters": {"type": "object", "properties": {}}},
]

assert {spec["name"] for spec in TOOL_SPECS} == set(TOOLS), "every tool needs a spec, and vice versa"
