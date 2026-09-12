from datetime import date
from decimal import Decimal

from app.domain.budget import Budget
from app.domain.transaction import Transaction, TransactionType


def test_budget_calculates_used_remaining_and_percent():
    budget = Budget(category="Food", monthly_limit=Decimal("400.00"), month=9, year=2026)
    transactions = [
        Transaction(Decimal("75.50"), "Food", TransactionType.EXPENSE, date(2026, 9, 2), 1),
        Transaction(Decimal("24.50"), "food", TransactionType.EXPENSE, date(2026, 9, 4), 1),
        Transaction(Decimal("50.00"), "Rent", TransactionType.EXPENSE, date(2026, 9, 4), 1),
        Transaction(Decimal("1000.00"), "Paycheck", TransactionType.INCOME, date(2026, 9, 5), 1),
    ]

    assert budget.used_amount(transactions) == Decimal("100.00")
    assert budget.remaining_amount(transactions) == Decimal("300.00")
    assert budget.usage_percent(transactions) == Decimal("25.00")


def test_budget_rejects_invalid_month():
    try:
        Budget(category="Food", monthly_limit=Decimal("400.00"), month=13, year=2026)
    except ValueError as error:
        assert "month" in str(error)
    else:
        raise AssertionError("invalid month should raise ValueError")

