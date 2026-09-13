from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_CEILING

from app.domain.money import money, require_non_negative


@dataclass
class SavingsGoal:
    name: str
    target_amount: Decimal
    current_amount: Decimal
    target_date: date | None = None

    def __post_init__(self) -> None:
        self.target_amount = require_non_negative(self.target_amount, "target_amount")
        self.current_amount = require_non_negative(self.current_amount, "current_amount")
        if not self.name.strip():
            raise ValueError("goal name is required")

    @property
    def remaining_amount(self) -> Decimal:
        return money(max(self.target_amount - self.current_amount, Decimal("0")))

    @property
    def progress_percent(self) -> Decimal:
        if self.target_amount == 0:
            return money(100)
        return money(min((self.current_amount / self.target_amount) * 100, Decimal("100")))

    def daily_savings_required(self, as_of: date | None = None) -> Decimal | None:
        if self.target_date is None:
            return None
        remaining = self.remaining_amount
        if remaining == 0:
            return money(0)
        days_remaining = (self.target_date - (as_of or date.today())).days
        if days_remaining <= 0:
            return None
        return (remaining / Decimal(days_remaining)).quantize(
            Decimal("0.01"),
            rounding=ROUND_CEILING,
        )
