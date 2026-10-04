from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import ParcelStatus, PaymentStatus, Role, VehicleStatus, VehicleType

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Users & auth ---

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=100)
    # bcrypt only uses the first 72 bytes, so keep passwords under that
    password: str = Field(min_length=8, max_length=64)


class AdminUserCreate(UserCreate):
    role: Role


class AdminUserUpdate(BaseModel):
    """Every field is optional; only the ones sent are changed."""

    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=64)


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class Message(BaseModel):
    detail: str


# --- Self-service account ---

class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=64)


class PasswordConfirm(BaseModel):
    password: str


class AccountDeleted(BaseModel):
    # Accounts with delivery history are deactivated instead of erased
    result: Literal["deleted", "deactivated"]


class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=64)


# --- Vehicles ---

class VehicleCreate(BaseModel):
    plate_number: str = Field(min_length=1, max_length=20)
    type: VehicleType
    capacity_kg: float = Field(gt=0)
    battery_level: float | None = Field(default=None, ge=0, le=100)
    driver_id: int | None = None


class VehicleUpdate(BaseModel):
    status: VehicleStatus | None = None
    capacity_kg: float | None = Field(default=None, gt=0)
    battery_level: float | None = Field(default=None, ge=0, le=100)
    driver_id: int | None = None


class LocationUpdate(BaseModel):
    latitude: Latitude
    longitude: Longitude
    battery_level: float | None = Field(default=None, ge=0, le=100)


class VehicleOut(ORMModel):
    id: int
    plate_number: str
    type: VehicleType
    capacity_kg: float
    battery_level: float | None
    status: VehicleStatus
    latitude: float | None
    longitude: float | None
    driver_id: int | None


# --- Parcels & tracking ---

class ParcelCreate(BaseModel):
    receiver_name: str = Field(min_length=1, max_length=100)
    receiver_phone: str = Field(min_length=5, max_length=30)
    pickup_address: str = Field(min_length=1, max_length=255)
    delivery_address: str = Field(min_length=1, max_length=255)
    weight_kg: float = Field(gt=0, le=1000)
    # Optional pin on the map; parcels without one can't be route-planned
    delivery_latitude: Latitude | None = None
    delivery_longitude: Longitude | None = None


class AssignRequest(BaseModel):
    vehicle_id: int


class StatusUpdate(BaseModel):
    status: ParcelStatus
    note: str | None = Field(default=None, max_length=255)
    latitude: Latitude | None = None
    longitude: Longitude | None = None


class TrackingEventOut(ORMModel):
    status: ParcelStatus
    note: str | None
    latitude: float | None
    longitude: float | None
    created_at: datetime


class ParcelOut(ORMModel):
    id: int
    tracking_id: str
    receiver_name: str
    receiver_phone: str
    pickup_address: str
    delivery_address: str
    weight_kg: float
    status: ParcelStatus
    vehicle_id: int | None
    delivery_latitude: float | None
    delivery_longitude: float | None
    stop_order: int | None
    price_cents: int
    currency: str
    paid: bool
    created_at: datetime
    events: list[TrackingEventOut]


# --- Payments ---

class Quote(BaseModel):
    weight_kg: float
    amount_cents: int
    currency: str


class CardInput(BaseModel):
    number: str = Field(min_length=12, max_length=23)
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=2000, le=2100)
    cvc: str = Field(min_length=3, max_length=4)


class PaymentOut(ORMModel):
    id: int
    parcel_id: int
    tracking_id: str
    amount_cents: int
    currency: str
    status: PaymentStatus
    card_brand: str | None
    card_last4: str | None
    failure_reason: str | None
    created_at: datetime
    refunded_at: datetime | None
    refundable: bool


class PublicStats(BaseModel):
    parcels_total: int
    parcels_delivered: int
    parcels_in_progress: int
    vehicles_total: int
    electric_share: int  # percent of the fleet that is electric


class DailyCount(BaseModel):
    date: date
    booked: int
    delivered: int
    failed: int


class StatusCount(BaseModel):
    status: ParcelStatus
    count: int


class VehiclePerformance(BaseModel):
    vehicle_id: int
    plate_number: str
    type: VehicleType
    driver_name: str | None
    delivered: int
    failed: int
    success_rate: float | None  # percent; None until something has finished
    avg_delivery_minutes: float | None
    load_kg: float
    capacity_kg: float


class AnalyticsOut(BaseModel):
    days: int
    parcels_booked: int
    delivered: int
    failed: int
    in_progress: int  # right now, not limited to the window
    waiting: int  # right now, not limited to the window
    success_rate: float | None
    avg_delivery_minutes: float | None
    revenue_cents: int  # payments taken in the window that haven't been refunded
    currency: str
    daily: list[DailyCount]
    statuses: list[StatusCount]
    vehicles: list[VehiclePerformance]


class PublicTrackingOut(ORMModel):
    """What anyone with the tracking ID can see. No phone numbers or sender details."""

    tracking_id: str
    status: ParcelStatus
    delivery_address: str
    created_at: datetime
    events: list[TrackingEventOut]


# --- Planning ---

class LatLng(BaseModel):
    latitude: float
    longitude: float


class PlannedStop(LatLng):
    parcel_id: int
    tracking_id: str
    weight_kg: float
    new: bool  # True if the planner is assigning it; False if it was already on this vehicle


class PlannedRoute(BaseModel):
    vehicle_id: int
    plate_number: str
    type: VehicleType
    start: LatLng
    stops: list[PlannedStop]
    distance_km: float
    booking_order_km: float  # same parcels, delivered in booking order
    load_kg: float
    capacity_kg: float
    energy_kwh: float | None  # EVs only
    range_km: float | None  # EVs only: distance left above the battery reserve


class UnplannedParcel(BaseModel):
    parcel_id: int
    tracking_id: str
    reason: str


class RoutePlan(BaseModel):
    routes: list[PlannedRoute]
    unplanned: list[UnplannedParcel]
    total_km: float
    booking_order_km: float
    saving_pct: float
    applied: bool


class RoutePlanRequest(BaseModel):
    apply: bool = False


class ChargingRequest(BaseModel):
    departure_hour: int = Field(default=8, ge=0, le=23)
    site_limit_kw: float | None = Field(default=None, gt=0, le=1000)


class ChargingSlot(BaseModel):
    start: datetime
    price_cents: float


class EVChargingPlan(BaseModel):
    vehicle_id: int
    plate_number: str
    battery_now_pct: float
    target_pct: float
    final_pct: float
    planned_km: float
    energy_kwh: float
    cost_cents: int
    shortfall_kwh: float  # > 0 means the target can't be reached in time
    power_kw: list[float]  # optimized, one per slot
    baseline_power_kw: list[float]  # "charge immediately", one per slot


class ChargingPlan(BaseModel):
    slots: list[ChargingSlot]
    slot_minutes: int
    departure: datetime
    timezone: str
    site_limit_kw: float
    charger_kw: float
    vehicles: list[EVChargingPlan]
    cost_cents: int
    baseline_cost_cents: int
    saving_pct: float
    currency: str

