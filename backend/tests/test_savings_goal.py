from datetime import date
from decimal import Decimal

from app.domain.savings_goal import SavingsGoal


def test_savings_goal_progress_and_remaining_amount():
    goal = SavingsGoal(
        name="Emergency Fund",
        target_amount=Decimal("1000.00"),
        current_amount=Decimal("250.00"),
    )

    assert goal.remaining_amount == Decimal("750.00")
    assert goal.progress_percent == Decimal("25.00")


def test_savings_goal_progress_is_capped_at_one_hundred_percent():
    goal = SavingsGoal(
        name="Laptop",
        target_amount=Decimal("1000.00"),
        current_amount=Decimal("1200.00"),
    )

    assert goal.remaining_amount == Decimal("0.00")
    assert goal.progress_percent == Decimal("100.00")


def test_savings_goal_calculates_daily_amount_and_rounds_up():
    goal = SavingsGoal(
        name="Trip",
        target_amount=Decimal("1000.00"),
        current_amount=Decimal("100.00"),
        target_date=date(2026, 7, 1),
    )

    assert goal.daily_savings_required(date(2026, 1, 2)) == Decimal("5.00")


def test_savings_goal_daily_amount_handles_completed_and_expired_goals():
    completed = SavingsGoal(
        name="Laptop",
        target_amount=Decimal("500.00"),
        current_amount=Decimal("500.00"),
        target_date=date(2026, 1, 1),
    )
    expired = SavingsGoal(
        name="Trip",
        target_amount=Decimal("500.00"),
        current_amount=Decimal("100.00"),
        target_date=date(2026, 1, 1),
    )

    assert completed.daily_savings_required(date(2026, 1, 2)) == Decimal("0.00")
    assert expired.daily_savings_required(date(2026, 1, 2)) is None
