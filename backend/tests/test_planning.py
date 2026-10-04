from datetime import datetime, timedelta, timezone

import pytest

from app.models import Role
from app.planning.charging import EV, Slot, plan_charging
from app.planning.routing import Stop, Truck, booking_order_km, solve_routes
from tests.conftest import pay

ROAD = 1.3


# --- Route solver ---

def test_visits_stops_in_a_sensible_order():
    truck = Truck(1, (0.0, 0.0), capacity_kg=100)
    # Booked in a zig-zag order along a straight line
    stops = [Stop(1, (0.0, 0.03), 1), Stop(2, (0.0, 0.01), 1), Stop(3, (0.0, 0.04), 1), Stop(4, (0.0, 0.02), 1)]
    result = solve_routes([truck], stops, ROAD)
    assert result.routes[0].parcel_ids == [2, 4, 1, 3]
    assert result.routes[0].distance_km < booking_order_km(truck, stops, ROAD)


def test_capacity_splits_parcels_between_vehicles():
    trucks = [Truck(1, (0.0, 0.0), capacity_kg=10), Truck(2, (0.0, 0.0), capacity_kg=10)]
    stops = [Stop(i, (0.0, 0.01 * i), 6) for i in range(1, 4)]  # 18 kg won't fit in one 10 kg vehicle
    result = solve_routes(trucks, stops, ROAD)
    # Each 10 kg vehicle fits exactly one 6 kg parcel, so one parcel can't be planned
    assert [len(route.parcel_ids) for route in result.routes] == [1, 1]
    assert len(result.dropped) == 1
    assert all(route.load_kg <= 10 for route in result.routes)


def test_parcels_already_on_a_vehicle_stay_with_it():
    trucks = [Truck(1, (0.0, 0.0), capacity_kg=100), Truck(2, (0.0, 0.1), capacity_kg=100)]
    # Right next to truck 2, but already loaded on truck 1
    stops = [Stop(7, (0.0, 0.1), 1, vehicle_id=1)]
    result = solve_routes(trucks, stops, ROAD)
    assert {route.vehicle_id: route.parcel_ids for route in result.routes} == {1: [7], 2: []}


def test_ev_range_leaves_out_unreachable_stops():
    ev = Truck(1, (0.0, 0.0), capacity_kg=100, max_km=5)
    near, far = Stop(1, (0.0, 0.02), 1), Stop(2, (0.0, 0.5), 1)  # about 2.9 km and 72 km of road
    result = solve_routes([ev], [near, far], ROAD)
    assert result.routes[0].parcel_ids == [1]
    assert result.dropped == [2]


# --- Charging LP ---

def slots(prices: list[float]) -> list[Slot]:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [Slot(start + timedelta(hours=k), price) for k, price in enumerate(prices)]


def test_charges_in_the_cheapest_hours():
    ev = EV(1, capacity_kwh=60, energy_kwh=20, target_kwh=30)
    result = plan_charging([ev], slots([30, 10, 30, 10]), slot_hours=1, charger_kw=11, site_kw=22)
    power = result.schedules[0].power_kw
    assert power[0] == power[2] == 0  # skips the expensive hours
    assert result.schedules[0].final_kwh == pytest.approx(30, abs=0.01)
    assert result.cost_cents < result.baseline_cost_cents  # baseline charges straight away at 30c


def test_site_limit_is_shared():
    evs = [EV(i, 60, 10, 30) for i in range(3)]
    result = plan_charging(evs, slots([10] * 8), slot_hours=1, charger_kw=11, site_kw=15)
    for t in range(8):
        assert sum(schedule.power_kw[t] for schedule in result.schedules) <= 15 + 1e-6
    for row in result.baseline_power_kw:
        assert max(row) <= 11


def test_reports_shortfall_when_the_target_is_impossible():
    ev = EV(1, capacity_kwh=60, energy_kwh=5, target_kwh=60)
    result = plan_charging([ev], slots([10, 10]), slot_hours=1, charger_kw=11, site_kw=22)
    assert result.schedules[0].power_kw == [11, 11]  # charges flat out
    assert result.schedules[0].shortfall_kwh == pytest.approx(60 - 5 - 0.92 * 22, abs=0.01)


# --- Endpoints ---

@pytest.fixture
def fleet(client, make_user):
    _, admin = make_user(Role.admin)
    driver, driver_headers = make_user(Role.driver)
    vehicles = [
        client.post("/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 50, "driver_id": driver.id},
                    headers=admin).json(),
        client.post("/vehicles", json={"plate_number": "FF-2", "type": "ev_van", "capacity_kg": 50, "battery_level": 50},
                    headers=admin).json(),
    ]
    for vehicle, (lat, lng) in zip(vehicles, [(31.50, 74.30), (31.55, 74.40)]):
        client.patch(f"/vehicles/{vehicle['id']}/location", json={"latitude": lat, "longitude": lng}, headers=admin)
    return {"admin": admin, "driver": driver_headers, "vehicles": vehicles}


def book(client, headers, lat, lng, weight=2.0, pin=True):
    data = {"receiver_name": "A", "receiver_phone": "12345", "pickup_address": "X", "delivery_address": "Y", "weight_kg": weight}
    if pin:
        data |= {"delivery_latitude": lat, "delivery_longitude": lng}
    parcel = client.post("/parcels", json=data, headers=headers).json()
    pay(client, parcel["id"], headers)
    return parcel


def test_route_plan_preview_then_apply(client, fleet):
    admin = fleet["admin"]
    near_van = [book(client, admin, 31.50 + 0.005 * i, 74.30) for i in range(1, 4)]
    near_ev = book(client, admin, 31.555, 74.405)
    unpinned = book(client, admin, 0, 0, pin=False)
    unpaid = client.post("/parcels", json={"receiver_name": "A", "receiver_phone": "12345", "pickup_address": "X",
                                           "delivery_address": "Y", "weight_kg": 1, "delivery_latitude": 31.5,
                                           "delivery_longitude": 74.3}, headers=admin).json()

    preview = client.post("/planning/routes", json={}, headers=admin).json()
    by_plate = {route["plate_number"]: [stop["parcel_id"] for stop in route["stops"]] for route in preview["routes"]}
    assert set(by_plate["FF-1"]) == {p["id"] for p in near_van}
    assert by_plate["FF-2"] == [near_ev["id"]]
    assert [u["parcel_id"] for u in preview["unplanned"]] == [unpinned["id"]]
    assert unpaid["id"] not in {pid for ids in by_plate.values() for pid in ids}
    assert preview["applied"] is False
    assert client.get(f"/parcels/{near_ev['id']}", headers=admin).json()["status"] == "created"  # preview changes nothing

    applied = client.post("/planning/routes", json={"apply": True}, headers=admin).json()
    assert applied["applied"] is True
    parcel = client.get(f"/parcels/{near_ev['id']}", headers=admin).json()
    assert (parcel["status"], parcel["stop_order"]) == ("assigned", 1)

    # The driver's list follows the planned stop order
    driver_list = client.get("/parcels", headers=fleet["driver"]).json()
    assert [p["stop_order"] for p in driver_list] == [1, 2, 3]


def test_charging_plan_for_evs(client, fleet):
    plan = client.post("/planning/charging", json={"departure_hour": 8, "site_limit_kw": 11}, headers=fleet["admin"]).json()
    assert [v["plate_number"] for v in plan["vehicles"]] == ["FF-2"]
    ev = plan["vehicles"][0]
    assert len(ev["power_kw"]) == len(plan["slots"]) > 0
    assert max(ev["power_kw"]) <= 11
    assert ev["final_pct"] >= ev["target_pct"] - 0.1 or ev["shortfall_kwh"] > 0
    assert plan["cost_cents"] <= plan["baseline_cost_cents"]


def test_ev_is_topped_up_to_the_standard_morning_charge(client, fleet):
    # FF-2 is at 50% with no parcels: its route need is small, but the 80% morning standard applies
    plan = client.post("/planning/charging", json={"departure_hour": 8}, headers=fleet["admin"]).json()
    ev = plan["vehicles"][0]
    assert ev["target_pct"] == 80.0
    assert ev["final_pct"] == pytest.approx(80.0, abs=0.1)


def test_planning_is_admin_only(client, fleet):
    assert client.post("/planning/routes", json={}, headers=fleet["driver"]).status_code == 403
    assert client.post("/planning/charging", json={}, headers=fleet["driver"]).status_code == 403
