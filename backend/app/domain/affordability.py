from dataclasses import dataclass
from decimal import Decimal

from app.domain.money import money, positive_amount


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
    def evaluate(self, purchase_amount: Decimal, current_available: Decimal,
                 upcoming_required: Decimal, savings_remaining: Decimal) -> AffordabilityResult:
        purchase = positive_amount(purchase_amount)
        available = money(current_available)
        required, savings = money(upcoming_required), money(savings_remaining)
        if required < 0 or savings < 0:
            raise ValueError("Reserves cannot be negative.")
        # These are unpaid bills and money still to set aside, not past expenses.
        # Logged expenses are already reflected in available and are not deducted again.
        projected = money(available - required - savings - purchase)
        if projected > 0:
            message = "This purchase fits after the preset reserves."
        elif projected == 0:
            message = "This purchase fits exactly, leaving no unreserved money."
        else:
            message = "This purchase would use money reserved for bills or savings."
        return AffordabilityResult(purchase, available, required, savings, projected,
                                   projected >= 0, message)
