from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.database import Base
from app.domain.split_bill import allocate, calculate_bill
from app.repositories.models import TransactionModel, UserModel
from app.schemas.account_schema import AccountCreate
from app.schemas.split_bill_schema import SplitBillDraft
from app.services.account_service import AccountService
from app.services.report_service import ReportService
from app.services.split_bill_service import SplitBillService


def draft(account_id=None, **changes):
    data = dict(title="Dinner", people=[dict(id="self", name="Ujjwal"), dict(id="friend", name="Friend")], self_id="self",
                items=[dict(id="burger", name="Burger", quantity=1, price="15", people=["self"]),
                       dict(id="fries", name="Fries", quantity=1, price="6", people=["friend"]),
                       dict(id="pizza", name="Pizza", quantity=1, price="20", people=["self", "friend"])],
                tax="4.10", tip="8.20", receipt_total="53.30", tip_method="bank", account_id=account_id, bill_date="2026-09-16")
    data.update(changes)
    return SplitBillDraft.model_validate(data)


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(UserModel(id=1, name="User", email="user@example.com", password_hash="test"))
        db.commit()
        yield db
    engine.dispose()


def account(db, balance="100"):
    return AccountService(db).create_account(AccountCreate(bank_name="Bank", name="Checking", starting_balance=balance))


def test_example_fair_tax_tip_and_shared_items():
    result = calculate_bill(draft())
    assert result["people"] == [dict(id="self", name="Ujjwal", subtotal=2500, tax=250, tip=500, total=3250),
                                dict(id="friend", name="Friend", subtotal=1600, tax=160, tip=320, total=2080)]
    assert result["allocated"] == result["total"] == 5330
    assert result["matches"]


def test_pennies_and_quantities_always_reconcile():
    assert allocate(1, [1, 1, 1]) == [1, 0, 0]
    assert allocate(100, [1, 1, 1]) == [34, 33, 33]
    for cents in range(1, 150):
        weights = [0, 17, 31, 9]
        values = allocate(cents, weights)
        assert sum(values) == cents
        assert values[0] == 0
        assert all(abs(value - cents * weight / sum(weights)) < 1 for value, weight in zip(values, weights))
    bill = draft(items=[dict(id="one", name="Shared", quantity=3, price="0.01", people=["self", "friend"])], tax="0.01", tip="0.01", receipt_total="0.05")
    assert calculate_bill(bill)["allocated"] == 5
