from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.core.database import Base, migrate_database
from app.schemas.budget_schema import BudgetCreate, BudgetUpdate
from app.services.budget_service import BudgetService


def budget_payload(amount: str = "400") -> BudgetCreate:
    return BudgetCreate(category="Food", monthly_limit=amount, month=10, year=2026)


def test_budgets_are_isolated_by_user():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        first_user = BudgetService(db, user_id=1)
        second_user = BudgetService(db, user_id=2)
        created = first_user.create_budget(budget_payload())

        assert len(first_user.list_budgets()) == 1
        assert second_user.list_budgets() == []
        with pytest.raises(HTTPException) as get_error:
            second_user.get_budget(created.id)
        assert get_error.value.status_code == 404
        with pytest.raises(HTTPException):
            second_user.update_budget(created.id, BudgetUpdate(monthly_limit=Decimal("500")))
        with pytest.raises(HTTPException):
            second_user.delete_budget(created.id)

    engine.dispose()


def test_users_can_use_the_same_category_and_month():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        BudgetService(db, user_id=1).create_budget(budget_payload("400"))
        BudgetService(db, user_id=2).create_budget(budget_payload("500"))

        assert BudgetService(db, user_id=1).list_budgets()[0].monthly_limit == Decimal("400")
        assert BudgetService(db, user_id=2).list_budgets()[0].monthly_limit == Decimal("500")

    engine.dispose()


def test_budget_migration_assigns_existing_rows_to_the_first_user():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(100), email VARCHAR(255), password_hash VARCHAR(255))"))
        connection.execute(text("INSERT INTO users (id, name, email, password_hash) VALUES (4, 'Existing', 'existing@example.com', 'hash'), (9, 'New', 'new@example.com', 'hash')"))
        connection.execute(text("CREATE TABLE budgets (id INTEGER PRIMARY KEY, category VARCHAR(80), monthly_limit NUMERIC(12, 2), month INTEGER, year INTEGER)"))
        connection.execute(text("INSERT INTO budgets (category, monthly_limit, month, year) VALUES ('Food', 400, 9, 2026)"))

    migrate_database(engine)
    migrate_database(engine)

    assert "user_id" in {column["name"] for column in inspect(engine).get_columns("budgets")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT user_id FROM budgets")).scalar_one() == 4
    engine.dispose()
