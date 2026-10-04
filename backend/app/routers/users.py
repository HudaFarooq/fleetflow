"""Admin-only user management: create, list, view, edit, deactivate, sign out and delete users."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..accounts import (
    create_user, delete_user as remove_user, ensure_email_free, ensure_not_demo, has_parcels, is_last_active_admin,
)
from ..deps import AdminUser, DbSession
from ..models import Role, User
from ..schemas import AdminUserCreate, AdminUserUpdate, UserOut
from ..security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user_as_admin(data: AdminUserCreate, db: DbSession, _: AdminUser):
    return create_user(db, data, data.role)


@router.get("", response_model=list[UserOut])
def list_users(
    db: DbSession,
    _: AdminUser,
    role: Role | None = None,
    active: bool | None = None,
    search: str | None = None,
):
    query = select(User).order_by(User.id)
    if role:
        query = query.where(User.role == role)
    if active is not None:
        query = query.where(User.is_active == active)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    return db.scalars(query).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: DbSession, _: AdminUser):
    return get_user_or_404(db, user_id)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: AdminUserUpdate, db: DbSession, admin: AdminUser):
    user = get_user_or_404(db, user_id)
    ensure_not_demo(user)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)

    removes_admin_access = changes.get("is_active") is False or changes.get("role", Role.admin) != Role.admin
    if user.role == Role.admin and removes_admin_access:
        if user.id == admin.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "You can't remove your own admin access")
        if is_last_active_admin(db, user):
            raise HTTPException(status.HTTP_409_CONFLICT, "There must always be at least one active admin")

    if "email" in changes:
        changes["email"] = changes["email"].lower()
        ensure_email_free(db, changes["email"], exclude_user_id=user.id)

    # Role, password and deactivation changes take effect immediately on every device
    revoke_sessions = (
        ("role" in changes and changes["role"] != user.role)
        or "password" in changes
        or changes.get("is_active") is False
    )

    if "password" in changes:
        user.hashed_password = hash_password(changes.pop("password"))
    for field, value in changes.items():
        setattr(user, field, value)
    if revoke_sessions:
        user.token_version += 1

    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/revoke-sessions", response_model=UserOut)
def revoke_sessions(user_id: int, db: DbSession, _: AdminUser):
    """Sign the user out of every device. They can log in again with their password."""
    user = get_user_or_404(db, user_id)
    ensure_not_demo(user)
    user.token_version += 1
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: DbSession, admin: AdminUser):
    user = get_user_or_404(db, user_id)
    ensure_not_demo(user)
    if user.id == admin.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You can't delete your own account")
    if is_last_active_admin(db, user):
        raise HTTPException(status.HTTP_409_CONFLICT, "There must always be at least one active admin")
    if has_parcels(db, user):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This user has parcels on record. Deactivate the account instead, so the delivery history stays intact.",
        )

    remove_user(db, user)
