import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, update

from ..accounts import close_own_account, create_user, ensure_email_free, ensure_not_demo, is_protected_demo
from ..config import settings
from ..deps import CurrentUser, DbSession
from ..email import send_email
from ..models import PasswordResetToken, Role, User, as_utc
from ..rate_limit import AttemptLimiter
from ..schemas import (
    AccountDeleted, ForgotPassword, Message, PasswordChange, PasswordConfirm, ProfileUpdate, ResetPassword,
    Token, UserCreate, UserOut,
)
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

login_limiter = AttemptLimiter(settings.login_max_attempts, settings.login_lockout_minutes * 60)
# Caps reset emails per address, so the endpoint can't be used to flood someone's inbox
reset_limiter = AttemptLimiter(3, 60 * 60)


def issue_token(user: User) -> Token:
    return Token(access_token=create_access_token(user.id, user.role.value, user.token_version))


def too_many_attempts(seconds: int) -> HTTPException:
    minutes = max(1, round(seconds / 60))
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"Too many attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        headers={"Retry-After": str(seconds)},
    )


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: DbSession):
    """Public sign-up. Always creates a customer; admins create drivers and other admins."""
    return create_user(db, data, Role.customer)


@router.post("/login", response_model=Token)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession, request: Request):
    email = form.username.lower()
    # Keyed by email and IP: stops guessing, without letting a stranger lock you out from anywhere
    key = f"{email}|{request.client.host if request.client else '-'}"
    if wait := login_limiter.retry_after(key):
        raise too_many_attempts(wait)

    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(form.password, user.hashed_password):
        login_limiter.record(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated. Contact your admin.")
    login_limiter.clear(key)
    return issue_token(user)


@router.post("/forgot-password", response_model=Message, status_code=status.HTTP_202_ACCEPTED)
def forgot_password(data: ForgotPassword, db: DbSession):
    # Same answer whether or not the account exists, so this can't be used to discover emails
    response = Message(detail="If an account exists for that email, we've sent a link to reset the password.")
    email = data.email.lower()
    if reset_limiter.retry_after(email):
        return response
    reset_limiter.record(email)

    user = db.scalar(select(User).where(User.email == email, User.is_active))
    if user is None or is_protected_demo(user):
        return response

    now = datetime.now(timezone.utc)
    # Only the newest link works
    db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=hash_reset_token(token),
        expires_at=now + timedelta(minutes=settings.password_reset_minutes),
    ))
    db.commit()

    link = f"{settings.frontend_url}/reset-password?token={token}"
    send_email(
        user.email,
        "Reset your FleetFlow password",
        f"Hi {user.full_name},\n\nSomeone asked to reset your FleetFlow password. If it was you, open this link "
        f"within {settings.password_reset_minutes} minutes:\n\n{link}\n\nIf it wasn't you, ignore this email; "
        "your password stays the same.",
    )
    return response


@router.post("/reset-password", response_model=Message)
def reset_password(data: ResetPassword, db: DbSession):
    record = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_reset_token(data.token)))
    now = datetime.now(timezone.utc)
    usable = record is not None and record.used_at is None and as_utc(record.expires_at) > now and record.user.is_active
    if not usable:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired. Request a new one.")

    user = record.user
    user.hashed_password = hash_password(data.password)
    user.token_version += 1  # signs out every existing session
    record.used_at = now
    db.commit()
    return Message(detail="Password updated. You can now log in with your new password.")


# --- The logged-in user's own account ---

@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: ProfileUpdate, db: DbSession, user: CurrentUser):
    ensure_not_demo(user)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if "email" in changes:
        changes["email"] = changes["email"].lower()
        ensure_email_free(db, changes["email"], exclude_user_id=user.id)
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/password", response_model=Token)
def change_password(data: PasswordChange, db: DbSession, user: CurrentUser):
    """Changes the password and signs out other devices. Returns a fresh token for this one."""
    ensure_not_demo(user)
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is incorrect")
    user.hashed_password = hash_password(data.new_password)
    user.token_version += 1
    db.commit()
    return issue_token(user)


@router.post("/me/sign-out-everywhere", status_code=status.HTTP_204_NO_CONTENT)
def sign_out_everywhere(db: DbSession, user: CurrentUser):
    ensure_not_demo(user)  # would sign out every other visitor using the demo login
    user.token_version += 1
    db.commit()


@router.delete("/me", response_model=AccountDeleted)
def delete_me(data: PasswordConfirm, db: DbSession, user: CurrentUser):
    ensure_not_demo(user)
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your password is incorrect")
    return AccountDeleted(result=close_own_account(db, user))
