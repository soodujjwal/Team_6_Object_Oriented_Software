from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.database import Base, migrate_database
from app.repositories.models import TransactionModel, TransferModel
from app.schemas.account_schema import AccountCreate, AccountUpdate
from app.schemas.budget_schema import BudgetCreate
from app.schemas.transfer_schema import TransferCreate
from app.services.account_service import AccountService, total_available_balance
from app.services.budget_service import BudgetService
from app.services.report_service import ReportService
from app.services.transfer_service import TransferService


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def account(db, name, balance="100.00"):
    return AccountService(db).create_account(AccountCreate(
        bank_name="Test bank", name=name, starting_balance=balance,
    ))


def test_transfer_moves_only_selected_balances_and_preserves_reports_and_budgets(db):
    savings = account(db, "Savings")
    checking = account(db, "Checking", "20.00")
    untouched = account(db, "Second Savings", "50.00")
    other_checking = account(db, "Second Checking", "10.00")
    today = date.today()
    db.add(TransactionModel(account_id=savings.id, amount=Decimal("15.00"), category="Food",
                            transaction_type="expense", transaction_date=today))
    db.commit()
    budget = BudgetService(db).create_budget(BudgetCreate(category="Food", monthly_limit="60", month=today.month, year=today.year))
    before_report = ReportService(db).monthly_report(today.month, today.year)
    before_total = total_available_balance(db)

    transfer = TransferService(db).create(TransferCreate(
        from_account_id=savings.id, to_account_id=checking.id, amount="85.00", note="Rent money",
    ))

    assert transfer.transaction_type == "transfer"
    assert transfer.note == "Rent money"
    assert db.query(TransferModel).count() == 1
    assert db.query(TransactionModel).count() == 1
    balances = {item.id: item.current_balance for item in AccountService(db).list_accounts()}
    assert balances == {savings.id: Decimal("0"), checking.id: Decimal("105"), untouched.id: Decimal("50"), other_checking.id: Decimal("10")}
    assert total_available_balance(db) == before_total
    assert ReportService(db).monthly_report(today.month, today.year) == before_report
    assert BudgetService(db).get_budget(budget.id) == budget


@pytest.mark.parametrize("amount", ["0", "-1", "0.001", "NaN", "Infinity", "10000000000"])
def test_invalid_amounts_are_rejected(amount):
    with pytest.raises(ValidationError):
        TransferCreate(from_account_id=1, to_account_id=2, amount=amount)


@pytest.mark.parametrize("case", ["overdraft", "missing_source", "missing_destination", "same", "reversed", "other"])
def test_invalid_transfers_leave_no_partial_changes(db, case):
    savings = account(db, "Savings")
    checking = account(db, "Checking")
    source, destination, amount = savings.id, checking.id, "1"
    if case == "overdraft":
        amount = "100.01"
    elif case == "missing_source":
        source = 999
    elif case == "missing_destination":
        destination = 999
    elif case == "same":
        destination = source
    elif case == "reversed":
        source, destination = destination, source
    elif case == "other":
        AccountService(db).update_account(savings.id, AccountUpdate(account_type="other"))
    with pytest.raises(HTTPException):
        TransferService(db).create(TransferCreate(from_account_id=source, to_account_id=destination, amount=amount))
    assert db.query(TransferModel).count() == 0
    assert total_available_balance(db) == Decimal("200")


def test_transfer_account_rename_preserves_type_and_delete_preserves_ledger(db):
    savings, checking = account(db, "Savings"), account(db, "Checking")
    AccountService(db).update_account(savings.id, AccountUpdate(name="Emergency fund"))
    assert AccountService(db).get_account(savings.id).account_type == "savings"
    TransferService(db).create(TransferCreate(from_account_id=savings.id, to_account_id=checking.id, amount="25"))
    with pytest.raises(HTTPException) as error:
        AccountService(db).delete_account(savings.id)
    assert error.value.status_code == 409
    assert AccountService(db).get_account(checking.id).current_balance == Decimal("125")


def test_migration_classifies_existing_accounts_and_is_repeatable():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE accounts (id INTEGER PRIMARY KEY, name VARCHAR(100), starting_balance NUMERIC(12,2))"))
        connection.execute(text("INSERT INTO accounts (name, starting_balance) VALUES ('Travel SAVINGS', 50), ('Checking', 20), ('Cash', 10)"))
    migrate_database(engine)
    migrate_database(engine)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT account_type FROM accounts ORDER BY id")).scalars().all() == ["savings", "checking", "other"]
    engine.dispose()


def test_competing_transfers_cannot_overdraw_savings(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'transfers.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        savings, checking = account(db, "Savings"), account(db, "Checking", "0")
        source, destination = savings.id, checking.id

    def attempt():
        with Session(engine) as db:
            try:
                TransferService(db).create(TransferCreate(from_account_id=source, to_account_id=destination, amount="75"))
                return "moved"
            except HTTPException as error:
                assert error.status_code == 400
                return "rejected"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: attempt(), range(2)))
    assert sorted(outcomes) == ["moved", "rejected"]
    with Session(engine) as db:
        assert AccountService(db).get_account(source).current_balance == Decimal("25")
        assert AccountService(db).get_account(destination).current_balance == Decimal("75")
    engine.dispose()
