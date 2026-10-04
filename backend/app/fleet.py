"""Keeps each vehicle's status in step with the parcels it's carrying."""

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from .models import Parcel, ParcelStatus, Vehicle, VehicleStatus

# Parcels physically on board (merely "assigned" ones are still at the depot)
ON_BOARD = (ParcelStatus.picked_up, ParcelStatus.in_transit)


def refresh_vehicle_status(db: Session, vehicle: Vehicle | None) -> None:
    """On route while carrying parcels, available otherwise. Maintenance and charging are left alone."""
    if vehicle is None or vehicle.status in (VehicleStatus.maintenance, VehicleStatus.charging):
        return
    carrying = db.scalar(
        select(exists().where(Parcel.vehicle_id == vehicle.id, Parcel.status.in_(ON_BOARD)))
    )
    vehicle.status = VehicleStatus.on_route if carrying else VehicleStatus.available
