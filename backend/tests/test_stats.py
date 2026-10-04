from app.models import Role


def test_public_stats_counts(client, make_user):
    assert client.get("/stats/public").json() == {
        "parcels_total": 0, "parcels_delivered": 0, "parcels_in_progress": 0,
        "vehicles_total": 0, "electric_share": 0,
    }

    _, admin = make_user(Role.admin)
    for plate, kind in [("FF-1", "ev_van"), ("FF-2", "van"), ("FF-3", "van"), ("FF-4", "ev_van")]:
        client.post("/vehicles", json={"plate_number": plate, "type": kind, "capacity_kg": 100}, headers=admin)
    client.post(
        "/parcels",
        json={"receiver_name": "A", "receiver_phone": "12345", "pickup_address": "X",
              "delivery_address": "Y", "weight_kg": 1},
        headers=admin,
    )

    stats = client.get("/stats/public").json()
    assert stats["parcels_total"] == 1
    assert stats["vehicles_total"] == 4
    assert stats["electric_share"] == 50
