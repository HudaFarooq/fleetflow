"""Account rules shared by the admin user board and self-service account settings."""

from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .config import settings
from .models import Parcel, Role, User, Vehicle
from .schemas import UserCreate
from .security import hash_password

# Seeded by scripts/init_db.py and shown on the login page
DEMO_EMAILS = {"admin@fleetflow.dev", "driver@fleetflow.dev", "customer@fleetflow.dev"}


def is_protected_demo(user: User) -> bool:
    return settings.demo_mode and user.email in DEMO_EMAILS


def ensure_not_demo(user: User) -> None:
    """In demo mode, visitors share the demo logins, so nobody may lock the others out."""
    if is_protected_demo(user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This is a shared demo account, so it can't be changed. Create your own account to try this.",
        )


def ensure_email_free(db: Session, email: str, exclude_user_id: int | None = None) -> None:
    query = select(User).where(User.email == email)
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)
    if db.scalar(query):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")


def create_user(db: Session, data: UserCreate, role: Role) -> User:
    email = data.email.lower()
    ensure_email_free(db, email)
    user = User(email=email, full_name=data.full_name, hashed_password=hash_password(data.password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def is_last_active_admin(db: Session, user: User) -> bool:
    if user.role != Role.admin or not user.is_active:
        return False
    active_admins = db.scalar(select(func.count(User.id)).where(User.role == Role.admin, User.is_active))
    return active_admins <= 1


def has_parcels(db: Session, user: User) -> bool:
    return bool(db.scalar(select(func.count(Parcel.id)).where(Parcel.sender_id == user.id)))


def delete_user(db: Session, user: User) -> None:
    # Free up any vehicle this person was driving
    db.execute(update(Vehicle).where(Vehicle.driver_id == user.id).values(driver_id=None))
    db.delete(user)
    db.commit()


def close_own_account(db: Session, user: User) -> Literal["deleted", "deactivated"]:
    """A user closing their own account. Delivery history must survive, so senders are deactivated."""
    if is_last_active_admin(db, user):
        raise HTTPException(status.HTTP_409_CONFLICT, "You're the only admin. Make someone else an admin first.")
    if has_parcels(db, user):
        user.is_active = False
        user.token_version += 1
        db.commit()
        return "deactivated"
    delete_user(db, user)
    return "deleted"
