from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.demo import DemoStore
from app.domain.account import Account
from app.domain.affordability import AffordabilityCalculator
from app.domain.money import money, positive_amount
from app.domain.transaction import Transaction, TransactionType


@pytest.mark.parametrize("purchase,remaining,allowed", [
    ("60", "440.00", True), ("500", "0.00", True), ("500.01", "-0.01", False),
])
def test_purchase_boundaries(purchase, remaining, allowed):
    result = AffordabilityCalculator().evaluate(purchase, "1400", "800", "100")
    assert result.projected_remaining == Decimal(remaining)
    assert result.can_afford is allowed


@pytest.mark.parametrize("available", ["0", "-20"])
def test_zero_or_overdrawn_balance(available):
    result = AffordabilityCalculator().evaluate("1", available, "0", "0")
    assert not result.can_afford


@pytest.mark.parametrize("value", ["0", "-1", "-0.001", "1.001", "NaN", "Infinity",
                                  "-Infinity", "", "abc", "1000000.01", "1e9999"])
def test_invalid_amounts(value):
    with pytest.raises(ValueError):
        positive_amount(value)


def test_decimal_precision_and_maximum():
    assert money("0.10") + money("0.20") == money("0.30")
    assert positive_amount("1000000") == Decimal("1000000.00")
    result = AffordabilityCalculator().evaluate("0.30", "0.60", "0.10", "0.20")
    assert result.projected_remaining == Decimal("0.00")


def test_account_income_expense_and_overdraft():
    account = Account("Demo", Decimal("0.10"))
    transactions = [Transaction("0.20", "Work", TransactionType.INCOME, date.today()),
                    Transaction("0.40", "Food", TransactionType.EXPENSE, date.today())]
    assert account.current_balance(transactions) == Decimal("-0.10")


@pytest.mark.parametrize("changes", [
    {"category": "   "}, {"category": "x" * 41}, {"note": "x" * 161},
    {"transaction_type": "transfer"}, {"account_id": 2},
    {"transaction_date": date.today() + timedelta(days=1)},
])
def test_transaction_validation(changes):
    fields = dict(amount="10", category="Food", transaction_type="expense", transaction_date=date.today())
    with pytest.raises(ValueError):
        Transaction(**(fields | changes))


def test_check_does_not_log_a_purchase_and_reset_restores_seed():
    store = DemoStore()
    before = store.snapshot()
    store.check("60")
    assert store.snapshot() == before
    store.add(Transaction("60", "Food", "expense", date.today()))
    assert store.check("500").projected_remaining == Decimal("-60.00")
    store.reset()
    assert store.snapshot() == before


@pytest.mark.parametrize("bills,savings", [("-1", "0"), ("0", "-1")])
def test_negative_reserves_rejected(bills, savings):
    with pytest.raises(ValueError):
        AffordabilityCalculator().evaluate("1", "100", bills, savings)
