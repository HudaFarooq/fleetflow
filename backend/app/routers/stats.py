from fastapi import APIRouter
from sqlalchemy import func, select

from ..deps import DbSession
from ..models import Parcel, ParcelStatus, Vehicle, VehicleType
from ..schemas import PublicStats

router = APIRouter(prefix="/stats", tags=["stats"])

IN_PROGRESS = (ParcelStatus.assigned, ParcelStatus.picked_up, ParcelStatus.in_transit)


@router.get("/public", response_model=PublicStats)
def public_stats(db: DbSession):
    """Aggregate numbers for the landing page. Counts only, nothing identifying."""
    count = lambda query: db.scalar(query) or 0
    vehicles_total = count(select(func.count(Vehicle.id)))
    electric = count(select(func.count(Vehicle.id)).where(Vehicle.type == VehicleType.ev_van))
    return PublicStats(
        parcels_total=count(select(func.count(Parcel.id))),
        parcels_delivered=count(select(func.count(Parcel.id)).where(Parcel.status == ParcelStatus.delivered)),
        parcels_in_progress=count(select(func.count(Parcel.id)).where(Parcel.status.in_(IN_PROGRESS))),
        vehicles_total=vehicles_total,
        electric_share=round(100 * electric / vehicles_total) if vehicles_total else 0,
    )
