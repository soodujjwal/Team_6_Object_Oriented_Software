from decimal import Decimal

from pydantic import Field

from app.schemas.common import ORMModel, money_field


class AccountCreate(ORMModel):
    bank_name: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    starting_balance: Decimal = money_field()


class AccountUpdate(ORMModel):
    bank_name: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    starting_balance: Decimal | None = Field(default=None, ge=Decimal("0"), max_digits=12, decimal_places=2)


class AccountRead(AccountCreate):
    id: int
    current_balance: Decimal | None = None
