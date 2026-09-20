from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    # Each test gets a fresh account instead of depending on another test's mutations.
    with TestClient(create_app()) as client:
        yield client


def entry(**changes):
    return dict(amount="60.00", category="Food", transaction_type="expense",
                transaction_date=date.today().isoformat(), note="Lunch") | changes


def test_full_demo_flow(client):
    seed = client.get("/api/demo").json()
    assert seed["current_balance"] == "1400.00"
    assert seed["spendable"] == "500.00"
    assert len(seed["transactions"]) == 3
    checked = client.post("/api/affordability", json={"amount": "500"})
    assert checked.status_code == 200
    assert checked.json()["can_afford"] is True
    assert client.get("/api/demo").json() == seed
    saved = client.post("/api/transactions", json=entry())
    assert saved.status_code == 201
    assert saved.json()["current_balance"] == "1340.00"
    assert len(saved.json()["transactions"]) == 4
    assert client.post("/api/affordability", json={"amount": "500"}).json()["can_afford"] is False
    income = client.post("/api/transactions", json=entry(amount="100", transaction_type="income"))
    assert income.json()["current_balance"] == "1440.00"
    assert client.get("/api/demo").json()["current_balance"] == "1440.00"
    assert client.post("/api/reset").json() == seed


@pytest.mark.parametrize("changes", [
    {"amount": "-1"}, {"amount": "0"}, {"amount": "NaN"}, {"amount": "1.001"},
    {"amount": 10}, {"category": " "}, {"transaction_type": "unknown"},
    {"transaction_date": "2026-02-30"},
    {"transaction_date": (date.today() + timedelta(days=1)).isoformat()},
    {"account_id": 2}, {"note": "x" * 161},
])
def test_invalid_entry_does_not_change_balance(client, changes):
    before = client.get("/api/demo").json()
    assert client.post("/api/transactions", json=entry(**changes)).status_code == 422
    assert client.get("/api/demo").json() == before


@pytest.mark.parametrize("body", [{}, {"amount": "0"}, {"amount": "NaN"},
                                  {"amount": "1000001"}, {"amount": "-0.001"}])
def test_invalid_purchase(client, body):
    assert client.post("/api/affordability", json=body).status_code == 422


def test_overdrawn_expense_is_recorded(client):
    saved = client.post("/api/transactions", json=entry(amount="1500"))
    assert saved.status_code == 201
    assert saved.json()["current_balance"] == "-100.00"
    assert client.post("/api/affordability", json={"amount": "1"}).json()["can_afford"] is False


def test_removed_features_have_no_routes(client):
    for route in ["auth/login", "accounts", "reports", "budgets", "recurring-transactions"]:
        assert client.get(f"/api/{route}").status_code == 404
