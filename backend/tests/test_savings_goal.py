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

