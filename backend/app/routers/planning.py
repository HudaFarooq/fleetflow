from fastapi import APIRouter

from ..deps import AdminUser, DbSession
from ..planning.service import plan_ev_charging, plan_routes
from ..schemas import ChargingPlan, ChargingRequest, RoutePlan, RoutePlanRequest

router = APIRouter(prefix="/planning", tags=["planning"])


@router.post("/routes", response_model=RoutePlan)
def optimize_routes(data: RoutePlanRequest, db: DbSession, _: AdminUser):
    """Plan who delivers what, in which order. With apply=true, assign the parcels as planned."""
    return plan_routes(db, apply=data.apply)


@router.post("/charging", response_model=ChargingPlan)
def optimize_charging(data: ChargingRequest, db: DbSession, _: AdminUser):
    """Cheapest overnight charging schedule that gets every EV ready for its planned day."""
    return plan_ev_charging(db, departure_hour=data.departure_hour, site_limit_kw=data.site_limit_kw)
