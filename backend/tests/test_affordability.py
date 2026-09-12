from decimal import Decimal

from app.domain.affordability import AffordabilityCalculator


def test_affordability_allows_purchase_when_projection_is_non_negative():
    result = AffordabilityCalculator().evaluate(
        purchase_amount=Decimal("100.00"),
        current_available=Decimal("1500.00"),
        upcoming_required=Decimal("800.00"),
        savings_remaining=Decimal("500.00"),
    )

    assert result.can_afford is True
    assert result.projected_remaining == Decimal("100.00")


def test_affordability_warns_when_purchase_interferes_with_plan():
    result = AffordabilityCalculator().evaluate(
        purchase_amount=Decimal("250.00"),
        current_available=Decimal("1500.00"),
        upcoming_required=Decimal("800.00"),
        savings_remaining=Decimal("500.00"),
    )

    assert result.can_afford is False
    assert result.projected_remaining == Decimal("-50.00")

