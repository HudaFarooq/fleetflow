from app.models import Role


def test_register_login_and_me(client):
    response = client.post(
        "/auth/register",
        json={"email": "Ali@Example.com", "full_name": "Ali", "password": "password123"},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "customer"

    response = client.post("/auth/login", data={"username": "ali@example.com", "password": "password123"})
    assert response.status_code == 200
    token = response.json()["access_token"]

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.json()["email"] == "ali@example.com"


def test_duplicate_email_is_rejected(client):
    body = {"email": "a@example.com", "full_name": "A", "password": "password123"}
    assert client.post("/auth/register", json=body).status_code == 201
    assert client.post("/auth/register", json=body).status_code == 409


def test_wrong_password_is_rejected(client):
    client.post("/auth/register", json={"email": "a@example.com", "full_name": "A", "password": "password123"})
    response = client.post("/auth/login", data={"username": "a@example.com", "password": "wrong-password"})
    assert response.status_code == 401


def test_requests_without_token_are_rejected(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_only_admin_can_create_staff(client, make_user):
    _, customer_headers = make_user(Role.customer)
    _, admin_headers = make_user(Role.admin)
    body = {"email": "d@example.com", "full_name": "D", "password": "password123", "role": "driver"}

    assert client.post("/users", json=body, headers=customer_headers).status_code == 403
    response = client.post("/users", json=body, headers=admin_headers)
    assert response.status_code == 201
    assert response.json()["role"] == "driver"
