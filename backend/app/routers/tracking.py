from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..deps import DbSession
from ..models import Parcel
from ..schemas import PublicTrackingOut

router = APIRouter(prefix="/track", tags=["tracking"])


@router.get("/{tracking_id}", response_model=PublicTrackingOut)
def track_parcel(tracking_id: str, db: DbSession):
    """Public endpoint: anyone with the tracking ID can follow the parcel, no login needed."""
    parcel = db.scalar(select(Parcel).where(Parcel.tracking_id == tracking_id.strip().upper()))
    if parcel is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No parcel found with this tracking ID")
    return parcel
