from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..config import settings
from ..deps import AdminUser, CurrentUser, DbSession
from ..email import send_email
from ..models import Parcel, ParcelStatus, Payment, PaymentStatus, Role
from ..payments import get_provider, quote_cents
from ..payments.base import CardDetails
from ..realtime import publish_parcel
from ..schemas import CardInput, PaymentOut, Quote
from .parcels import get_parcel_for_user

router = APIRouter(tags=["payments"])

def format_money(cents: int, currency: str) -> str:
    return f"{currency} {cents / 100:,.2f}"


@router.get("/pricing/quote", response_model=Quote)
def quote(weight_kg: float = Query(gt=0, le=1000)):
    return Quote(weight_kg=weight_kg, amount_cents=quote_cents(weight_kg), currency=settings.currency)


@router.post("/parcels/{parcel_id}/pay", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def pay_for_parcel(parcel_id: int, card: CardInput, db: DbSession, user: CurrentUser):
    if user.role == Role.driver:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role is not allowed to do this")
    parcel = get_parcel_for_user(db, parcel_id, user)
    if parcel.paid:
        raise HTTPException(status.HTTP_409_CONFLICT, "This parcel is already paid for")
    if parcel.status == ParcelStatus.failed:
        raise HTTPException(status.HTTP_409_CONFLICT, "This delivery failed, so it can't be paid for")

    provider = get_provider()
    result = provider.charge(
        parcel.price_cents,
        parcel.currency,
        CardDetails(number=card.number, exp_month=card.exp_month, exp_year=card.exp_year, cvc=card.cvc),
        description=f"FleetFlow delivery {parcel.tracking_id}",
    )
    payment = Payment(
        parcel=parcel,
        amount_cents=parcel.price_cents,
        currency=parcel.currency,
        status=PaymentStatus.succeeded if result.ok else PaymentStatus.failed,
        provider=provider.name,
        provider_ref=result.provider_ref,
        card_brand=result.card_brand,
        card_last4=result.card_last4,
        failure_reason=result.failure_reason,
    )
    db.add(payment)
    db.commit()  # failed attempts are saved too, before we report the error

    if not result.ok:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, result.failure_reason or "Payment failed")

    db.refresh(payment)
    publish_parcel(parcel)  # the dispatcher's "awaiting payment" badge clears live
    send_email(
        parcel.sender.email,
        f"Receipt for {parcel.tracking_id}",
        f"Thanks for shipping with FleetFlow.\n\n"
        f"Parcel: {parcel.tracking_id}\nTo: {parcel.receiver_name}, {parcel.delivery_address}\n"
        f"Amount: {format_money(payment.amount_cents, payment.currency)}\n"
        f"Paid with: {payment.card_brand} ending {payment.card_last4}\n\n"
        f"Track it any time: {settings.frontend_url}/track/{parcel.tracking_id}",
    )
    return payment


@router.get("/payments", response_model=list[PaymentOut])
def list_payments(db: DbSession, user: CurrentUser):
    """Admins see every payment; customers see payments for their own parcels."""
    if user.role == Role.driver:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role is not allowed to do this")
    query = select(Payment).join(Parcel).options(selectinload(Payment.parcel)).order_by(Payment.created_at.desc(), Payment.id.desc())
    if user.role == Role.customer:
        query = query.where(Parcel.sender_id == user.id)
    return db.scalars(query).all()


@router.post("/payments/{payment_id}/refund", response_model=PaymentOut)
def refund_payment(payment_id: int, db: DbSession, _: AdminUser):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    if payment.status != PaymentStatus.succeeded:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only successful payments can be refunded")
    if not payment.refundable:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Refunds are only possible before the parcel is dispatched, or after a failed delivery",
        )
    if not get_provider().refund(payment.provider_ref, payment.amount_cents):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The payment provider rejected the refund")

    payment.status = PaymentStatus.refunded
    payment.refunded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(payment)
    send_email(
        payment.parcel.sender.email,
        f"Refund for {payment.parcel.tracking_id}",
        f"We've refunded {format_money(payment.amount_cents, payment.currency)} to your "
        f"{payment.card_brand} ending {payment.card_last4}. It can take a few days to appear.",
    )
    return payment
