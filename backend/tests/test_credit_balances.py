from decimal import Decimal

import mongomock
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.database import Base, ensure_indexes
from app.core.mongo_store import MongoSession
from app.repositories.models import AccountModel, UserModel
from app.schemas.transaction_schema import TransactionCreate
from app.services.account_service import AccountService, total_available_balance
from app.services.plaid_service import PlaidService
from app.services.transaction_service import TransactionService
from test_plaid_service import FakePlaidClient


class CreditBank(FakePlaidClient):
    current = 1200
    available = 3600

    def post(self, path, payload):
        if path == "/accounts/get":
            return {"accounts": [{"account_id": "plaid-account-1", "name": "Everyday Rewards", "type": "credit", "subtype": "credit card",
                                   "balances": {"current": self.current, "available": self.available, "limit": 5000}}]}
        return super().post(path, payload)


@pytest.fixture(params=["sqlite", "mongo"])
def db(request):
    if request.param == "mongo":
        database = mongomock.MongoClient().credit_test
        ensure_indexes(database)
        session = MongoSession(database, testing_without_transactions=True)
    else:
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        session = Session(engine)
    with session as store:
        store.add(UserModel(id=1, name="User", email="credit@example.test", password_hash="unused"))
        store.commit()
        store.info["user_id"] = 1
        yield store


def test_card_debt_is_not_cash_or_remaining_credit_and_resync_repairs_existing_account(db):
    bank = CreditBank()
    service = PlaidService(db, bank)
    service.exchange(1, "public-sandbox")
    account = AccountService(db).list_accounts()[0]
    assert account.bank_account_type == "credit"  # Not inferred from account name.
    assert account.bank_current_balance == Decimal("1200")
    assert account.current_balance == Decimal("-1200")
    assert account.debt_owed == Decimal("1200")
    assert account.available_credit == Decimal("3600")  # Bank accounts for pending charges.
    assert account.bank_credit_limit == Decimal("5000")
    assert total_available_balance(db) == Decimal("-1200")

    old = db.get(AccountModel, account.id)
    old.bank_account_type = None
    db.commit()
    bank.sync_responses.append({"added": [], "modified": [], "removed": [], "next_cursor": "cursor-2", "has_more": False})
    service.sync_user(1)
    assert len(AccountService(db).list_accounts()) == 1
    assert AccountService(db).get_account(account.id).debt_owed == Decimal("1200")


def test_manual_card_charge_and_refund_adjust_debt_without_reusing_available_credit(db):
    PlaidService(db, CreditBank()).exchange(1, "public-sandbox")
    account = AccountService(db).list_accounts()[0]
    payload = dict(account_id=account.id, amount="50", category="Shopping", transaction_type="expense", transaction_date="2026-11-05")
    TransactionService(db).create_transaction(TransactionCreate(**payload))
    assert AccountService(db).get_account(account.id).debt_owed == Decimal("1250")
    TransactionService(db).create_transaction(TransactionCreate(**{**payload, "transaction_type": "income", "amount": "20"}))
    result = AccountService(db).get_account(account.id)
    assert result.debt_owed == Decimal("1230")
    assert result.available_credit == Decimal("3600")


def test_overpaid_card_has_no_debt_and_missing_available_credit_stays_unknown(db):
    bank = CreditBank()
    bank.current = -75
    bank.available = None
    PlaidService(db, bank).exchange(1, "public-sandbox")
    result = AccountService(db).list_accounts()[0]
    assert result.current_balance == Decimal("75")
    assert result.debt_owed == Decimal("0")
    assert result.available_credit is None
