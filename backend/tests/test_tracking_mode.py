from decimal import Decimal

import mongomock
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import accounts, auth, plaid, transactions
from app.core.database import Base, ensure_indexes, get_db
from app.core.mongo_store import MongoSession
from app.core.security import get_current_user
from app.repositories.models import AccountModel
from app.services.plaid_service import PlaidService
from test_plaid_service import FakePlaidClient


class Bank(FakePlaidClient):
    def post(self, path, payload):
        if path == "/link/token/create":
            return {"link_token": "test-link-token"}
        return super().post(path, payload)


@pytest.fixture(params=["sqlite", "mongo"])
def app_store(request, monkeypatch):
    if request.param == "mongo":
        database = mongomock.MongoClient().tracking_mode_test
        ensure_indexes(database)
        make_store = lambda: MongoSession(database, testing_without_transactions=True)
    else:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        make_store = lambda: Session(engine)
    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(accounts.router, dependencies=[Depends(get_current_user)])
    app.include_router(transactions.router, dependencies=[Depends(get_current_user)])
    app.include_router(plaid.router)

    def session():
        with make_store() as db:
            yield db

    app.dependency_overrides[get_db] = session
    monkeypatch.setattr(plaid, "PlaidService", lambda db: PlaidService(db, Bank()))
    with TestClient(app) as client:
        yield client, make_store


def register(client, email="mode@example.test"):
    response = client.post("/auth/register", json={"name": "Mode Test", "email": email, "password": "Copper lantern orbit meadow 7249!", "phone_number": "(202) 555-0100"})
    assert response.status_code == 200, response.text
    session = response.json()
    return {"Authorization": f"Bearer {session['access_token']}"}, session["user"]["id"]


ACCOUNT = {"bank_name": "Chase", "name": "Checking", "account_type": "checking", "starting_balance": "100.00"}


def test_manual_mode_is_persisted_and_blocks_plaid_without_deleting_records(app_store):
    client, _ = app_store
    headers, _ = register(client)
    assert client.get("/accounts/tracking-mode", headers=headers).json()["mode"] is None
    created = client.post("/accounts", headers=headers, json=ACCOUNT)
    assert created.status_code == 201, created.text
    assert client.get("/accounts/tracking-mode", headers=headers).json()["mode"] == "manual"
    assert client.post("/plaid/link-token", headers=headers).status_code == 409
    assert client.post("/plaid/exchange", headers=headers, json={"public_token": "test"}).status_code == 409
    assert client.patch("/accounts/tracking-mode", headers=headers, json={"mode": "plaid"}).status_code == 409
    assert len(client.get("/accounts", headers=headers).json()) == 1
    # A new authenticated session on another device gets the same server-owned choice.
    login = client.post("/auth/login", json={"email": "mode@example.test", "password": "Copper lantern orbit meadow 7249!"}).json()
    assert client.get("/accounts/tracking-mode", headers={"Authorization": f"Bearer {login['access_token']}"}).json()["mode"] == "manual"
    other, _ = register(client, "other-mode@example.test")
    assert client.get("/accounts/tracking-mode", headers=other).json()["mode"] is None
    assert client.patch("/accounts/tracking-mode", headers=other, json={"mode": "plaid"}).status_code == 200
    assert client.get("/accounts/tracking-mode", headers=headers).json()["mode"] == "manual"


def test_plaid_mode_blocks_manual_accounts_and_imports_and_can_switch_only_after_disconnect(app_store):
    client, _ = app_store
    headers, _ = register(client)
    assert client.patch("/accounts/tracking-mode", headers=headers, json={"mode": "plaid"}).status_code == 200
    assert client.post("/plaid/link-token", headers=headers).status_code == 200
    connected = client.post("/plaid/exchange", headers=headers, json={"public_token": "test", "metadata": {"institution": {"name": "Test bank"}}})
    assert connected.status_code == 200, connected.text
    account = client.get("/accounts", headers=headers).json()[0]
    assert client.post("/accounts", headers=headers, json=ACCOUNT).status_code == 409
    payload = {"account_id": account["id"], "amount": "10", "category": "Other", "transaction_type": "expense", "transaction_date": "2026-11-06", "receipt_metadata": {"source": "plaid"}}
    assert client.post("/transactions", headers=headers, json=payload).status_code == 409
    assert client.post("/transactions/bulk", headers=headers, json={"transactions": [payload]}).status_code == 409
    assert client.patch("/accounts/tracking-mode", headers=headers, json={"mode": "manual"}).status_code == 409
    connection_id = connected.json()["connection"]["id"]
    assert client.delete(f"/plaid/connections/{connection_id}", headers=headers).status_code == 204
    assert client.patch("/accounts/tracking-mode", headers=headers, json={"mode": "manual"}).status_code == 200
    assert client.post("/accounts", headers=headers, json=ACCOUNT).status_code == 201


def test_legacy_mixed_records_stay_readable_and_new_additions_are_blocked(app_store):
    client, make_store = app_store
    headers, owner = register(client)
    with make_store() as db:
        db.add(AccountModel(user_id=owner, bank_name="Manual", name="Cash", account_type="other", starting_balance=Decimal("10")))
        db.add(AccountModel(user_id=owner, bank_name="Connected", name="Bank", account_type="checking", starting_balance=Decimal("20"), bank_current_balance=Decimal("20")))
        db.commit()
    assert client.get("/accounts/tracking-mode", headers=headers).json()["mode"] == "mixed"
    assert client.post("/accounts", headers=headers, json=ACCOUNT).status_code == 409
    assert client.post("/plaid/link-token", headers=headers).status_code == 409
    for mode in ["manual", "plaid"]:
        assert client.patch("/accounts/tracking-mode", headers=headers, json={"mode": mode}).status_code == 409
    assert len(client.get("/accounts", headers=headers).json()) == 2


def test_mode_endpoints_require_authentication_and_valid_choice(app_store):
    client, _ = app_store
    assert client.get("/accounts/tracking-mode").status_code in (401, 403)
    headers, _ = register(client)
    assert client.patch("/accounts/tracking-mode", headers=headers, json={"mode": "both"}).status_code == 422
