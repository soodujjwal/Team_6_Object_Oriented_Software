from decimal import Decimal

from pydantic import Field

from app.schemas.common import ORMModel, money_field


class BudgetCreate(ORMModel):
    category: str = Field(min_length=1, max_length=80)
    monthly_limit: Decimal = money_field()
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)


class BudgetUpdate(ORMModel):
    category: str | None = Field(default=None, min_length=1, max_length=80)
    monthly_limit: Decimal | None = Field(default=None, ge=Decimal("0"), max_digits=12, decimal_places=2)
    month: int | None = Field(default=None, ge=1, le=12)
    year: int | None = Field(default=None, ge=2000, le=2100)


class BudgetRead(BudgetCreate):
    id: int
    used_amount: Decimal | None = None
    remaining_amount: Decimal | None = None
    usage_percent: Decimal | None = None
