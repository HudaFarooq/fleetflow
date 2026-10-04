import re

from app.email import outbox
from app.models import Role

ACCOUNT = {"email": "me@example.com", "full_name": "Me", "password": "password123"}


def register_and_login(client, account=ACCOUNT):
    client.post("/auth/register", json=account)
    token = client.post("/auth/login", data={"username": account["email"], "password": account["password"]}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def login(client, email, password):
    return client.post("/auth/login", data={"username": email, "password": password})


# --- Profile ---

def test_update_own_profile(client, make_user):
    headers = register_and_login(client)
    other, _ = make_user(Role.customer)

    response = client.patch("/auth/me", json={"full_name": "New Name", "email": "NEW@example.com"}, headers=headers)
    assert response.json()["full_name"] == "New Name"
    assert response.json()["email"] == "new@example.com"
    assert client.patch("/auth/me", json={"email": other.email}, headers=headers).status_code == 409
    # Role can't be changed this way
    client.patch("/auth/me", json={"role": "admin"}, headers=headers)
    assert client.get("/auth/me", headers=headers).json()["role"] == "customer"


def test_change_password_keeps_this_device_and_signs_out_others(client):
    device_a = register_and_login(client)
    device_b = register_and_login(client)

    wrong = client.post("/auth/me/password", json={"current_password": "nope", "new_password": "newpassword1"}, headers=device_a)
    assert wrong.status_code == 400

    response = client.post(
        "/auth/me/password", json={"current_password": "password123", "new_password": "newpassword1"}, headers=device_a
    )
    fresh = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.get("/auth/me", headers=fresh).status_code == 200
    assert client.get("/auth/me", headers=device_b).status_code == 401
    assert login(client, ACCOUNT["email"], "newpassword1").status_code == 200


def test_sign_out_everywhere(client):
    headers = register_and_login(client)
    assert client.post("/auth/me/sign-out-everywhere", headers=headers).status_code == 204
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_delete_own_account(client):
    headers = register_and_login(client)
    assert client.request("DELETE", "/auth/me", json={"password": "wrong"}, headers=headers).status_code == 400
    response = client.request("DELETE", "/auth/me", json={"password": "password123"}, headers=headers)
    assert response.json() == {"result": "deleted"}
    assert login(client, ACCOUNT["email"], ACCOUNT["password"]).status_code == 401


def test_account_with_parcels_is_deactivated_not_deleted(client):
    headers = register_and_login(client)
    client.post(
        "/parcels",
        json={"receiver_name": "A", "receiver_phone": "12345", "pickup_address": "X", "delivery_address": "Y", "weight_kg": 1},
        headers=headers,
    )
    response = client.request("DELETE", "/auth/me", json={"password": "password123"}, headers=headers)
    assert response.json() == {"result": "deactivated"}
    assert login(client, ACCOUNT["email"], ACCOUNT["password"]).status_code == 403


def test_only_admin_cannot_close_account(client, make_user):
    admin, headers = make_user(Role.admin)
    response = client.request("DELETE", "/auth/me", json={"password": "password123"}, headers=headers)
    assert response.status_code == 409


# --- Login protection ---

def test_login_locks_after_repeated_failures(client):
    client.post("/auth/register", json=ACCOUNT)
    for _ in range(5):
        assert login(client, ACCOUNT["email"], "wrong-password").status_code == 401
    locked = login(client, ACCOUNT["email"], ACCOUNT["password"])
    assert locked.status_code == 429
    assert "Try again in 15 minutes" in locked.json()["detail"]
    assert int(locked.headers["Retry-After"]) > 0


def test_successful_login_resets_failure_count(client):
    client.post("/auth/register", json=ACCOUNT)
    for _ in range(4):
        login(client, ACCOUNT["email"], "wrong-password")
    assert login(client, ACCOUNT["email"], ACCOUNT["password"]).status_code == 200
    for _ in range(4):
        login(client, ACCOUNT["email"], "wrong-password")
    assert login(client, ACCOUNT["email"], ACCOUNT["password"]).status_code == 200


# --- Forgot / reset password ---

def reset_token_from_email() -> str:
    return re.search(r"token=([\w-]+)", outbox[-1].text).group(1)


def test_password_reset_flow(client):
    old_session = register_and_login(client)
    response = client.post("/auth/forgot-password", json={"email": "ME@example.com"})
    assert response.status_code == 202
    assert outbox[-1].to == "me@example.com"
    token = reset_token_from_email()

    assert client.post("/auth/reset-password", json={"token": token, "password": "short"}).status_code == 422
    assert client.post("/auth/reset-password", json={"token": token, "password": "brandnewpass"}).status_code == 200
    assert login(client, ACCOUNT["email"], "brandnewpass").status_code == 200
    assert client.get("/auth/me", headers=old_session).status_code == 401  # old sessions end

    # Links are single-use
    assert client.post("/auth/reset-password", json={"token": token, "password": "anotherpass1"}).status_code == 400


def test_unknown_email_gets_same_answer_and_no_email(client):
    response = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 202
    assert "If an account exists" in response.json()["detail"]
    assert outbox == []


def test_only_newest_reset_link_works(client):
    client.post("/auth/register", json=ACCOUNT)
    client.post("/auth/forgot-password", json={"email": ACCOUNT["email"]})
    first = reset_token_from_email()
    client.post("/auth/forgot-password", json={"email": ACCOUNT["email"]})
    second = reset_token_from_email()

    assert client.post("/auth/reset-password", json={"token": first, "password": "brandnewpass"}).status_code == 400
    assert client.post("/auth/reset-password", json={"token": second, "password": "brandnewpass"}).status_code == 200


def test_expired_reset_link_is_rejected(client, db_session):
    from datetime import datetime, timedelta, timezone

    from app.models import PasswordResetToken

    client.post("/auth/register", json=ACCOUNT)
    client.post("/auth/forgot-password", json={"email": ACCOUNT["email"]})
    token = reset_token_from_email()
    record = db_session.query(PasswordResetToken).one()
    record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    assert client.post("/auth/reset-password", json={"token": token, "password": "brandnewpass"}).status_code == 400


def test_reset_emails_are_capped_per_address(client):
    client.post("/auth/register", json=ACCOUNT)
    for _ in range(5):
        client.post("/auth/forgot-password", json={"email": ACCOUNT["email"]})
    assert len(outbox) == 3
