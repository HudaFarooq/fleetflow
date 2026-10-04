import pytest

from app.models import Role
from tests.conftest import pay

PARCEL = {
    "receiver_name": "Sara Khan",
    "receiver_phone": "+92 300 1234567",
    "pickup_address": "Warehouse A",
    "delivery_address": "House 12, Street 4",
    "weight_kg": 5,
}


@pytest.fixture
def fleet(client, make_user):
    """An admin, a customer, a driver, and a 100 kg van driven by that driver."""
    _, admin = make_user(Role.admin)
    _, customer = make_user(Role.customer)
    driver_user, driver = make_user(Role.driver)
    response = client.post(
        "/vehicles",
        json={"plate_number": "ff-1", "type": "van", "capacity_kg": 100, "driver_id": driver_user.id},
        headers=admin,
    )
    assert response.status_code == 201
    return {"admin": admin, "customer": customer, "driver": driver, "vehicle_id": response.json()["id"]}


def create_parcel(client, headers, paid=True, **overrides):
    response = client.post("/parcels", json={**PARCEL, **overrides}, headers=headers)
    assert response.status_code == 201
    parcel = response.json()
    if paid:
        assert pay(client, parcel["id"], headers).status_code == 201
    return parcel


def test_full_delivery_flow(client, fleet):
    parcel = create_parcel(client, fleet["customer"])
    assert parcel["tracking_id"].startswith("FF")
    assert parcel["status"] == "created"

    response = client.post(
        f"/parcels/{parcel['id']}/assign", json={"vehicle_id": fleet["vehicle_id"]}, headers=fleet["admin"]
    )
    assert response.json()["status"] == "assigned"

    for next_status in ("picked_up", "in_transit", "delivered"):
        response = client.post(
            f"/parcels/{parcel['id']}/status", json={"status": next_status}, headers=fleet["driver"]
        )
        assert response.status_code == 200, response.json()

    # Public tracking works without login, uses any letter case, and hides private details
    response = client.get(f"/track/{parcel['tracking_id'].lower()}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "delivered"
    assert [e["status"] for e in body["events"]] == [
        "created", "assigned", "picked_up", "in_transit", "delivered",
    ]
    assert "receiver_phone" not in body


def test_cannot_skip_statuses(client, fleet):
    parcel = create_parcel(client, fleet["customer"])
    client.post(f"/parcels/{parcel['id']}/assign", json={"vehicle_id": fleet["vehicle_id"]}, headers=fleet["admin"])

    response = client.post(f"/parcels/{parcel['id']}/status", json={"status": "delivered"}, headers=fleet["driver"])
    assert response.status_code == 409


def test_vehicle_capacity_is_enforced(client, fleet):
    first = create_parcel(client, fleet["customer"], weight_kg=70)
    second = create_parcel(client, fleet["customer"], weight_kg=40)
    assign = lambda p: client.post(
        f"/parcels/{p['id']}/assign", json={"vehicle_id": fleet["vehicle_id"]}, headers=fleet["admin"]
    )

    assert assign(first).status_code == 200
    response = assign(second)
    assert response.status_code == 409
    assert "30.0 kg free" in response.json()["detail"]


def test_customers_only_see_their_own_parcels(client, fleet, make_user):
    parcel = create_parcel(client, fleet["customer"])
    _, other_customer = make_user(Role.customer)

    assert client.get(f"/parcels/{parcel['id']}", headers=other_customer).status_code == 404
    assert client.get("/parcels", headers=other_customer).json() == []
    assert len(client.get("/parcels", headers=fleet["customer"]).json()) == 1


def test_other_drivers_cannot_update_parcel(client, fleet, make_user):
    parcel = create_parcel(client, fleet["customer"])
    client.post(f"/parcels/{parcel['id']}/assign", json={"vehicle_id": fleet["vehicle_id"]}, headers=fleet["admin"])
    _, other_driver = make_user(Role.driver)

    response = client.post(f"/parcels/{parcel['id']}/status", json={"status": "picked_up"}, headers=other_driver)
    assert response.status_code == 404


def test_customers_cannot_assign_parcels(client, fleet):
    parcel = create_parcel(client, fleet["customer"])
    response = client.post(
        f"/parcels/{parcel['id']}/assign", json={"vehicle_id": fleet["vehicle_id"]}, headers=fleet["customer"]
    )
    assert response.status_code == 403


def test_unknown_tracking_id_returns_404(client):
    assert client.get("/track/FFDOESNOTEXIST").status_code == 404
