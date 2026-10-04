from datetime import datetime, timezone

from app.models import Role
from tests.conftest import pay

PARCEL = {"receiver_name": "A", "receiver_phone": "12345", "pickup_address": "X", "delivery_address": "Y"}


def test_analytics_summarises_deliveries(client, make_user):
    _, admin = make_user(Role.admin)
    driver, driver_headers = make_user(Role.driver)
    vehicle = client.post(
        "/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 100, "driver_id": driver.id}, headers=admin
    ).json()

    ids = [client.post("/parcels", json={**PARCEL, "weight_kg": w}, headers=admin).json()["id"] for w in (5, 10, 20, 1)]
    for parcel_id in ids[:3]:
        pay(client, parcel_id, admin)
        client.post(f"/parcels/{parcel_id}/assign", json={"vehicle_id": vehicle["id"]}, headers=admin)
    # one delivered, one failed, one still on the van, one waiting
    for status in ("picked_up", "in_transit", "delivered"):
        client.post(f"/parcels/{ids[0]}/status", json={"status": status}, headers=driver_headers)
    client.post(f"/parcels/{ids[1]}/status", json={"status": "failed"}, headers=driver_headers)

    data = client.get("/analytics?days=7", headers=admin).json()

    assert data["parcels_booked"] == 4
    assert (data["delivered"], data["failed"], data["in_progress"], data["waiting"]) == (1, 1, 1, 1)
    assert data["success_rate"] == 50.0
    assert data["avg_delivery_minutes"] is not None
    # weights 5, 10, 20 kg at $3 + $0.50/kg
    assert data["revenue_cents"] == (300 + 250) + (300 + 500) + (300 + 1000)
    assert len(data["daily"]) == 7
    assert data["daily"][-1]["date"] == datetime.now(timezone.utc).date().isoformat()
    assert sum(day["booked"] for day in data["daily"]) == 4
    assert {s["status"]: s["count"] for s in data["statuses"]}["delivered"] == 1

    van = data["vehicles"][0]
    assert van["driver_name"] == driver.full_name
    assert (van["delivered"], van["failed"], van["load_kg"]) == (1, 1, 20.0)


def test_analytics_is_admin_only(client, make_user):
    _, driver = make_user(Role.driver)
    assert client.get("/analytics", headers=driver).status_code == 403
