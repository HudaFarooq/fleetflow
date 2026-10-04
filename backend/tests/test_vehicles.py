from app.models import Role


def test_admin_creates_vehicle_and_plate_is_unique(client, make_user):
    _, admin = make_user(Role.admin)
    body = {"plate_number": "ff-9", "type": "ev_van", "capacity_kg": 500, "battery_level": 75}

    response = client.post("/vehicles", json=body, headers=admin)
    assert response.status_code == 201
    assert response.json()["plate_number"] == "FF-9"
    assert client.post("/vehicles", json=body, headers=admin).status_code == 409


def test_vehicle_driver_must_have_driver_role(client, make_user):
    _, admin = make_user(Role.admin)
    customer, _ = make_user(Role.customer)
    body = {"plate_number": "FF-1", "type": "van", "capacity_kg": 500, "driver_id": customer.id}
    assert client.post("/vehicles", json=body, headers=admin).status_code == 422


def test_driver_sees_and_updates_only_own_vehicle(client, make_user):
    _, admin = make_user(Role.admin)
    driver, driver_headers = make_user(Role.driver)
    mine = client.post(
        "/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 500, "driver_id": driver.id},
        headers=admin,
    ).json()
    other = client.post(
        "/vehicles", json={"plate_number": "FF-2", "type": "van", "capacity_kg": 500}, headers=admin
    ).json()

    assert [v["id"] for v in client.get("/vehicles", headers=driver_headers).json()] == [mine["id"]]

    location = {"latitude": 31.52, "longitude": 74.35}
    response = client.patch(f"/vehicles/{mine['id']}/location", json=location, headers=driver_headers)
    assert response.status_code == 200
    assert response.json()["latitude"] == 31.52
    assert client.patch(f"/vehicles/{other['id']}/location", json=location, headers=driver_headers).status_code == 404


def test_invalid_coordinates_are_rejected(client, make_user):
    _, admin = make_user(Role.admin)
    vehicle = client.post(
        "/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 500}, headers=admin
    ).json()
    response = client.patch(
        f"/vehicles/{vehicle['id']}/location", json={"latitude": 200, "longitude": 0}, headers=admin
    )
    assert response.status_code == 422


def test_customers_cannot_view_fleet(client, make_user):
    _, customer = make_user(Role.customer)
    assert client.get("/vehicles", headers=customer).status_code == 403
