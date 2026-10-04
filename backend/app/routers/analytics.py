"""Admin analytics: delivery volume, success rate, delivery times and per-vehicle performance.

Aggregation happens in Python over the selected window. That's simple and fine at portfolio
scale; at real volume these would become SQL GROUP BY queries or a pre-aggregated table.
"""

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..config import settings
from ..deps import AdminUser, DbSession
from ..models import Parcel, ParcelStatus, PaymentStatus, Vehicle, as_utc
from ..schemas import AnalyticsOut, DailyCount, StatusCount, VehiclePerformance

router = APIRouter(prefix="/analytics", tags=["analytics"])

ACTIVE = {ParcelStatus.assigned, ParcelStatus.picked_up, ParcelStatus.in_transit}


def finished_at(parcel: Parcel) -> datetime | None:
    """When the parcel reached its final status (delivered or failed), if it has."""
    for event in reversed(parcel.events):
        if event.status in (ParcelStatus.delivered, ParcelStatus.failed):
            return as_utc(event.created_at)
    return None


def average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def success_rate(delivered: int, failed: int) -> float | None:
    finished = delivered + failed
    return round(100 * delivered / finished, 1) if finished else None


@router.get("", response_model=AnalyticsOut)
def analytics(db: DbSession, _: AdminUser, days: int = Query(14, ge=1, le=90)):
    today = datetime.now(timezone.utc).date()
    first_day = today - timedelta(days=days - 1)
    since = datetime.combine(first_day, datetime.min.time(), tzinfo=timezone.utc)

    parcels = db.scalars(select(Parcel).options(selectinload(Parcel.events), selectinload(Parcel.payments))).all()
    vehicles = db.scalars(select(Vehicle).options(selectinload(Vehicle.driver)).order_by(Vehicle.id)).all()

    booked_per_day: Counter[date] = Counter()
    delivered_per_day: Counter[date] = Counter()
    failed_per_day: Counter[date] = Counter()
    status_counts: Counter[ParcelStatus] = Counter()
    delivery_minutes: list[float] = []
    revenue_cents = 0
    by_vehicle: dict[int, dict] = defaultdict(lambda: {"delivered": 0, "failed": 0, "minutes": [], "load": 0.0})

    for parcel in parcels:
        # Current load counts regardless of the window; it's "right now"
        if parcel.vehicle_id is not None and parcel.status in ACTIVE:
            by_vehicle[parcel.vehicle_id]["load"] += parcel.weight_kg

        created = as_utc(parcel.created_at)
        revenue_cents += sum(
            payment.amount_cents
            for payment in parcel.payments
            if payment.status == PaymentStatus.succeeded and as_utc(payment.created_at) >= since
        )
        if created >= since:
            booked_per_day[created.date()] += 1
            status_counts[parcel.status] += 1

        done = finished_at(parcel)
        if done is None or done < since:
            continue
        stats = by_vehicle[parcel.vehicle_id] if parcel.vehicle_id is not None else None
        if parcel.status == ParcelStatus.delivered:
            minutes = (done - created).total_seconds() / 60
            delivered_per_day[done.date()] += 1
            delivery_minutes.append(minutes)
            if stats:
                stats["delivered"] += 1
                stats["minutes"].append(minutes)
        elif parcel.status == ParcelStatus.failed:
            failed_per_day[done.date()] += 1
            if stats:
                stats["failed"] += 1

    delivered = sum(delivered_per_day.values())
    failed = sum(failed_per_day.values())

    return AnalyticsOut(
        days=days,
        parcels_booked=sum(booked_per_day.values()),
        delivered=delivered,
        failed=failed,
        in_progress=sum(1 for parcel in parcels if parcel.status in ACTIVE),
        waiting=sum(1 for parcel in parcels if parcel.status == ParcelStatus.created),
        success_rate=success_rate(delivered, failed),
        avg_delivery_minutes=average(delivery_minutes),
        revenue_cents=revenue_cents,
        currency=settings.currency,
        daily=[
            DailyCount(
                date=day,
                booked=booked_per_day[day],
                delivered=delivered_per_day[day],
                failed=failed_per_day[day],
            )
            for day in (first_day + timedelta(days=offset) for offset in range(days))
        ],
        statuses=[StatusCount(status=status, count=status_counts[status]) for status in ParcelStatus],
        vehicles=[
            VehiclePerformance(
                vehicle_id=vehicle.id,
                plate_number=vehicle.plate_number,
                type=vehicle.type,
                driver_name=vehicle.driver.full_name if vehicle.driver else None,
                delivered=by_vehicle[vehicle.id]["delivered"],
                failed=by_vehicle[vehicle.id]["failed"],
                success_rate=success_rate(by_vehicle[vehicle.id]["delivered"], by_vehicle[vehicle.id]["failed"]),
                avg_delivery_minutes=average(by_vehicle[vehicle.id]["minutes"]),
                load_kg=round(by_vehicle[vehicle.id]["load"], 1),
                capacity_kg=vehicle.capacity_kg,
            )
            for vehicle in vehicles
        ],
    )
