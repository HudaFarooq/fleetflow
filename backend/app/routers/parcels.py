import secrets
import string
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..deps import AdminUser, CurrentUser, DbSession, require_roles
from ..fleet import refresh_vehicle_status
from ..models import Parcel, ParcelStatus, Role, TrackingEvent, User, Vehicle, VehicleStatus
from ..payments import quote_cents
from ..realtime import publish_parcel, publish_vehicle
from ..schemas import AssignRequest, ParcelCreate, ParcelOut, StatusUpdate

router = APIRouter(prefix="/parcels", tags=["parcels"])

SenderUser = Annotated[User, Depends(require_roles(Role.customer, Role.admin))]
StaffUser = Annotated[User, Depends(require_roles(Role.admin, Role.driver))]

# Parcels that are still taking up space in a vehicle.
ACTIVE_STATUSES = (ParcelStatus.assigned, ParcelStatus.picked_up, ParcelStatus.in_transit)

# Which statuses a parcel may move to next. Assignment is handled by its own endpoint.
ALLOWED_TRANSITIONS = {
    ParcelStatus.assigned: {ParcelStatus.picked_up, ParcelStatus.failed},
    ParcelStatus.picked_up: {ParcelStatus.in_transit, ParcelStatus.failed},
    ParcelStatus.in_transit: {ParcelStatus.delivered, ParcelStatus.failed},
}


def generate_tracking_id() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "FF" + "".join(secrets.choice(alphabet) for _ in range(10))


def can_view(parcel: Parcel, user: User) -> bool:
    if user.role == Role.admin:
        return True
    if user.role == Role.customer:
        return parcel.sender_id == user.id
    return parcel.vehicle is not None and parcel.vehicle.driver_id == user.id


def get_parcel_for_user(db: Session, parcel_id: int, user: User) -> Parcel:
    parcel = db.get(Parcel, parcel_id)
    # 404 rather than 403 so users can't probe which parcel IDs exist
    if parcel is None or not can_view(parcel, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parcel not found")
    return parcel


@router.post("", response_model=ParcelOut, status_code=status.HTTP_201_CREATED)
def create_parcel(data: ParcelCreate, db: DbSession, user: SenderUser):
    parcel = Parcel(
        tracking_id=generate_tracking_id(),
        sender_id=user.id,
        price_cents=quote_cents(data.weight_kg),
        currency=settings.currency,
        **data.model_dump(),
    )
    parcel.events.append(TrackingEvent(status=ParcelStatus.created, note="Parcel booked"))
    db.add(parcel)
    db.commit()
    db.refresh(parcel)
    publish_parcel(parcel)
    return parcel


@router.get("", response_model=list[ParcelOut])
def list_parcels(
    db: DbSession,
    user: CurrentUser,
    status_filter: Annotated[ParcelStatus | None, Query(alias="status")] = None,
):
    query = (
        select(Parcel)
        .options(selectinload(Parcel.events), selectinload(Parcel.payments))
        .order_by(Parcel.created_at.desc(), Parcel.id.desc())
    )
    if user.role == Role.customer:
        query = query.where(Parcel.sender_id == user.id)
    elif user.role == Role.driver:
        # Drivers get their stops in the planned order first
        query = (
            query.join(Vehicle)
            .where(Vehicle.driver_id == user.id)
            .order_by(None)
            .order_by(Parcel.stop_order.is_(None), Parcel.stop_order, Parcel.created_at.desc(), Parcel.id.desc())
        )
    if status_filter:
        query = query.where(Parcel.status == status_filter)
    return db.scalars(query).all()


@router.get("/{parcel_id}", response_model=ParcelOut)
def get_parcel(parcel_id: int, db: DbSession, user: CurrentUser):
    return get_parcel_for_user(db, parcel_id, user)


@router.post("/{parcel_id}/assign", response_model=ParcelOut)
def assign_parcel(parcel_id: int, data: AssignRequest, db: DbSession, user: AdminUser):
    parcel = get_parcel_for_user(db, parcel_id, user)
    if parcel.status not in (ParcelStatus.created, ParcelStatus.assigned):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Only parcels that have not been picked up can be assigned"
        )
    if not parcel.paid:
        raise HTTPException(status.HTTP_409_CONFLICT, "This parcel is waiting for payment")

    vehicle = db.get(Vehicle, data.vehicle_id)
    if vehicle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle not found")
    if vehicle.status == VehicleStatus.maintenance:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Vehicle {vehicle.plate_number} is in maintenance")

    current_load = db.scalar(
        select(func.coalesce(func.sum(Parcel.weight_kg), 0.0)).where(
            Parcel.vehicle_id == vehicle.id,
            Parcel.status.in_(ACTIVE_STATUSES),
            Parcel.id != parcel.id,
        )
    )
    free_kg = vehicle.capacity_kg - current_load
    if parcel.weight_kg > free_kg:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Vehicle {vehicle.plate_number} has {free_kg:.1f} kg free; parcel weighs {parcel.weight_kg:.1f} kg",
        )

    previous_vehicle = parcel.vehicle
    parcel.vehicle = vehicle
    parcel.status = ParcelStatus.assigned
    parcel.events.append(
        TrackingEvent(status=ParcelStatus.assigned, note=f"Assigned to vehicle {vehicle.plate_number}")
    )
    db.flush()
    for affected in {previous_vehicle, vehicle} - {None}:
        refresh_vehicle_status(db, affected)
    db.commit()
    db.refresh(parcel)
    publish_parcel(parcel)
    return parcel


@router.post("/{parcel_id}/status", response_model=ParcelOut)
def update_status(parcel_id: int, data: StatusUpdate, db: DbSession, user: StaffUser):
    parcel = get_parcel_for_user(db, parcel_id, user)
    if data.status not in ALLOWED_TRANSITIONS.get(parcel.status, set()):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot change status from {parcel.status.value} to {data.status.value}",
        )
    parcel.status = data.status
    parcel.events.append(TrackingEvent(**data.model_dump()))
    db.flush()
    refresh_vehicle_status(db, parcel.vehicle)
    db.commit()
    db.refresh(parcel)
    publish_parcel(parcel)
    if parcel.vehicle:
        publish_vehicle(parcel.vehicle)
    return parcel
