from dataclasses import dataclass
from decimal import Decimal

from app.domain.money import money, require_non_negative


@dataclass(frozen=True)
class AffordabilityResult:
    purchase_amount: Decimal
    current_available: Decimal
    upcoming_required: Decimal
    savings_remaining: Decimal
    projected_remaining: Decimal
    can_afford: bool
    message: str


class AffordabilityCalculator:
    def evaluate(
        self,
        purchase_amount: Decimal,
        current_available: Decimal,
        upcoming_required: Decimal,
        savings_remaining: Decimal,
    ) -> AffordabilityResult:
        purchase = require_non_negative(purchase_amount, "purchase_amount")
        available = money(current_available)
        required = require_non_negative(upcoming_required, "upcoming_required")
        savings = require_non_negative(savings_remaining, "savings_remaining")
        projected = money(available - required - savings - purchase)
        can_afford = projected >= 0
        message = (
            "Purchase appears affordable without affecting required expenses or savings goals."
            if can_afford
            else "Purchase may interfere with required expenses or savings goals."
        )
        return AffordabilityResult(
            purchase_amount=purchase,
            current_available=available,
            upcoming_required=required,
            savings_remaining=savings,
            projected_remaining=projected,
            can_afford=can_afford,
            message=message,
        )

