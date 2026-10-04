import pytest
from pydantic import ValidationError

from app.config import Settings, settings
from app.models import Role, User
from app.security import create_access_token, hash_password


def test_hosting_provider_urls_get_the_psycopg_driver():
    for url in ("postgres://u:p@host/db?sslmode=require", "postgresql://u:p@host/db?sslmode=require"):
        assert Settings(database_url=url).database_url == "postgresql+psycopg://u:p@host/db?sslmode=require"
    assert Settings(database_url="sqlite:///x.db").database_url == "sqlite:///x.db"


def test_production_refuses_unsafe_settings():
    good = {"environment": "production", "jwt_secret": "x" * 40, "database_url": "postgresql://u:p@h/db"}
    Settings(**good)  # fine
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(**good | {"jwt_secret": "short"})
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(**good | {"database_url": "sqlite:///demo.db"})


@pytest.fixture
def demo(client, db_session, make_user, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", True)
    demo_admin = User(email="admin@fleetflow.dev", full_name="Demo Admin", hashed_password=hash_password("admin12345"), role=Role.admin)
    db_session.add(demo_admin)
    db_session.commit()
    headers = {"Authorization": f"Bearer {create_access_token(demo_admin.id, 'admin', 0)}"}
    return demo_admin, headers


def test_demo_accounts_cannot_be_changed_or_locked(client, demo, make_user):
    demo_admin, headers = demo
    attempts = [
        ("PATCH", "/auth/me", {"full_name": "Hacked"}),
        ("POST", "/auth/me/password", {"current_password": "admin12345", "new_password": "takeover123"}),
        ("POST", "/auth/me/sign-out-everywhere", None),
        ("DELETE", "/auth/me", {"password": "admin12345"}),
        ("PATCH", f"/users/{demo_admin.id}", {"is_active": False}),
        ("POST", f"/users/{demo_admin.id}/revoke-sessions", None),
        ("DELETE", f"/users/{demo_admin.id}", None),
    ]
    for method, url, body in attempts:
        response = client.request(method, url, json=body, headers=headers)
        assert response.status_code == 403, (method, url, response.status_code)
        assert "shared demo account" in response.json()["detail"]

    # Still logs in normally, and no reset email is sent for it
    assert client.post("/auth/login", data={"username": "admin@fleetflow.dev", "password": "admin12345"}).status_code == 200
    from app.email import outbox
    client.post("/auth/forgot-password", json={"email": "admin@fleetflow.dev"})
    assert outbox == []


def test_demo_mode_leaves_other_accounts_alone(client, demo, make_user):
    _, headers = demo
    other, other_headers = make_user(Role.customer)
    assert client.patch("/auth/me", json={"full_name": "Renamed"}, headers=other_headers).status_code == 200
    assert client.patch(f"/users/{other.id}", json={"full_name": "By admin"}, headers=headers).status_code == 200
