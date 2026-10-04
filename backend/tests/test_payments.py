import pytest

from app.email import outbox
from app.models import Role
from tests.conftest import TEST_CARD, pay

PARCEL = {"receiver_name": "Sara", "receiver_phone": "12345", "pickup_address": "X", "delivery_address": "Y", "weight_kg": 4}


@pytest.fixture
def setup(client, make_user):
    _, admin = make_user(Role.admin)
    customer_user, customer = make_user(Role.customer)
    vehicle = client.post("/vehicles", json={"plate_number": "FF-1", "type": "van", "capacity_kg": 100}, headers=admin).json()
    parcel = client.post("/parcels", json=PARCEL, headers=customer).json()
    return {"admin": admin, "customer": customer, "customer_user": customer_user, "vehicle": vehicle, "parcel": parcel}


def test_quote_and_booking_price_match(client, setup):
    quote = client.get("/pricing/quote?weight_kg=4").json()
    assert quote == {"weight_kg": 4.0, "amount_cents": 500, "currency": "USD"}
    assert setup["parcel"]["price_cents"] == 500
    assert setup["parcel"]["paid"] is False


def test_successful_payment_marks_parcel_paid_and_emails_receipt(client, setup):
    response = pay(client, setup["parcel"]["id"], setup["customer"])
    assert response.status_code == 201
    payment = response.json()
    assert (payment["status"], payment["amount_cents"], payment["card_last4"], payment["card_brand"]) == (
        "succeeded", 500, "4242", "Visa",
    )
    assert client.get(f"/parcels/{setup['parcel']['id']}", headers=setup["customer"]).json()["paid"] is True
    assert outbox[-1].subject == f"Receipt for {setup['parcel']['tracking_id']}"
    assert "USD 5.00" in outbox[-1].text

    # Can't pay twice
    assert pay(client, setup["parcel"]["id"], setup["customer"]).status_code == 409


@pytest.mark.parametrize(
    ("number", "reason"),
    [
        ("4000000000000002", "declined"),
        ("4000000000009995", "insufficient funds"),
        ("4242424242424241", "invalid"),  # fails the Luhn check
        ("4111111111111111", "test card"),  # a real-looking number that isn't a sandbox test card
    ],
)
def test_declined_cards_are_recorded_and_parcel_stays_unpaid(client, setup, number, reason):
    response = pay(client, setup["parcel"]["id"], setup["customer"], {**TEST_CARD, "number": number})
    assert response.status_code == 402
    assert reason in response.json()["detail"]
    history = client.get("/payments", headers=setup["customer"]).json()
    assert history[0]["status"] == "failed"
    assert client.get(f"/parcels/{setup['parcel']['id']}", headers=setup["customer"]).json()["paid"] is False


def test_expired_card_is_rejected(client, setup):
    response = pay(client, setup["parcel"]["id"], setup["customer"], {**TEST_CARD, "exp_year": 2020})
    assert response.status_code == 402
    assert "expired" in response.json()["detail"]


def test_unpaid_parcels_cannot_be_dispatched(client, setup):
    assign = lambda: client.post(
        f"/parcels/{setup['parcel']['id']}/assign", json={"vehicle_id": setup["vehicle"]["id"]}, headers=setup["admin"]
    )
    response = assign()
    assert response.status_code == 409
    assert "waiting for payment" in response.json()["detail"]

    pay(client, setup["parcel"]["id"], setup["customer"])
    assert assign().status_code == 200


def test_customers_only_pay_and_see_their_own(client, setup, make_user):
    _, stranger = make_user(Role.customer)
    _, driver = make_user(Role.driver)
    assert pay(client, setup["parcel"]["id"], stranger).status_code == 404
    assert pay(client, setup["parcel"]["id"], driver).status_code == 403

    pay(client, setup["parcel"]["id"], setup["customer"])
    assert client.get("/payments", headers=stranger).json() == []
    assert len(client.get("/payments", headers=setup["admin"]).json()) == 1
    assert client.get("/payments", headers=driver).status_code == 403


def test_refund_rules(client, setup):
    payment = pay(client, setup["parcel"]["id"], setup["customer"]).json()
    refund = lambda: client.post(f"/payments/{payment['id']}/refund", headers=setup["admin"])

    # Customers can't refund themselves
    assert client.post(f"/payments/{payment['id']}/refund", headers=setup["customer"]).status_code == 403

    # Not once it's on a vehicle
    client.post(f"/parcels/{setup['parcel']['id']}/assign", json={"vehicle_id": setup["vehicle"]["id"]}, headers=setup["admin"])
    assert refund().status_code == 409

    # Allowed after a failed delivery
    client.post(f"/parcels/{setup['parcel']['id']}/status", json={"status": "failed"}, headers=setup["admin"])
    refunded = refund()
    assert refunded.status_code == 200
    assert refunded.json()["status"] == "refunded"
    assert outbox[-1].subject.startswith("Refund for")
    assert refund().status_code == 409  # not twice
