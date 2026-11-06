import mongomock
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.api import accounts, auth, transactions, user_state
from app.core.database import ensure_indexes, get_db
from app.core.mongo_store import MongoSession
from app.core.security import get_current_user


def test_new_device_restores_finances_and_preferences_with_account_isolation():
    database = mongomock.MongoClient().cross_device_test
    ensure_indexes(database)
    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(user_state.router)
    app.include_router(accounts.router, dependencies=[Depends(get_current_user)])
    app.include_router(transactions.router, dependencies=[Depends(get_current_user)])

    def session():
        with MongoSession(database, testing_without_transactions=True) as db:
            yield db

    app.dependency_overrides[get_db] = session
    credentials = {"name": "Device One", "email": "devices@example.test", "password": "cross-device-test-password", "phone_number": "(202) 555-0100"}
    with TestClient(app) as device_one:
        registered = device_one.post("/auth/register", json=credentials)
        assert registered.status_code == 200, registered.text
        headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
        assert device_one.get("/auth/state").status_code in (401, 403)
        account = device_one.post("/accounts", headers=headers, json={"name": "Checking", "bank_name": "Other", "starting_balance": "1000", "account_type": "checking"})
        assert account.status_code == 201
        transaction = device_one.post("/transactions", headers=headers, json={"account_id": account.json()["id"], "amount": "25", "category": "Groceries", "transaction_type": "expense", "transaction_date": "2026-11-05"})
        assert transaction.status_code == 201
        for key, value in {"onboarding_complete": "true", "budget_preferences": '{"targets":{"needs":60}}', "import_history": '[{"label":"Bank CSV","count":1}]', "completed_goal_months": '{"1:2026-11":true}'}.items():
            assert device_one.patch(f"/auth/state/{key}", headers=headers, json={"value": value}).status_code == 200

    # Fresh HTTP client and request-scoped database session, with no browser data.
    with TestClient(app) as device_two:
        login = device_two.post("/auth/login", json={"email": credentials["email"], "password": credentials["password"]})
        owner = {"Authorization": f"Bearer {login.json()['access_token']}"}
        restored = device_two.get("/auth/state", headers=owner).json()
        assert restored["onboarding_complete"] == "true"
        assert '"needs":60' in restored["budget_preferences"]
        assert database.user_state.count_documents({}) == 5
        assert restored["bank_tracking_mode"] == "manual"
        assert len(device_two.get("/transactions", headers=owner).json()) == 1
        assert device_two.get("/accounts", headers=owner).json()[0]["current_balance"] == "975.00"
        other = device_two.post("/auth/register", json={**credentials, "email": "other@example.test"}).json()
        stranger = {"Authorization": f"Bearer {other['access_token']}"}
        assert device_two.get("/auth/state", headers=stranger).json() == {}
        assert device_two.get("/transactions", headers=stranger).json() == []
        assert device_two.patch("/auth/state/budget_preferences", headers=stranger, json={"value": "other"}).status_code == 200
        assert device_two.get("/auth/state", headers=owner).json()["budget_preferences"] == restored["budget_preferences"]
        assert device_two.patch("/auth/state/not_allowed", headers=owner, json={"value": "x"}).status_code == 422
        assert device_two.patch("/auth/state/import_history", headers=owner, json={"value": "x" * 262145}).status_code == 422
        assert device_two.delete("/auth/me", headers=owner).status_code == 204
        assert database.user_state.count_documents({"user_id": registered.json()["user"]["id"]}) == 0
