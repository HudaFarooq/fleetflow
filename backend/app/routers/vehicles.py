from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import AdminUser, DbSession, require_roles
from ..models import Role, User, Vehicle
from ..realtime import publish_vehicle
from ..schemas import LocationUpdate, VehicleCreate, VehicleOut, VehicleUpdate

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

StaffUser = Annotated[User, Depends(require_roles(Role.admin, Role.driver))]


def ensure_driver(db: Session, driver_id: int | None) -> None:
    if driver_id is None:
        return
    driver = db.get(User, driver_id)
    if driver is None or driver.role != Role.driver:
        raise HTTPException(
            422, "driver_id must belong to a user with the driver role"
        )


def get_vehicle_for_user(db: Session, vehicle_id: int, user: User) -> Vehicle:
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None or (user.role != Role.admin and vehicle.driver_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle not found")
    return vehicle


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
def create_vehicle(data: VehicleCreate, db: DbSession, _: AdminUser):
    plate = data.plate_number.upper()
    if db.scalar(select(Vehicle).where(Vehicle.plate_number == plate)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Vehicle {plate} already exists")
    ensure_driver(db, data.driver_id)
    vehicle = Vehicle(**data.model_dump(exclude={"plate_number"}), plate_number=plate)
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    publish_vehicle(vehicle)
    return vehicle


@router.get("", response_model=list[VehicleOut])
def list_vehicles(db: DbSession, user: StaffUser):
    """Admins see the whole fleet; drivers see only the vehicles assigned to them."""
    query = select(Vehicle).order_by(Vehicle.id)
    if user.role == Role.driver:
        query = query.where(Vehicle.driver_id == user.id)
    return db.scalars(query).all()


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(vehicle_id: int, db: DbSession, user: StaffUser):
    return get_vehicle_for_user(db, vehicle_id, user)


@router.patch("/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(vehicle_id: int, data: VehicleUpdate, db: DbSession, user: AdminUser):
    vehicle = get_vehicle_for_user(db, vehicle_id, user)
    changes = data.model_dump(exclude_unset=True)
    if "driver_id" in changes:
        ensure_driver(db, changes["driver_id"])
    for field, value in changes.items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    publish_vehicle(vehicle)
    return vehicle


@router.patch("/{vehicle_id}/location", response_model=VehicleOut)
def update_location(vehicle_id: int, data: LocationUpdate, db: DbSession, user: StaffUser):
    """Called by the driver's device (or the simulator) to report position."""
    vehicle = get_vehicle_for_user(db, vehicle_id, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    publish_vehicle(vehicle)
    return vehicle
