import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(moment: datetime) -> datetime:
    """Everything is stored in UTC, but SQLite hands datetimes back without a timezone."""
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


class Role(str, enum.Enum):
    customer = "customer"
    admin = "admin"
    driver = "driver"


class VehicleType(str, enum.Enum):
    bike = "bike"
    van = "van"
    ev_van = "ev_van"
    truck = "truck"


class VehicleStatus(str, enum.Enum):
    available = "available"
    on_route = "on_route"
    charging = "charging"
    maintenance = "maintenance"


class ParcelStatus(str, enum.Enum):
    created = "created"
    assigned = "assigned"
    picked_up = "picked_up"
    in_transit = "in_transit"
    delivered = "delivered"
    failed = "failed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"))
    # Deactivated users can't log in, but their parcels and history stay intact
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # Stored in every login token; bumping it signs the user out everywhere
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    plate_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    type: Mapped[VehicleType] = mapped_column(Enum(VehicleType, name="vehicle_type"))
    capacity_kg: Mapped[float] = mapped_column(Float)
    battery_level: Mapped[float | None] = mapped_column(Float)  # only for electric vehicles
    status: Mapped[VehicleStatus] = mapped_column(
        Enum(VehicleStatus, name="vehicle_status"), default=VehicleStatus.available
    )
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    driver: Mapped[User | None] = relationship()


class Parcel(Base):
    __tablename__ = "parcels"

    id: Mapped[int] = mapped_column(primary_key=True)
    tracking_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    receiver_name: Mapped[str] = mapped_column(String(100))
    receiver_phone: Mapped[str] = mapped_column(String(30))
    pickup_address: Mapped[str] = mapped_column(String(255))
    delivery_address: Mapped[str] = mapped_column(String(255))
    weight_kg: Mapped[float] = mapped_column(Float)
    status: Mapped[ParcelStatus] = mapped_column(
        Enum(ParcelStatus, name="parcel_status"), default=ParcelStatus.created, index=True
    )
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"))
    # Where to deliver, dropped as a pin on the booking map; needed for route planning
    delivery_latitude: Mapped[float | None] = mapped_column(Float)
    delivery_longitude: Mapped[float | None] = mapped_column(Float)
    # Position in the vehicle's planned route (1 = first stop), set by the route optimizer
    stop_order: Mapped[int | None] = mapped_column(Integer)
    # Price is fixed at booking time, so later price changes don't alter old parcels
    price_cents: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sender: Mapped[User] = relationship()
    vehicle: Mapped[Vehicle | None] = relationship()
    events: Mapped[list["TrackingEvent"]] = relationship(
        back_populates="parcel", order_by="TrackingEvent.id", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="parcel", order_by="Payment.id", cascade="all, delete-orphan"
    )

    @property
    def paid(self) -> bool:
        return any(payment.status == PaymentStatus.succeeded for payment in self.payments)


class TrackingEvent(Base):
    __tablename__ = "tracking_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    parcel_id: Mapped[int] = mapped_column(ForeignKey("parcels.id", ondelete="CASCADE"), index=True)
    status: Mapped[ParcelStatus] = mapped_column(Enum(ParcelStatus, name="parcel_status"))
    note: Mapped[str | None] = mapped_column(String(255))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    parcel: Mapped[Parcel] = relationship(back_populates="events")


class PaymentStatus(str, enum.Enum):
    succeeded = "succeeded"
    failed = "failed"
    refunded = "refunded"


class Payment(Base):
    """One charge attempt. Failed attempts are kept too, as an audit trail."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    parcel_id: Mapped[int] = mapped_column(ForeignKey("parcels.id", ondelete="CASCADE"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus, name="payment_status"))
    provider: Mapped[str] = mapped_column(String(30))
    provider_ref: Mapped[str] = mapped_column(String(100))
    # Only the brand and last 4 digits are ever stored, never the full card number
    card_brand: Mapped[str | None] = mapped_column(String(20))
    card_last4: Mapped[str | None] = mapped_column(String(4))
    failure_reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    parcel: Mapped[Parcel] = relationship(back_populates="payments")

    @property
    def tracking_id(self) -> str:
        return self.parcel.tracking_id

    @property
    def refundable(self) -> bool:
        # Only before the parcel leaves the depot, or after a failed delivery
        return self.status == PaymentStatus.succeeded and self.parcel.status in (ParcelStatus.created, ParcelStatus.failed)


class PasswordResetToken(Base):
    """Single-use, expiring reset link. Only a hash of the token is stored."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()
