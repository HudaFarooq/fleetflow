from contextlib import nullcontext

import pytest
from starlette.websockets import WebSocketDisconnect

from app import database
from app.models import Role, Vehicle, VehicleStatus
from app.security import create_access_token
from app.simulator import FleetSimulator
from tests.conftest import pay

PARCEL = {"receiver_name": "A", "receiver_phone": "12345", "pickup_address": "X", "delivery_address": "Y", "weight_kg": 2}


@pytest.fixture(autouse=True)
def shared_session(monkeypatch, db_session):
    """The WebSocket and simulator open their own sessions; point them at the test database."""
    monkeypatch.setattr(database, "SessionLocal", lambda: nullcontext(db_session))


def token_for(user) -> str:
    return create_access_token(user.id, user.role.value, user.token_version)


def test_socket_rejects_missing_bad_and_customer_tokens(client, make_user):
    customer, _ = make_user(Role.customer)
    for first_message in ({}, {"token": "garbage"}, {"token": token_for(customer)}, ["not", "an", "object"]):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/fleet") as socket:
                socket.send_json(first_message)
                socket.receive_json()


def test_admin_receives_live_vehicle_and_parcel_updates(client, make_user):
    admin, admin_headers = make_user(Role.admin)
    driver, driver_headers = make_user(Role.driver)
    vehicle = client.post(
        "/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 100, "driver_id": driver.id},
        headers=admin_headers,
    ).json()

    with client.websocket_connect("/ws/fleet") as socket:
        socket.send_json({"token": token_for(admin)})
        assert socket.receive_json() == {"type": "hello", "simulation": False}

        client.patch(f"/vehicles/{vehicle['id']}/location", json={"latitude": 31.5, "longitude": 74.3}, headers=driver_headers)
        message = socket.receive_json()
        assert message["type"] == "vehicle"
        assert (message["vehicle"]["latitude"], message["vehicle"]["longitude"]) == (31.5, 74.3)

        parcel = client.post("/parcels", json=PARCEL, headers=admin_headers).json()
        assert socket.receive_json()["type"] == "parcel"
        pay(client, parcel["id"], admin_headers)
        assert socket.receive_json() == {
            "type": "parcel", "parcel_id": parcel["id"], "tracking_id": parcel["tracking_id"],
            "status": "created", "vehicle_id": None,
        }


def test_drivers_only_receive_their_own_vehicle(client, make_user):
    _, admin = make_user(Role.admin)
    driver, driver_headers = make_user(Role.driver)
    other_driver, other_headers = make_user(Role.driver)
    mine = client.post(
        "/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 100, "driver_id": driver.id}, headers=admin
    ).json()
    theirs = client.post(
        "/vehicles", json={"plate_number": "FF-2", "type": "van", "capacity_kg": 100, "driver_id": other_driver.id},
        headers=admin,
    ).json()

    with client.websocket_connect("/ws/fleet") as socket:
        socket.send_json({"token": token_for(driver)})
        socket.receive_json()  # hello
        client.patch(f"/vehicles/{theirs['id']}/location", json={"latitude": 1, "longitude": 1}, headers=other_headers)
        client.patch(f"/vehicles/{mine['id']}/location", json={"latitude": 2, "longitude": 2}, headers=driver_headers)
        # The first message to arrive is our own vehicle; the other driver's update was never sent
        assert socket.receive_json()["vehicle"]["plate_number"] == "FF-1"


def test_vehicle_goes_on_route_while_carrying_parcels(client, make_user):
    _, admin = make_user(Role.admin)
    driver, driver_headers = make_user(Role.driver)
    vehicle = client.post(
        "/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 100, "driver_id": driver.id},
        headers=admin,
    ).json()
    parcel = client.post("/parcels", json=PARCEL, headers=admin).json()
    pay(client, parcel["id"], admin)
    client.post(f"/parcels/{parcel['id']}/assign", json={"vehicle_id": vehicle["id"]}, headers=admin)

    status_of = lambda: client.get(f"/vehicles/{vehicle['id']}", headers=admin).json()["status"]
    assert status_of() == "available"  # assigned, but still at the depot
    client.post(f"/parcels/{parcel['id']}/status", json={"status": "picked_up"}, headers=driver_headers)
    assert status_of() == "on_route"
    client.post(f"/parcels/{parcel['id']}/status", json={"status": "in_transit"}, headers=driver_headers)
    client.post(f"/parcels/{parcel['id']}/status", json={"status": "delivered"}, headers=driver_headers)
    assert status_of() == "available"


def test_simulator_moves_vehicles_and_manages_ev_batteries(db_session):
    van = Vehicle(plate_number="FF-1", type="van", capacity_kg=100, latitude=31.5, longitude=74.3)
    low_ev = Vehicle(plate_number="FF-2", type="ev_van", capacity_kg=100, battery_level=15.2, latitude=31.6, longitude=74.4)
    parked = Vehicle(plate_number="FF-3", type="van", capacity_kg=100, latitude=31.4, longitude=74.2,
                     status=VehicleStatus.maintenance)
    db_session.add_all([van, low_ev, parked])
    db_session.commit()

    simulator = FleetSimulator()
    simulator.tick()

    assert (van.latitude, van.longitude) != (31.5, 74.3)
    assert (parked.latitude, parked.longitude) == (31.4, 74.2)
    assert low_ev.status == VehicleStatus.charging  # dropped to the low-battery threshold
    stopped_at = (low_ev.latitude, low_ev.longitude)

    for _ in range(20):
        simulator.tick()
    assert low_ev.battery_level >= 90
    assert low_ev.status == VehicleStatus.available
    assert (low_ev.latitude, low_ev.longitude) != stopped_at  # moving again


def test_stopping_the_simulation_unplugs_charging_vans(client, make_user, db_session):
    _, admin = make_user(Role.admin)
    ev = Vehicle(plate_number="FF-9", type="ev_van", capacity_kg=100, battery_level=50, latitude=31.5, longitude=74.3,
                 status=VehicleStatus.charging)
    db_session.add(ev)
    db_session.commit()
    client.post("/simulation/start", headers=admin)
    client.post("/simulation/stop", headers=admin)
    db_session.refresh(ev)
    assert ev.status == VehicleStatus.available


def test_simulation_controls_are_admin_only(client, make_user):
    _, driver = make_user(Role.driver)
    _, admin = make_user(Role.admin)
    assert client.post("/simulation/start", headers=driver).status_code == 403
    assert client.post("/simulation/start", headers=admin).json() == {"running": True}
    assert client.get("/simulation", headers=admin).json() == {"running": True}
    assert client.post("/simulation/stop", headers=admin).json() == {"running": False}
