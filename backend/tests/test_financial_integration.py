from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, migrate_database
from app.repositories.models import AccountModel, TransactionModel, UserModel, PlaidTransactionLinkModel, RecurringTransactionModel
from app.schemas.split_bill_schema import SplitBillDraft, RepaymentCreate
from app.schemas.transaction_schema import TransactionCreate
from app.services.account_service import AccountService
from app.services.plaid_service import PlaidService
from app.services.report_service import ReportService
from app.services.split_bill_service import SplitBillService
from app.services.transaction_service import TransactionService
from app.services.transaction_matching import suggestions, merge
from test_plaid_service import FakePlaidClient


class Bank(FakePlaidClient):
    balance = 1000

    def __init__(self):
        super().__init__()
        self.sync_responses[0]["added"] = []

    def post(self, path, payload):
        result = super().post(path, payload)
        if path == "/accounts/get":
            result["accounts"][0]["balances"] = {"current": self.balance, "available": self.balance - 10}
        return result


@pytest.fixture(params=["sqlite", "mongodb", "atlas"])
def setup(request):
    if request.param == "atlas":
        import os
        from uuid import uuid4
        if os.getenv("FINANCE_MONGO_LIVE_TESTS") != "1":
            pytest.skip("Opt in with FINANCE_MONGO_LIVE_TESTS=1 for isolated Atlas tests.")
        from app.core.database import get_mongo_client, ensure_indexes
        from app.core.mongo_store import MongoSession
        name = f"finance_builder_test_{uuid4().hex[:12]}"
        client = get_mongo_client()
        database = client[name]
        ensure_indexes(database)
        try:
            with MongoSession(database) as db:
                db.add(UserModel(id=1, name="User", email="one@test.com", password_hash="test"))
                db.commit()
                bank = Bank()
                service = PlaidService(db, bank)
                service.exchange(1, "public")
                db.info["user_id"] = 1
                yield db, bank, service, db.query(AccountModel).one()
        finally:
            assert name.startswith("finance_builder_test_")
            client.drop_database(name)
        return
    if request.param == "mongodb":
        import mongomock
        from app.core.database import ensure_indexes
        from app.core.mongo_store import MongoSession
        database = mongomock.MongoClient().finance_test
        ensure_indexes(database)
        with MongoSession(database, testing_without_transactions=True) as db:
            db.add(UserModel(id=1, name="User", email="one@test.com", password_hash="test"))
            db.commit()
            client = Bank()
            service = PlaidService(db, client)
            service.exchange(1, "public")
            db.info["user_id"] = 1
            yield db, client, service, db.query(AccountModel).one()
        return
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, autoflush=False) as db:
        db.add(UserModel(id=1, name="User", email="one@test.com", password_hash="test"))
        db.commit()
        client = Bank()
        service = PlaidService(db, client)
        service.exchange(1, "public")
        db.info["user_id"] = 1
        yield db, client, service, db.query(AccountModel).one()
    engine.dispose()


def entry(id="bank-1", amount=25, name="Coffee shop", **extra):
    return dict(transaction_id=id, account_id="plaid-account-1", amount=amount, date="2026-09-20",
                name=name, personal_finance_category={"primary": "FOOD_AND_DRINK"}, **extra)


def sync(client, service, added=None, modified=None, removed=None):
    client.sync_responses.append(dict(added=added or [], modified=modified or [], removed=removed or [],
                                      has_more=False, next_cursor="next"))
    service.sync_user(1)


def test_sync_retries_transient_conflict_without_duplicate_imports(setup, monkeypatch):
    from copy import deepcopy
    from pymongo.errors import OperationFailure

    db, client, service, account = setup
    if getattr(db, "testing_without_transactions", False):
        pytest.skip("This check requires real transaction rollback.")
    page = dict(added=[entry("retry-charge")], modified=[], removed=[],
                has_more=False, next_cursor="after-retry")
    client.sync_responses.extend([deepcopy(page), deepcopy(page)])
    reconcile = service._reconcile_balances
    attempts = []

    def conflict_once(item, balances):
        reconcile(item, balances)
        attempts.append(item.id)
        if len(attempts) == 1:
            raise OperationFailure("simulated write conflict", code=112,
                                   details={"errorLabels": ["TransientTransactionError"]})

    monkeypatch.setattr(service, "_reconcile_balances", conflict_once)
    result = service.sync_user(1)
    assert result == {"added": 1, "modified": 0, "removed": 0}
    assert len(attempts) == 2
    assert db.query(TransactionModel).count() == 1
    assert db.query(PlaidTransactionLinkModel).count() == 1
    assert AccountService(db).get_account(account.id).current_balance == Decimal("1000.00")


def test_sync_fetches_bank_data_outside_native_transaction(setup, monkeypatch):
    db, client, service, _ = setup
    if not hasattr(db, "native_session") or db.testing_without_transactions:
        pytest.skip("This check requires a native MongoDB session.")
    post = client.post
    requests = []

    def checked_post(path, payload):
        assert not db.native_session.in_transaction
        requests.append(path)
        return post(path, payload)

    client.sync_responses.append(dict(added=[], modified=[], removed=[], has_more=False, next_cursor="next"))
    monkeypatch.setattr(client, "post", checked_post)
    service.sync_user(1)
    assert requests == ["/transactions/sync", "/accounts/get"]


def manual(db, account, amount="25", note="Coffee shop", direction="expense"):
    return TransactionService(db).create_transaction(TransactionCreate(account_id=account.id, amount=amount,
        category="Food & Dining", transaction_type=direction, transaction_date="2026-09-20", note=note))


def bill(db, account):
    svc = SplitBillService(db, 1)
    saved = svc.save(SplitBillDraft(title="Dinner", people=[dict(id="self", name="Me"), dict(id="friend", name="Alex")],
        self_id="self", items=[dict(id="dinner", name="Dinner", quantity=1, price="100", people=["self", "friend"])],
        tax="0", tip="0", receipt_total="100", account_id=account.id, bill_date="2026-09-20"))
    return svc, saved["id"]


def test_manual_import_matching_preserves_id_and_separates_balance(setup):
    db, client, service, account = setup
    saved = manual(db, account)
    before = AccountService(db).get_account(account.id)
    assert before.bank_current_balance == Decimal("1000")
    assert before.estimated_balance == Decimal("975")
    client.balance = 975
    sync(client, service, added=[entry()])
    assert db.query(TransactionModel).count() == 1
    assert db.query(TransactionModel).one().id == saved.id
    after = AccountService(db).get_account(account.id)
    assert after.current_balance == after.bank_current_balance == Decimal("975")
    assert after.unmatched_movement == 0
    assert after.bank_available_balance == Decimal("965")
    sync(client, service, added=[entry()])
    assert db.query(TransactionModel).count() == 1


def test_ambiguous_matches_require_confirmation_and_reject_reuse(setup):
    db, client, service, account = setup
    first = manual(db, account)
    second = manual(db, account)
    sync(client, service, added=[entry(), entry("bank-2")])
    assert len(suggestions(db)) == 4
    assert db.query(TransactionModel).count() == 4
    candidate = suggestions(db)[0]
    merge(db, candidate["manual_id"], candidate["bank_transaction_id"])
    assert db.query(TransactionModel).count() == 3
    with pytest.raises(HTTPException):
        merge(db, candidate["manual_id"], candidate["bank_transaction_id"])
    assert first.id != second.id


def test_pending_to_posted_across_pages_keeps_same_transaction(setup):
    db, client, service, account = setup
    sync(client, service, added=[entry("pending", pending=True)])
    original = db.query(TransactionModel).one().id
    assert ReportService(db).monthly_report(9, 2026).total_expenses == 0
    client.sync_responses.extend([
        dict(added=[], modified=[], removed=[{"transaction_id": "pending"}], has_more=True, next_cursor="page2"),
        dict(added=[entry("posted", amount=30, pending=False, pending_transaction_id="pending")],
             modified=[], removed=[], has_more=False, next_cursor="done")])
    service.sync_user(1)
    assert db.query(TransactionModel).one().id == original
    assert db.query(PlaidTransactionLinkModel).one().plaid_transaction_id == "posted"
    assert ReportService(db).monthly_report(9, 2026).total_expenses == Decimal("30")


def test_split_payment_two_repayments_then_bank_sync_counts_money_once(setup):
    db, client, service, account = setup
    svc, id = bill(db, account)
    saved = svc.pay(id)
    payment_id = saved["payment_transaction_id"]
    assert AccountService(db).get_account(account.id).current_balance == Decimal("900")
    client.balance = 900
    sync(client, service, added=[entry("dinner", amount=100, name="Restaurant")])
    imported = db.query(PlaidTransactionLinkModel).one().transaction_id
    merge(db, payment_id, imported)
    assert db.query(TransactionModel).count() == 1
    report = ReportService(db).monthly_report(9, 2026)
    assert report.total_expenses == Decimal("50")
    assert report.total_income == 0
    for index in [1, 2]:
        saved = svc.add_repayment(id, "friend", RepaymentCreate(amount="25", request_id=f"payment-{index}", payment_date="2026-09-20"))
        repayment_id = saved["repayments"]["friend"]["transaction_id"]
        client.balance = 900 + index * 25
        sync(client, service, added=[entry(f"repay-{index}", amount=-25, name="Alex repayment")])
        imported = db.query(PlaidTransactionLinkModel).filter_by(plaid_transaction_id=f"repay-{index}").one().transaction_id
        merge(db, repayment_id, imported)
    final = svc.read(svc.get(id))
    assert Decimal(final["repayments"]["friend"]["amount"]) == Decimal("50")
    assert len(final["repayments"]["friend"]["payments"]) == 2
    assert AccountService(db).get_account(account.id).current_balance == Decimal("950")
    assert db.query(TransactionModel).count() == 3
    assert ReportService(db).monthly_report(9, 2026).total_income == 0


def test_attach_existing_charge_and_income_without_new_movements(setup):
    db, client, service, account = setup
    sync(client, service, added=[entry("dinner", 100), entry("repay", -20)])
    svc, id = bill(db, account)
    charge = db.query(TransactionModel).filter_by(transaction_type="expense").one()
    incoming = db.query(TransactionModel).filter_by(transaction_type="income").one()
    svc.pay(id, charge.id)
    payload = RepaymentCreate(transaction_id=incoming.id, request_id="confirmed", payment_date="2026-09-20")
    svc.add_repayment(id, "friend", payload)
    svc.add_repayment(id, "friend", payload)
    assert db.query(TransactionModel).count() == 2
    assert ReportService(db).monthly_report(9, 2026).total_income == 0
    svc.remove_repayment(id, "friend", "confirmed")
    assert db.query(TransactionModel).count() == 2
    assert incoming.financial_kind == "standard"


def test_same_bank_payment_cannot_pay_two_bills(setup):
    db, client, service, account = setup
    sync(client, service, added=[entry("dinner", 100)])
    charge = db.query(TransactionModel).one()
    svc, first = bill(db, account)
    _, second = bill(db, account)
    svc.pay(first, charge.id)
    with pytest.raises(HTTPException):
        svc.pay(second, charge.id)
    assert db.query(TransactionModel).count() == 1


def test_removed_bank_repayment_preserves_history_but_restores_outstanding(setup):
    db, client, service, account = setup
    svc, id = bill(db, account)
    svc.pay(id)
    sync(client, service, added=[entry("repay", -50)])
    incoming = db.query(PlaidTransactionLinkModel).one().transaction_id
    svc.add_repayment(id, "friend", RepaymentCreate(transaction_id=incoming, request_id="repay"))
    sync(client, service, removed=[{"transaction_id": "repay"}])
    saved = svc.read(svc.get(id))
    assert saved["needs_review"]
    assert Decimal(saved["repayments"]["friend"]["amount"]) == 0
    assert len(saved["repayments"]["friend"]["payments"]) == 1


def test_plaid_recurring_payment_is_idempotent_and_reversal_restores_due_date(setup):
    db, client, service, account = setup
    schedule = RecurringTransactionModel(account_id=account.id, name="Netflix", amount=Decimal("25"),
        category="Subscriptions", transaction_type="expense", frequency="monthly", next_due_date=date(2026, 9, 20))
    db.add(schedule)
    db.commit()
    sync(client, service, added=[entry(name="Netflix")])
    assert schedule.next_due_date == date(2026, 10, 20)
    sync(client, service)
    assert schedule.next_due_date == date(2026, 10, 20)
    sync(client, service, removed=[{"transaction_id": "bank-1"}])
    assert schedule.next_due_date == date(2026, 9, 20)
    assert schedule.last_paid_date is None


def test_cross_user_transactions_and_matching_are_inaccessible(setup):
    db, client, service, account = setup
    saved = manual(db, account)
    db.info["user_id"] = 2
    assert AccountService(db).list_accounts() == []
    assert TransactionService(db).list_transactions() == []
    assert suggestions(db) == []
    with pytest.raises(HTTPException):
        AccountService(db).get_account(account.id)
    with pytest.raises(HTTPException):
        TransactionService(db).get_transaction(saved.id)
    with pytest.raises(HTTPException):
        merge(db, saved.id, saved.id)


def test_database_migration_is_repeatable_and_preserves_data(setup):
    db, client, service, account = setup
    if hasattr(db, "database"):
        pytest.skip("SQLite legacy migration; MongoDB starts with fresh collections.")
    id = account.id
    migrate_database(db.get_bind())
    migrate_database(db.get_bind())
    assert db.get(AccountModel, id).bank_current_balance == Decimal("1000")


def test_disconnect_preserves_estimate_and_imported_history(setup):
    db, client, service, account = setup
    manual(db, account, amount="10", note="Unmatched purchase")
    sync(client, service, added=[entry()])
    before = AccountService(db).get_account(account.id).current_balance
    connection = service.status(1)["connections"][0]["id"]
    service.disconnect(1, connection)
    after = AccountService(db).get_account(account.id)
    assert after.current_balance == before
    assert after.bank_current_balance is None
    assert db.query(TransactionModel).count() == 2


def test_import_before_manual_entry_matches_the_same_record(setup):
    db, client, service, account = setup
    sync(client, service, added=[entry()])
    saved = manual(db, account)
    assert db.query(TransactionModel).count() == 1
    assert db.query(PlaidTransactionLinkModel).one().transaction_id == saved.id
    assert AccountService(db).get_account(account.id).unmatched_movement == 0


def test_changed_linked_bank_charge_preserves_split_and_flags_review(setup):
    db, client, service, account = setup
    sync(client, service, added=[entry("dinner", 100)])
    svc, id = bill(db, account)
    payment = db.query(TransactionModel).one()
    svc.pay(id, payment.id)
    sync(client, service, modified=[entry("dinner", 110)])
    saved = svc.read(svc.get(id))
    assert saved["needs_review"]
    assert saved["payment_transaction_id"] == payment.id
    assert db.query(TransactionModel).count() == 1


def test_repayment_from_another_users_account_is_rejected(setup):
    db, client, service, account = setup
    svc, id = bill(db, account)
    svc.pay(id)
    db.info.pop("user_id", None)
    db.add(UserModel(id=2, name="Other", email="two@test.com", password_hash="test"))
    db.commit()
    other = AccountModel(user_id=2, bank_name="Other", name="Private", starting_balance=Decimal("100"))
    db.add(other)
    db.flush()
    incoming = TransactionModel(account_id=other.id, amount=Decimal("50"), category="Salary",
        transaction_type="income", transaction_date=date(2026, 9, 20))
    db.add(incoming)
    db.commit()
    db.info["user_id"] = 1
    assert incoming.id not in [t.id for t in svc.candidates(id, "friend")]
    with pytest.raises(HTTPException):
        svc.add_repayment(id, "friend", RepaymentCreate(transaction_id=incoming.id, request_id="wrong-owner"))
    assert svc.read(svc.get(id))["repayments"] == {}


def test_api_round_trip_and_actual_authentication_scope(setup):
    from fastapi import FastAPI, Depends
    from fastapi.testclient import TestClient
    from app.api import accounts, transactions, split_bills
    from app.core.database import get_db
    from app.core.security import create_access_token, get_current_user

    db, client, service, account = setup
    db.info.pop("user_id", None)
    db.add(UserModel(id=2, name="Other", email="two@test.com", password_hash="test"))
    db.commit()
    db.info["user_id"] = 1
    app = FastAPI()
    for router in [accounts.router, transactions.router, split_bills.router]:
        app.include_router(router, dependencies=[Depends(get_current_user)])
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as api:
        assert api.get("/accounts").status_code in {401, 403}
        owner = {"Authorization": f"Bearer {create_access_token('one@test.com')}"}
        stranger = {"Authorization": f"Bearer {create_access_token('two@test.com')}"}
        assert api.get("/accounts", headers=stranger).json() == []
        response = api.get("/accounts", headers=owner)
        assert response.json()[0]["bank_current_balance"] == "1000.00"
        created = api.post("/transactions", headers=owner, json=dict(account_id=account.id, amount="25",
            category="Food & Dining", transaction_type="expense", transaction_date="2026-09-20", note="Receipt coffee"))
        assert created.status_code == 201
        id = created.json()["id"]
        assert api.get(f"/transactions/{id}", headers=stranger).status_code == 404
        api.get("/accounts", headers=owner)
        sync(client, service, added=[entry()])
        matches = api.get("/transactions/matches", headers=owner).json()
        assert len(matches) == 1
        matched = api.post(f"/transactions/{id}/match", headers=owner,
                           json={"bank_transaction_id": matches[0]["bank_transaction_id"]})
        assert matched.status_code == 200
        assert matched.json()["reporting_amount"] == "25.00"
        assert len(api.get("/transactions", headers=owner).json()) == 1


def test_unlinking_bank_charge_keeps_history_and_allows_correcting_bill(setup):
    db, client, service, account = setup
    sync(client, service, added=[entry("dinner", 100)])
    charge = db.query(TransactionModel).one()
    svc, id = bill(db, account)
    svc.pay(id, charge.id)
    result = svc.unlink_payment(id)
    assert not result["paid"]
    assert db.query(TransactionModel).count() == 1
    assert charge.personal_amount is None
    assert charge.reporting_amount == Decimal("100")
    svc.pay(id, charge.id)
    assert charge.reporting_amount == Decimal("50")


def test_editing_bank_annotations_preserves_sync_facts_and_recategorization(setup):
    from app.schemas.transaction_schema import TransactionUpdate
    db, client, service, account = setup
    sync(client, service, added=[entry()])
    transaction = db.query(TransactionModel).one()
    svc = TransactionService(db)
    svc.update_transaction(transaction.id, TransactionUpdate(category="Travel", financial_kind="reimbursement"))
    assert ReportService(db).monthly_report(9, 2026).total_expenses == 0
    sync(client, service, modified=[entry(amount=30)])
    assert transaction.category == "Travel"
    assert transaction.financial_kind == "reimbursement"
    assert transaction.amount == Decimal("30")
    with pytest.raises(HTTPException):
        svc.update_transaction(transaction.id, TransactionUpdate(amount="500"))


def test_migration_backfills_legacy_split_classification_without_changing_cash(setup):
    from app.schemas.split_bill_schema import RepaymentUpdate
    db, client, service, account = setup
    if hasattr(db, "database"):
        pytest.skip("SQLite legacy migration; MongoDB starts with fresh collections.")
    svc, id = bill(db, account)
    svc.pay(id)
    svc.repay(id, "friend", RepaymentUpdate(received=True, amount="20"))
    for transaction in db.query(TransactionModel):
        transaction.personal_amount = None
        transaction.financial_kind = "standard"
    db.commit()
    before = AccountService(db).get_account(account.id).current_balance
    migrate_database(db.get_bind())
    migrate_database(db.get_bind())
    db.expire_all()
    assert AccountService(db).get_account(account.id).current_balance == before
    report = ReportService(db).monthly_report(9, 2026)
    assert report.total_income == 0
    assert report.total_expenses == Decimal("50")


def test_transfer_leg_can_match_bank_without_double_counting_or_spending(setup):
    from app.schemas.transfer_schema import TransferCreate
    from app.services.transfer_service import TransferService
    db, client, service, account = setup
    savings = AccountModel(user_id=1, bank_name="Bank", name="Savings", account_type="savings", starting_balance=Decimal("100"))
    db.add(savings)
    db.commit()
    TransferService(db).create(TransferCreate(from_account_id=savings.id, to_account_id=account.id, amount="50"))
    manual_leg = db.query(TransactionModel).filter_by(account_id=account.id).one()
    client.balance = 1050
    imported_transfer = entry("transfer", -50, name="Transfer credit")
    imported_transfer["date"] = manual_leg.transaction_date.isoformat()
    sync(client, service, added=[imported_transfer])
    imported = db.query(PlaidTransactionLinkModel).one().transaction_id
    merge(db, manual_leg.id, imported)
    assert AccountService(db).get_account(account.id).current_balance == Decimal("1050")
    assert AccountService(db).get_account(savings.id).current_balance == Decimal("50")
    report = ReportService(db).monthly_report(9, 2026)
    assert report.total_income == report.total_expenses == 0
