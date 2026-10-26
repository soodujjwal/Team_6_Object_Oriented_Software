from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    get_settings().database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_database() -> None:
    from app.repositories import models  # noqa: F401

    _backup_before_financial_migration()
    Base.metadata.create_all(bind=engine)
    migrate_database()


def _backup_before_financial_migration():
    from datetime import datetime, timezone
    from pathlib import Path
    import sqlite3

    if engine.dialect.name != "sqlite" or not engine.url.database or engine.url.database == ":memory:":
        return
    source = Path(engine.url.database).resolve()
    if not source.is_file():
        return
    inspector = inspect(engine)
    if "accounts" not in inspector.get_table_names():
        return
    if "bank_current_balance" in {column["name"] for column in inspector.get_columns("accounts")}:
        return
    backup_dir = source.parent / ".vite" / "database-backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"before-iteration3-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.sqlite3"
    original, backup = sqlite3.connect(str(source)), sqlite3.connect(str(target))
    try:
        original.backup(backup)
    finally:
        backup.close()
        original.close()


def migrate_database(database_engine=engine) -> None:
    inspector = inspect(database_engine)
    tables = set(inspector.get_table_names())
    additions = {
        "accounts": {"user_id": "INTEGER REFERENCES users(id)", "bank_current_balance": "NUMERIC(12, 2)",
                     "bank_available_balance": "NUMERIC(12, 2)", "balance_synced_at": "DATETIME"},
        "transactions": {"financial_kind": "VARCHAR(30) NOT NULL DEFAULT 'standard'", "personal_amount": "NUMERIC(12, 2)"},
    }
    for table, columns in additions.items():
        if table not in tables:
            continue
        existing = {column["name"] for column in inspector.get_columns(table)}
        with database_engine.begin() as connection:
            for column, definition in columns.items():
                if column not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
    if {"accounts", "users", "plaid_account_links", "plaid_items"}.issubset(tables):
        with database_engine.begin() as connection:
            connection.execute(text("""UPDATE accounts SET user_id = (
                SELECT p.user_id FROM plaid_account_links l JOIN plaid_items p ON p.id=l.plaid_item_id
                WHERE l.account_id=accounts.id) WHERE user_id IS NULL"""))
            # Only attribute legacy manual accounts when ownership is unambiguous.
            connection.execute(text("""UPDATE accounts SET user_id=(SELECT MIN(id) FROM users)
                WHERE user_id IS NULL AND (SELECT COUNT(*) FROM users)=1"""))
    if "users" in tables:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "phone_number" not in user_columns:
            with database_engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE users ADD COLUMN phone_number VARCHAR(14) NOT NULL DEFAULT ''")
                )
        if "occupation" not in user_columns:
            with database_engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE users ADD COLUMN occupation VARCHAR(100) NOT NULL DEFAULT ''")
                )

    if "accounts" in tables:
        account_columns = {column["name"] for column in inspector.get_columns("accounts")}
        if "account_type" not in account_columns:
            with database_engine.begin() as connection:
                connection.execute(text("ALTER TABLE accounts ADD COLUMN account_type VARCHAR(20) NOT NULL DEFAULT 'other'"))
                connection.execute(text("UPDATE accounts SET account_type = CASE WHEN LOWER(name) LIKE '%savings%' THEN 'savings' WHEN LOWER(name) LIKE '%checking%' THEN 'checking' ELSE 'other' END"))
        if "bank_name" not in account_columns:
            with database_engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE accounts ADD COLUMN bank_name VARCHAR(100) NOT NULL DEFAULT 'Other'")
                )
        if "phone_number" in account_columns and database_engine.dialect.name == "sqlite":
            with database_engine.begin() as connection:
                connection.execute(text("ALTER TABLE accounts DROP COLUMN phone_number"))

    if "transactions" in tables:
        transaction_columns = {column["name"] for column in inspector.get_columns("transactions")}
        with database_engine.begin() as connection:
            if "receipt_items" not in transaction_columns:
                connection.execute(text("ALTER TABLE transactions ADD COLUMN receipt_items JSON"))
            if "receipt_metadata" not in transaction_columns:
                connection.execute(text("ALTER TABLE transactions ADD COLUMN receipt_metadata JSON"))

    if "recurring_transactions" in tables:
        recurring_columns = {column["name"] for column in inspector.get_columns("recurring_transactions")}
        with database_engine.begin() as connection:
            if "name" not in recurring_columns:
                connection.execute(text("ALTER TABLE recurring_transactions ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT ''"))
            if "auto_pay_status" not in recurring_columns:
                connection.execute(text("ALTER TABLE recurring_transactions ADD COLUMN auto_pay_status BOOLEAN NOT NULL DEFAULT 0"))
            if "reminder_settings" not in recurring_columns:
                connection.execute(text("ALTER TABLE recurring_transactions ADD COLUMN reminder_settings JSON"))
            if "last_paid_date" not in recurring_columns:
                connection.execute(text("ALTER TABLE recurring_transactions ADD COLUMN last_paid_date DATE"))
            if "last_matched_transaction_id" not in recurring_columns:
                connection.execute(text("ALTER TABLE recurring_transactions ADD COLUMN last_matched_transaction_id INTEGER"))

    if "savings_goals" in tables:
        savings_goal_columns = {column["name"] for column in inspector.get_columns("savings_goals")}
        if "monthly_income" not in savings_goal_columns:
            with database_engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE savings_goals ADD COLUMN monthly_income NUMERIC(12, 2) NOT NULL DEFAULT 0")
                )

    if "budgets" in tables:
        budget_columns = {column["name"] for column in inspector.get_columns("budgets")}
        if "user_id" not in budget_columns:
            with database_engine.begin() as connection:
                connection.execute(text("ALTER TABLE budgets ADD COLUMN user_id INTEGER REFERENCES users(id)"))
                connection.execute(text("UPDATE budgets SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_budgets_user_id ON budgets(user_id)"))

    if {"split_bills", "transactions", "transfers"}.issubset(tables):
        _migrate_financial_links(database_engine)


def _migrate_financial_links(database_engine):
    """Backfill classification for old bills and transfer legs without new cash movement."""
    from decimal import Decimal
    from pydantic import ValidationError
    from app.domain.split_bill import calculate_bill
    from app.repositories.models import SplitBillModel, TransactionModel, TransferModel
    from app.schemas.split_bill_schema import SplitBillDraft

    with Session(database_engine) as db:
        for bill in db.query(SplitBillModel):
            payment = db.get(TransactionModel, bill.payment_transaction_id) if bill.payment_transaction_id else None
            if payment:
                try:
                    draft = SplitBillDraft.model_validate(bill.data)
                    payment.personal_amount = Decimal(next(p["total"] for p in calculate_bill(draft)["people"]
                                                           if p["id"] == draft.self_id)) / 100
                    payment.receipt_metadata = {**(payment.receipt_metadata or {}), "split_bill_id": bill.id}
                except (ValidationError, ValueError, StopIteration):
                    continue
            for repayment in bill.repayments.values():
                entries = repayment.get("payments", [repayment])
                for entry in entries:
                    transaction = db.get(TransactionModel, entry.get("transaction_id"))
                    if transaction:
                        transaction.financial_kind = "reimbursement"
                        transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "split_bill_id": bill.id}
        rows = db.query(TransactionModel).all()
        for transfer in db.query(TransferModel):
            for account_id, direction in [(transfer.from_account_id, "expense"), (transfer.to_account_id, "income")]:
                if any(t.account_id == account_id and (t.receipt_metadata or {}).get("transfer_id") == transfer.id for t in rows):
                    continue
                transaction = TransactionModel(account_id=account_id, amount=transfer.amount, category="Transfer",
                    transaction_type=direction, transaction_date=transfer.transfer_date, note=transfer.note or "Transfer between own accounts",
                    financial_kind="transfer", receipt_metadata={"transfer_id": transfer.id})
                rows.append(transaction)
                db.add(transaction)
        db.commit()
