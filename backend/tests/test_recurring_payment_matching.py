from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.repositories.models import AccountModel  # noqa: F401
from app.schemas.recurring_transaction_schema import RecurringTransactionCreate
from app.schemas.transaction_schema import TransactionCreate
from app.services.recurring_transaction_service import RecurringTransactionService
from app.services.transaction_service import TransactionService


def session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()


def test_matching_transaction_marks_recurring_bill_paid_and_advances_due_date():
    db = session()
    account = AccountModel(bank_name="Chase", name="Checking", starting_balance=Decimal("500.00"))
    db.add(account)
    db.commit()
    db.refresh(account)

    recurring = RecurringTransactionService(db).create_recurring_transaction(
        RecurringTransactionCreate(
            name="Netflix",
            account_id=account.id,
            amount=Decimal("15.49"),
            category="Subscriptions",
            transaction_type="expense",
            frequency="monthly",
            next_due_date=date(2026, 9, 15),
            auto_pay_status=True,
        )
    )

    assert recurring.last_paid_date is None

    TransactionService(db).create_transaction(
        TransactionCreate(
            account_id=account.id,
            amount=Decimal("15.49"),
            category="Subscriptions",
            transaction_type="expense",
            transaction_date=date(2026, 9, 15),
            note="Netflix monthly subscription",
        )
    )

    updated = RecurringTransactionService(db).get_recurring_transaction(recurring.id)
    assert updated.last_paid_date == date(2026, 9, 15)
    assert updated.next_due_date == date(2026, 10, 15)


def test_due_date_alone_does_not_mark_recurring_bill_paid():
    db = session()
    account = AccountModel(bank_name="Chase", name="Checking", starting_balance=Decimal("500.00"))
    db.add(account)
    db.commit()
    db.refresh(account)

    recurring = RecurringTransactionService(db).create_recurring_transaction(
        RecurringTransactionCreate(
            name="Internet",
            account_id=account.id,
            amount=Decimal("80.00"),
            category="Utilities",
            transaction_type="expense",
            frequency="monthly",
            next_due_date=date(2026, 1, 1),
        )
    )

    unchanged = RecurringTransactionService(db).get_recurring_transaction(recurring.id)
    assert unchanged.last_paid_date is None
    assert unchanged.next_due_date == date(2026, 1, 1)
