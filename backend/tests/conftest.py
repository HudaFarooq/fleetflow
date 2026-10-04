import itertools
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.email import outbox
from app.main import app
from app.routers.auth import login_limiter, reset_limiter
from app.models import Role, User
from app.security import create_access_token, hash_password

# Tests run against a throwaway in-memory SQLite database by default, so they don't need Postgres.
# Set TEST_DATABASE_URL to an empty PostgreSQL database to run the same tests there.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture
def db_session():
    if TEST_DATABASE_URL:
        engine = create_engine(TEST_DATABASE_URL)
        Base.metadata.drop_all(engine)
    else:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()
    if TEST_DATABASE_URL:
        Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    # Rate limits and the email outbox live in memory; start every test clean
    login_limiter.reset()
    reset_limiter.reset()
    outbox.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


TEST_CARD = {"number": "4242 4242 4242 4242", "exp_month": 12, "exp_year": 2099, "cvc": "123"}


def pay(client, parcel_id: int, headers: dict, card: dict = TEST_CARD):
    """Pay for a parcel with the sandbox's always-succeeds test card."""
    return client.post(f"/parcels/{parcel_id}/pay", json=card, headers=headers)


@pytest.fixture
def make_user(db_session):
    """Create a user directly in the database and return (user, auth_headers)."""
    counter = itertools.count()

    def _make(role: Role):
        user = User(
            email=f"{role.value}{next(counter)}@test.dev",
            full_name=f"Test {role.value}",
            hashed_password=hash_password("password123"),
            role=role,
        )
        db_session.add(user)
        db_session.commit()
        token = create_access_token(user.id, user.role.value)
        return user, {"Authorization": f"Bearer {token}"}

    return _make
