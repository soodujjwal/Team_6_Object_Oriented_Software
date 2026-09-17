from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.database import Base
from app.domain.split_bill import allocate, calculate_bill
from app.repositories.models import TransactionModel, UserModel
from app.schemas.account_schema import AccountCreate
from app.schemas.split_bill_schema import RepaymentUpdate, SplitBillDraft
from app.schemas.transaction_schema import TransactionUpdate
from app.services.account_service import AccountService
from app.services.report_service import ReportService
from app.services.split_bill_service import SplitBillService
from app.services.transaction_service import TransactionService


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


@pytest.mark.parametrize("cash, expected", [(False, "46.70"), (True, "54.90")])
def test_payment_debits_bank_once_and_cash_tip_is_excluded(db, cash, expected):
    bank = account(db)
    svc = SplitBillService(db, 1)
    bill = svc.save(draft(bank.id, tip_method="cash" if cash else "bank"))
    assert AccountService(db).get_account(bank.id).current_balance == Decimal("100")
    svc.pay(bill["id"])
    svc.pay(bill["id"])
    assert AccountService(db).get_account(bank.id).current_balance == Decimal(expected)
    assert db.query(TransactionModel).count() == 1


def test_repayments_override_partial_overpayment_and_undo_are_idempotent(db):
    bank = account(db)
    svc = SplitBillService(db, 1)
    bill = svc.save(draft(bank.id))
    svc.pay(bill["id"])
    for _ in range(2):
        svc.repay(bill["id"], "friend", RepaymentUpdate(received=True))
    assert AccountService(db).get_account(bank.id).current_balance == Decimal("67.50")
    for amount, balance in [("10", "56.70"), ("25", "71.70")]:
        updated = svc.repay(bill["id"], "friend", RepaymentUpdate(received=True, amount=amount))
        assert Decimal(updated["repayments"]["friend"]["amount"]) == Decimal(amount)
        assert AccountService(db).get_account(bank.id).current_balance == Decimal(balance)
        assert db.query(TransactionModel).count() == 2
    for _ in range(2):
        svc.repay(bill["id"], "friend", RepaymentUpdate(received=False))
    assert AccountService(db).get_account(bank.id).current_balance == Decimal("46.70")
    assert db.query(TransactionModel).count() == 1


def test_editing_paid_bill_adjusts_charge_and_preserves_actual_repayment(db):
    bank = account(db)
    svc = SplitBillService(db, 1)
    bill = svc.save(draft(bank.id))
    svc.pay(bill["id"])
    svc.repay(bill["id"], "friend", RepaymentUpdate(received=True, amount="20"))
    updated = svc.save(draft(bank.id, tip="10", receipt_total="55.10"), bill["id"])
    assert updated["repayments"]["friend"]["amount"] == "20"
    assert AccountService(db).get_account(bank.id).current_balance == Decimal("64.90")
    assert db.query(TransactionModel).count() == 2
    assert ReportService(db).monthly_report(9, 2026).total_expenses == Decimal("55.10")


@pytest.mark.parametrize("case", ["unassigned", "mismatch", "no_total", "no_account", "missing_account", "insufficient"])
def test_invalid_payment_cannot_change_balance(db, case):
    bank = account(db, "1" if case == "insufficient" else "100")
    data = draft(bank.id)
    if case == "unassigned": data.items[0].people = []
    if case == "mismatch": data.receipt_total = Decimal("99")
    if case == "no_total": data.receipt_total = None
    if case == "no_account": data.account_id = None
    if case == "missing_account": data.account_id = 999
    svc = SplitBillService(db, 1)
    bill = svc.save(data)
    with pytest.raises(HTTPException): svc.pay(bill["id"])
    assert db.query(TransactionModel).count() == 0
    assert not svc.read(svc.get(bill["id"]))["paid"]


def test_ownership_and_linked_transaction_guards(db):
    bank = account(db)
    svc = SplitBillService(db, 1)
    bill = svc.save(draft(bank.id))
    with pytest.raises(HTTPException): SplitBillService(db, 2).pay(bill["id"])
    assert SplitBillService(db, 2).list() == []
    svc.pay(bill["id"])
    txn = db.query(TransactionModel).one()
    with pytest.raises(HTTPException): TransactionService(db).delete_transaction(txn.id)
    with pytest.raises(HTTPException): TransactionService(db).update_transaction(txn.id, TransactionUpdate(amount="1"))
    with pytest.raises(HTTPException): AccountService(db).delete_account(bank.id)
    with pytest.raises(HTTPException): svc.repay(bill["id"], "self", RepaymentUpdate(received=True))


def test_parallel_payment_requests_only_charge_once(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'split.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        bank = account(db)
        account_id = bank.id
        bill = SplitBillService(db, 1).save(draft(account_id))
        bill_id = bill["id"]
    def pay():
        with Session(engine) as db:
            return SplitBillService(db, 1).pay(bill_id)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: pay(), range(2)))
    assert all(result["paid"] for result in results)
    with Session(engine) as db:
        assert db.query(TransactionModel).count() == 1
        assert AccountService(db).get_account(account_id).current_balance == Decimal("46.70")
    engine.dispose()


def test_paid_bill_cannot_drop_repaid_person_or_overdraw_with_edits(db):
    bank = account(db)
    svc = SplitBillService(db, 1)
    bill = svc.save(draft(bank.id))
    svc.pay(bill["id"])
    svc.repay(bill["id"], "friend", RepaymentUpdate(received=True, amount="20"))
    changed = draft(bank.id, tip="200", receipt_total="245.10")
    with pytest.raises(HTTPException): svc.save(changed, bill["id"])
    assert AccountService(db).get_account(bank.id).current_balance == Decimal("66.70")
    assert svc.read(svc.get(bill["id"]))["calculation"]["total"] == 5330
    removed = draft(bank.id)
    removed.people = removed.people[:1]
    for entry in removed.items: entry.people = ["self"]
    with pytest.raises(HTTPException): svc.save(removed, bill["id"])
    svc.repay(bill["id"], "friend", RepaymentUpdate(received=False))
    assert len(svc.save(removed, bill["id"])["data"]["people"]) == 1


def test_api_persists_friends_and_split_bill_and_requires_login():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy.pool import StaticPool
    from app.api.split_bills import router
    from app.core.database import get_db
    from app.core.security import get_current_user

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(UserModel(id=1, name="User", email="user@example.com", password_hash="test"))
        db.commit()
        bank_id = account(db).id
    app = FastAPI()
    app.include_router(router)
    def session():
        with Session(engine) as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app) as client:
        assert client.get("/split-bills").status_code in (401, 403)
        app.dependency_overrides[get_current_user] = lambda: UserModel(id=1)
        friend = client.post("/split-bills/friends", json={"name": "Friend"})
        assert friend.status_code == 201
        assert client.get("/split-bills/friends").json()[0]["name"] == "Friend"
        response = client.post("/split-bills", json=draft(bank_id).model_dump(mode="json"))
        assert response.status_code == 201
        bill_id = response.json()["id"]
        assert client.post(f"/split-bills/{bill_id}/pay").json()["paid"]
        response = client.put(f"/split-bills/{bill_id}/repayments/friend", json={"received": True, "amount": "25"})
        assert response.status_code == 200
        assert response.json()["repayments"]["friend"]["amount"] == "25"
        assert client.get("/split-bills").json()[0]["calculation"]["total"] == 5330
    engine.dispose()
