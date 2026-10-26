from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
import os
from uuid import uuid4

import mongomock
import pytest
from bson.decimal128 import Decimal128
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError, OperationFailure

from app.core.database import ensure_indexes, get_mongo_client
from app.core.mongo_store import MongoSession
from app.repositories.models import AccountModel, SavingsGoalModel, TransactionModel, UserModel
from app.schemas.account_schema import AccountCreate
from app.schemas.auth_schema import RegisterRequest, LoginRequest
from app.schemas.transfer_schema import TransferCreate
from app.services.account_service import AccountService
from app.services.auth_service import AuthService
from app.services.split_bill_service import SplitBillService
from app.services.transfer_service import TransferService
from test_financial_integration import bill


@pytest.fixture(params=["mock", "atlas"])
def database(request):
    if request.param == "atlas":
        if os.getenv("FINANCE_MONGO_LIVE_TESTS") != "1":
            pytest.skip("Live Atlas checks are opt in.")
        client = get_mongo_client()
    else:
        client = mongomock.MongoClient()
    name = f"finance_builder_test_{uuid4().hex[:12]}"
    database = client[name]
    ensure_indexes(database)
    yield database
    assert name.startswith("finance_builder_test_")
    client.drop_database(name)


def store(database):
    return MongoSession(database, testing_without_transactions=type(database.client).__module__.startswith("mongomock"))


def seed(database):
    with store(database) as db:
        db.add_all([UserModel(id=1, name="One", email="one@example.test", password_hash="unused"),
                    UserModel(id=2, name="Two", email="two@example.test", password_hash="unused")])
        db.commit()
        db.info["user_id"] = 1
        savings = AccountService(db).create_account(AccountCreate(bank_name="Bank", name="Savings", account_type="savings", starting_balance="100"))
        checking = AccountService(db).create_account(AccountCreate(bank_name="Bank", name="Checking", account_type="checking", starting_balance="0"))
        return savings.id, checking.id


def test_documents_preserve_decimal_money_and_integer_api_ids(database):
    savings, checking = seed(database)
    document = database.accounts.find_one({"_id": savings})
    assert isinstance(document["starting_balance"], Decimal128)
    assert document["starting_balance"].to_decimal() == Decimal("100.00")
    assert isinstance(document["_id"], int)
    with store(database) as db:
        db.info["user_id"] = 1
        assert AccountService(db).get_account(savings).starting_balance == Decimal("100.00")
    assert savings != checking


def test_unique_email_and_collection_indexes_are_enforced(database):
    seed(database)
    with store(database) as db:
        db.add(UserModel(name="Duplicate", email="one@example.test", password_hash="unused"))
        with pytest.raises(DuplicateKeyError):
            db.commit()
    assert database.users.count_documents({"email": "one@example.test"}) == 1
    assert database.plaid_transaction_links.index_information()["transaction_id_1"]["unique"]


def test_registration_login_and_password_hash_persist_between_sessions(database):
    with store(database) as db:
        result = AuthService(db).register(RegisterRequest(name="Test User", email="login@example.test",
            phone_number="(817) 555-0100", password="Test-only-password-123"))
        id = result.user.id
    document = database.users.find_one({"_id": id})
    assert document["password_hash"] != "Test-only-password-123"
    with store(database) as db:
        result = AuthService(db).login(LoginRequest(email="login@example.test", password="Test-only-password-123"))
        assert result.user.id == id
        assert result.access_token


def test_savings_goals_and_transfers_are_scoped_by_owner(database):
    savings, checking = seed(database)
    with store(database) as db:
        db.info["user_id"] = 1
        goal = SavingsGoalModel(name="Private goal", target_amount=Decimal("100"))
        db.add(goal)
        db.commit()
        TransferService(db).create(TransferCreate(from_account_id=savings, to_account_id=checking, amount="10"))
    with store(database) as db:
        from app.repositories.models import TransferModel
        db.info["user_id"] = 2
        assert db.query(SavingsGoalModel).all() == []
        assert db.query(TransferModel).all() == []
        assert db.get(SavingsGoalModel, goal.id) is None


def test_account_deletion_removes_its_child_transactions(database):
    savings, checking = seed(database)
    with store(database) as db:
        db.info["user_id"] = 1
        db.add(TransactionModel(account_id=checking, amount=Decimal("2"), category="Food",
            transaction_type="expense", transaction_date=date.today()))
        db.commit()
        AccountService(db).delete_account(checking)
    assert database.transactions.count_documents({"account_id": checking}) == 0


def test_native_transaction_rolls_back_flushed_documents(database):
    if type(database.client).__module__.startswith("mongomock"):
        pytest.skip("mongomock cannot validate server transactions.")
    savings, checking = seed(database)
    with store(database) as db:
        db.info["user_id"] = 1
        db.add(TransactionModel(account_id=checking, amount=Decimal("2"), category="Food",
            transaction_type="expense", transaction_date=date.today()))
        db.flush()
        db.rollback()
    assert database.transactions.count_documents({}) == 0


def test_native_concurrent_transfers_cannot_overdraw(database):
    if type(database.client).__module__.startswith("mongomock"):
        pytest.skip("mongomock cannot validate server write conflicts.")
    savings, checking = seed(database)
    def transfer(_):
        with store(database) as db:
            db.info["user_id"] = 1
            try:
                TransferService(db).create(TransferCreate(from_account_id=savings, to_account_id=checking, amount="80"))
                return "paid"
            except (OperationFailure, HTTPException, DuplicateKeyError):
                return "blocked"
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(transfer, [1, 2]))
    assert results.count("paid") == 1
    assert database.transfers.count_documents({}) == 1
    with store(database) as db:
        db.info["user_id"] = 1
        assert AccountService(db).get_account(savings).current_balance == Decimal("20")
        assert AccountService(db).get_account(checking).current_balance == Decimal("80")


def test_native_same_bank_charge_cannot_be_allocated_concurrently(database):
    if type(database.client).__module__.startswith("mongomock"):
        pytest.skip("mongomock cannot validate concurrent unique reservations.")
    savings, checking = seed(database)
    with store(database) as db:
        db.info["user_id"] = 1
        db.add(TransactionModel(account_id=checking, amount=Decimal("100"), category="Food",
            transaction_type="expense", transaction_date=date(2026, 9, 20)))
        db.commit()
        charge = db.query(TransactionModel).one().id
        first = bill(db, db.get(AccountModel, checking))[1]
        second = bill(db, db.get(AccountModel, checking))[1]
    def allocate(id):
        with store(database) as db:
            db.info["user_id"] = 1
            try:
                SplitBillService(db, 1).pay(id, charge)
                return "linked"
            except (OperationFailure, HTTPException, DuplicateKeyError):
                return "blocked"
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(allocate, [first, second]))
    assert results.count("linked") == 1
    assert database["_allocations"].count_documents({"_id": charge}) == 1
    assert database.split_bills.count_documents({"payment_transaction_id": charge}) == 1
