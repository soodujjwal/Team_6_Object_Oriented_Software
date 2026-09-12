import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.core.database import Base, migrate_database
from app.repositories.models import AccountModel, UserModel
from app.schemas.account_schema import AccountCreate
from app.schemas.auth_schema import RegisterRequest
from app.services.account_service import AccountService
from app.services.auth_service import AuthService


def test_registration_persists_phone_number_on_user_profile():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        session = AuthService(db).register(
            RegisterRequest(
                name="Alex Morgan",
                email="alex@example.com",
                phone_number="(555) 123-4567",
                password="securepass123",
            )
        )

        stored_user = db.query(UserModel).one()
        assert session.user.phone_number == "(555) 123-4567"
        assert stored_user.phone_number == "(555) 123-4567"
        assert not hasattr(AccountModel, "phone_number")

    engine.dispose()


def test_registration_rejects_malformed_phone_number():
    with pytest.raises(ValidationError):
        RegisterRequest(
            name="Alex Morgan",
            email="alex@example.com",
            phone_number="555123",
            password="securepass123",
        )


def test_financial_account_creation_needs_no_phone_number():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        account = AccountService(db).create_account(
            AccountCreate(bank_name="Chase", name="Checking", starting_balance="0")
        )

        assert account.bank_name == "Chase"
        assert account.name == "Checking"
        assert account.starting_balance == 0
        assert "phone_number" not in account.model_dump()

    engine.dispose()


def test_migration_adds_user_phone_column_and_drops_account_phone_column():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, "
            "email VARCHAR(255) NOT NULL, password_hash VARCHAR(255) NOT NULL)"
        ))
        connection.execute(text(
            "CREATE TABLE accounts (id INTEGER PRIMARY KEY, bank_name VARCHAR(100) NOT NULL, "
            "name VARCHAR(100) NOT NULL, phone_number VARCHAR(14) NOT NULL DEFAULT '', "
            "starting_balance NUMERIC(12, 2) NOT NULL)"
        ))

    migrate_database(engine)
    inspector = inspect(engine)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    account_columns = {column["name"] for column in inspector.get_columns("accounts")}

    assert "phone_number" in user_columns
    assert "phone_number" not in account_columns
    engine.dispose()
