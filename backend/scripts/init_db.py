"""Bring the database schema up to date with migrations, and optionally load demo data.

Run from the backend folder:
    python -m scripts.init_db          # migrate only
    python -m scripts.init_db --seed   # migrate + demo users, vehicles and two weeks of parcels

Later schema changes: edit app/models.py, then
    alembic revision --autogenerate -m "describe the change"
    alembic upgrade head
"""

import argparse
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select

from app.config import settings
from app.database import SessionLocal, engine
from app.models import (
    Parcel, ParcelStatus, Payment, PaymentStatus, Role, TrackingEvent, User, Vehicle, VehicleType,
)
from app.payments import quote_cents
from app.routers.parcels import generate_tracking_id
from app.security import hash_password

DEMO_USERS = [
    ("admin@fleetflow.dev", "Demo Admin", "admin12345", Role.admin),
    ("driver@fleetflow.dev", "Demo Driver", "driver12345", Role.driver),
    ("customer@fleetflow.dev", "Demo Customer", "customer12345", Role.customer),
]
EXTRA_USERS = [
    ("usman@fleetflow.dev", "Usman Tariq", Role.driver),
    ("zara@fleetflow.dev", "Zara Iqbal", Role.driver),
    ("shop@fleetflow.dev", "Corner Shop", Role.customer),
    ("pharmacy@fleetflow.dev", "City Pharmacy", Role.customer),
]
RECEIVERS = ["Sara Khan", "Ali Raza", "Ayesha Malik", "Bilal Ahmed", "Hina Shah", "Omar Farooq", "Fatima Noor", "Hamza Ali"]
ADDRESSES = [
    "House 12, Street 4, Gulberg", "Office 3, Mall Road", "Flat 7, Model Town", "Shop 21, Liberty Market",
    "House 5, DHA Phase 5", "Plot 9, Johar Town", "House 44, Garden Town", "Unit 2, Cantt",
]
CITY_CENTRE = (31.52, 74.35)
FLOW = [ParcelStatus.created, ParcelStatus.assigned, ParcelStatus.picked_up, ParcelStatus.in_transit, ParcelStatus.delivered]


def paid_with_test_card(parcel: Parcel, rng: random.Random, refunded: bool = False) -> Payment:
    return Payment(
        amount_cents=parcel.price_cents,
        currency=parcel.currency,
        status=PaymentStatus.refunded if refunded else PaymentStatus.succeeded,
        provider="sandbox",
        provider_ref=f"sbx_ch_seed{rng.randrange(16**8):08x}",
        card_brand="Visa",
        card_last4="4242",
        created_at=parcel.created_at + timedelta(minutes=2),
        refunded_at=parcel.created_at + timedelta(days=1) if refunded else None,
    )


def seed() -> None:
    rng = random.Random(7)  # fixed seed, so the demo looks the same every time
    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == "admin@fleetflow.dev")):
            print("Demo data already exists, skipping.")
            return

        users = {}
        for email, name, password, role in DEMO_USERS:
            users[email] = User(email=email, full_name=name, hashed_password=hash_password(password), role=role)
        for email, name, role in EXTRA_USERS:
            users[email] = User(email=email, full_name=name, hashed_password=hash_password("password123"), role=role)
        db.add_all(users.values())
        db.flush()

        vehicles = [
            Vehicle(plate_number="FF-101", type=VehicleType.van, capacity_kg=800,
                    latitude=31.5204, longitude=74.3587, driver_id=users["driver@fleetflow.dev"].id),
            Vehicle(plate_number="FF-202", type=VehicleType.ev_van, capacity_kg=600, battery_level=82,
                    latitude=31.4826, longitude=74.3218, driver_id=users["usman@fleetflow.dev"].id),
            Vehicle(plate_number="FF-303", type=VehicleType.bike, capacity_kg=20,
                    latitude=31.5497, longitude=74.3436, driver_id=users["zara@fleetflow.dev"].id),
            Vehicle(plate_number="FF-404", type=VehicleType.ev_van, capacity_kg=600, battery_level=34,
                    latitude=31.4697, longitude=74.2728),
        ]
        db.add_all(vehicles)
        db.flush()

        senders = [users[e] for e in ("customer@fleetflow.dev", "shop@fleetflow.dev", "pharmacy@fleetflow.dev")]
        for day in range(13, -1, -1):
            for _ in range(rng.randint(2, 6)):
                booked = now - timedelta(days=day, hours=rng.randint(1, 10), minutes=rng.randint(0, 59))
                # Older parcels are finished; today's are still moving through the steps
                if day >= 2:
                    final = ParcelStatus.failed if rng.random() < 0.08 else ParcelStatus.delivered
                else:
                    final = rng.choice(FLOW)
                vehicle = rng.choice(vehicles[:3])
                weight = round(rng.uniform(0.5, 4 if vehicle.type == VehicleType.bike else 25), 1)
                parcel = Parcel(
                    tracking_id=generate_tracking_id(),
                    sender_id=rng.choice(senders).id,
                    receiver_name=rng.choice(RECEIVERS),
                    receiver_phone=f"+92 300 {rng.randint(1000000, 9999999)}",
                    pickup_address="Warehouse A",
                    delivery_address=rng.choice(ADDRESSES),
                    weight_kg=weight,
                    delivery_latitude=round(CITY_CENTRE[0] + rng.uniform(-0.06, 0.06), 5),
                    delivery_longitude=round(CITY_CENTRE[1] + rng.uniform(-0.07, 0.07), 5),
                    price_cents=quote_cents(weight),
                    currency=settings.currency,
                    status=final,
                    vehicle_id=None if final == ParcelStatus.created else vehicle.id,
                    created_at=booked,
                )
                steps = FLOW[: FLOW.index(final) + 1] if final != ParcelStatus.failed else FLOW[:3] + [ParcelStatus.failed]
                moment = booked
                for step in steps:
                    note = {
                        ParcelStatus.created: "Parcel booked",
                        ParcelStatus.assigned: f"Assigned to vehicle {vehicle.plate_number}",
                        ParcelStatus.failed: "Receiver not available",
                    }.get(step)
                    parcel.events.append(TrackingEvent(status=step, note=note, created_at=moment))
                    moment += timedelta(minutes=rng.randint(15, 140))
                parcel.updated_at = moment
                # Every dispatched parcel was paid for; some failed deliveries were refunded
                if final != ParcelStatus.created:
                    parcel.payments.append(
                        paid_with_test_card(parcel, rng, refunded=final == ParcelStatus.failed and rng.random() < 0.5)
                    )
                db.add(parcel)

        # Fresh bookings: two paid and ready to dispatch, one still waiting for the customer to pay
        fresh = [("Hamza Ali", "Plot 9, Johar Town", 6.5, True), ("Fatima Noor", "Unit 2, Cantt", 1.5, True),
                 ("Omar Farooq", "House 44, Garden Town", 3.0, False)]
        for name, address, weight, is_paid in fresh:
            parcel = Parcel(
                tracking_id=generate_tracking_id(), sender_id=senders[0].id, receiver_name=name,
                receiver_phone="+92 300 1234567", pickup_address="Warehouse B", delivery_address=address,
                weight_kg=weight, price_cents=quote_cents(weight), currency=settings.currency,
                delivery_latitude=round(CITY_CENTRE[0] + rng.uniform(-0.06, 0.06), 5),
                delivery_longitude=round(CITY_CENTRE[1] + rng.uniform(-0.07, 0.07), 5),
                status=ParcelStatus.created, created_at=now - timedelta(minutes=20),
            )
            parcel.events.append(TrackingEvent(status=ParcelStatus.created, note="Parcel booked", created_at=parcel.created_at))
            if is_paid:
                parcel.payments.append(paid_with_test_card(parcel, rng))
            db.add(parcel)
        db.commit()

    print("Demo data created. Logins:")
    for email, _, password, role in DEMO_USERS:
        print(f"  {role.value:<9} {email} / {password}")


def migrate() -> None:
    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    tables = inspect(engine).get_table_names()
    if "users" in tables and "alembic_version" not in tables:
        # Created before migrations existed and already matches the first one, so just record that
        command.stamp(config, "head")
    command.upgrade(config, "head")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true", help="also create demo users, vehicles and parcels")
    args = parser.parse_args()

    migrate()
    print("Database schema is up to date.")
    if args.seed:
        seed()


if __name__ == "__main__":
    main()
