import pytest

from app.models import Role

NEW_USER = {"email": "new@example.com", "full_name": "New Person", "password": "password123", "role": "driver"}


def login(client, email, password="password123"):
    return client.post("/auth/login", data={"username": email, "password": password})


@pytest.fixture
def admin(make_user):
    return make_user(Role.admin)


def test_admin_crud_cycle(client, admin):
    _, headers = admin

    created = client.post("/users", json=NEW_USER, headers=headers).json()
    assert created["role"] == "driver" and created["is_active"] is True

    assert client.get(f"/users/{created['id']}", headers=headers).json()["email"] == "new@example.com"

    updated = client.patch(f"/users/{created['id']}", json={"full_name": "Renamed", "role": "customer"}, headers=headers)
    assert updated.json()["full_name"] == "Renamed"
    assert updated.json()["role"] == "customer"

    assert client.delete(f"/users/{created['id']}", headers=headers).status_code == 204
    assert client.get(f"/users/{created['id']}", headers=headers).status_code == 404


def test_list_filters_and_search(client, admin, make_user):
    _, headers = admin
    make_user(Role.driver)
    make_user(Role.customer)

    assert [u["role"] for u in client.get("/users?role=driver", headers=headers).json()] == ["driver"]
    assert len(client.get("/users?search=customer", headers=headers).json()) == 1
    assert len(client.get("/users?active=false", headers=headers).json()) == 0


def test_non_admins_cannot_manage_users(client, make_user):
    target, _ = make_user(Role.customer)
    _, driver_headers = make_user(Role.driver)
    assert client.get("/users", headers=driver_headers).status_code == 403
    assert client.delete(f"/users/{target.id}", headers=driver_headers).status_code == 403


def test_deactivated_user_is_signed_out_and_cannot_log_in(client, admin):
    _, headers = admin
    user = client.post("/users", json=NEW_USER, headers=headers).json()
    token = login(client, NEW_USER["email"]).json()["access_token"]
    user_headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/auth/me", headers=user_headers).status_code == 200

    client.patch(f"/users/{user['id']}", json={"is_active": False}, headers=headers)

    assert client.get("/auth/me", headers=user_headers).status_code == 401
    assert login(client, NEW_USER["email"]).status_code == 403

    client.patch(f"/users/{user['id']}", json={"is_active": True}, headers=headers)
    assert login(client, NEW_USER["email"]).status_code == 200


def test_password_reset_and_revoke_sessions_end_old_tokens(client, admin):
    _, headers = admin
    user = client.post("/users", json=NEW_USER, headers=headers).json()
    old = {"Authorization": f"Bearer {login(client, NEW_USER['email']).json()['access_token']}"}

    client.patch(f"/users/{user['id']}", json={"password": "brand-new-pass"}, headers=headers)
    assert client.get("/auth/me", headers=old).status_code == 401
    assert login(client, NEW_USER["email"]).status_code == 401
    fresh = {"Authorization": f"Bearer {login(client, NEW_USER['email'], 'brand-new-pass').json()['access_token']}"}
    assert client.get("/auth/me", headers=fresh).status_code == 200

    client.post(f"/users/{user['id']}/revoke-sessions", headers=headers)
    assert client.get("/auth/me", headers=fresh).status_code == 401


def test_admin_cannot_lock_themselves_out(client, admin):
    me, headers = admin
    assert client.patch(f"/users/{me.id}", json={"role": "customer"}, headers=headers).status_code == 409
    assert client.patch(f"/users/{me.id}", json={"is_active": False}, headers=headers).status_code == 409
    assert client.delete(f"/users/{me.id}", headers=headers).status_code == 409
    # Harmless self-edits are fine
    assert client.patch(f"/users/{me.id}", json={"full_name": "Still Admin"}, headers=headers).status_code == 200


def test_email_must_stay_unique(client, admin, make_user):
    _, headers = admin
    other, _ = make_user(Role.customer)
    user = client.post("/users", json=NEW_USER, headers=headers).json()
    response = client.patch(f"/users/{user['id']}", json={"email": other.email.upper()}, headers=headers)
    assert response.status_code == 409


def test_cannot_delete_user_with_parcels(client, admin, make_user):
    _, admin_headers = admin
    customer, customer_headers = make_user(Role.customer)
    client.post(
        "/parcels",
        json={"receiver_name": "A", "receiver_phone": "12345", "pickup_address": "X", "delivery_address": "Y", "weight_kg": 1},
        headers=customer_headers,
    )
    response = client.delete(f"/users/{customer.id}", headers=admin_headers)
    assert response.status_code == 409
    assert "Deactivate" in response.json()["detail"]


def test_deleting_driver_frees_their_vehicle(client, admin, make_user):
    _, headers = admin
    driver, _ = make_user(Role.driver)
    vehicle = client.post(
        "/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 100, "driver_id": driver.id}, headers=headers
    ).json()

    assert client.delete(f"/users/{driver.id}", headers=headers).status_code == 204
    assert client.get(f"/vehicles/{vehicle['id']}", headers=headers).json()["driver_id"] is None
