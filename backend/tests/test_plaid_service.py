from decimal import Decimal

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.database import Base
from app.repositories.models import AccountModel, TransactionModel, UserModel
from app.services.account_service import AccountService
from app.services.plaid_service import PlaidClient, PlaidService


class FakePlaidClient:
    configured = True

    def __init__(self):
        self.sync_responses = [
            {
                "added": [{
                    "transaction_id": "transaction-1",
                    "account_id": "plaid-account-1",
                    "amount": 25.0,
                    "date": "2026-09-20",
                    "name": "Coffee shop",
                    "personal_finance_category": {"primary": "FOOD_AND_DRINK"},
                }],
                "modified": [], "removed": [], "next_cursor": "cursor-1", "has_more": False,
            }
        ]

    def post(self, path: str, payload: dict) -> dict:
        if path == "/item/public_token/exchange":
            return {"access_token": "access-sandbox", "item_id": "item-1"}
        if path == "/accounts/get":
            return {"accounts": [{
                "account_id": "plaid-account-1", "name": "Plaid Checking", "subtype": "checking",
                "balances": {"current": 1000.0},
            }]}
        if path == "/transactions/sync":
            return self.sync_responses.pop(0)
        if path in {"/transactions/refresh", "/item/remove"}:
            return {}
        raise AssertionError(f"Unexpected Plaid path: {path}")


def test_plaid_client_explains_environment_mismatched_keys(monkeypatch):
    def reject_keys(*args, **kwargs):
        return httpx.Response(
            400,
            json={"error_code": "INVALID_API_KEYS", "error_message": "invalid client_id or secret provided"},
        )

    monkeypatch.setattr(httpx, "post", reject_keys)

    with pytest.raises(HTTPException) as raised:
        PlaidClient().post("/link/token/create", {})

    assert raised.value.status_code == 503
    assert "sandbox environment" in raised.value.detail
    assert "restart the backend" in raised.value.detail


def test_plaid_sync_imports_updates_and_removes_without_duplicates():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    client = FakePlaidClient()
    with Session(engine) as db:
        db.add(UserModel(id=1, name="User", email="user@example.com", password_hash="test"))
        db.commit()
        service = PlaidService(db, client)
        service.exchange(1, "public-sandbox", {"institution": {"name": "Sandbox Bank"}})

        transaction = db.query(TransactionModel).one()
        account = db.query(AccountModel).one()
        assert transaction.amount == Decimal("25.00")
        assert transaction.transaction_type == "expense"
        assert transaction.category == "Food & Dining"
        assert account.starting_balance == Decimal("1025.00")

        client.sync_responses.append({
            "added": [],
            "modified": [{
                "transaction_id": "transaction-1", "account_id": "plaid-account-1", "amount": -50.0,
                "date": "2026-09-21", "name": "Refund", "personal_finance_category": {"primary": "INCOME"},
            }],
            "removed": [], "next_cursor": "cursor-2", "has_more": False,
        })
        assert service.sync_user(1)["modified"] == 1
        assert db.query(TransactionModel).count() == 1
        transaction = db.query(TransactionModel).one()
        assert transaction.amount == Decimal("50.00")
        assert transaction.transaction_type == "income"
        assert transaction.category == "Salary"

        client.sync_responses.append({
            "added": [], "modified": [], "removed": [{"transaction_id": "transaction-1"}],
            "next_cursor": "cursor-3", "has_more": False,
        })
        assert service.sync_user(1)["removed"] == 1
        assert db.query(TransactionModel).count() == 0
        assert db.query(AccountModel).one().starting_balance == Decimal("1000.00")
    engine.dispose()


def test_plaid_account_with_negative_derived_baseline_can_be_read():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    client = FakePlaidClient()
    client.sync_responses[0]["added"][0]["amount"] = -1500.0
    with Session(engine) as db:
        db.add(UserModel(id=1, name="User", email="user@example.com", password_hash="test"))
        db.commit()

        PlaidService(db, client).exchange(1, "public-sandbox")
        account = AccountService(db).list_accounts()[0]

        assert account.starting_balance == Decimal("-500.00")
        assert account.current_balance == Decimal("1000.00")
    engine.dispose()
