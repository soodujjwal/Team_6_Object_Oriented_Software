from datetime import date
from decimal import Decimal

from pydantic import Field

from app.schemas.common import ORMModel, money_field


class SavingsGoalCreate(ORMModel):
    name: str = Field(min_length=1, max_length=100)
    target_amount: Decimal = money_field()
    current_amount: Decimal = money_field()
    target_date: date | None = None


class SavingsGoalUpdate(ORMModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    target_amount: Decimal | None = Field(default=None, ge=Decimal("0"), max_digits=12, decimal_places=2)
    current_amount: Decimal | None = Field(default=None, ge=Decimal("0"), max_digits=12, decimal_places=2)
    target_date: date | None = None


class SavingsGoalRead(SavingsGoalCreate):
    id: int
    remaining_amount: Decimal | None = None
    progress_percent: Decimal | None = None
