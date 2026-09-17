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

    Base.metadata.create_all(bind=engine)
    migrate_database()


def migrate_database(database_engine=engine) -> None:
    inspector = inspect(database_engine)
    tables = set(inspector.get_table_names())
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
