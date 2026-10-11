from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import ORMModel, money_field


class AccountCreate(ORMModel):
    account_type: Literal["savings", "checking", "other"] | None = None
    bank_name: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    starting_balance: Decimal = money_field()


class AccountUpdate(ORMModel):
    account_type: Literal["savings", "checking", "other"] | None = None
    bank_name: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    starting_balance: Decimal | None = Field(default=None, ge=Decimal("0"), max_digits=12, decimal_places=2)


class AccountRead(AccountCreate):
    # Plaid reconciliation derives this baseline from the institution's current
    # balance and the imported transaction history. That derived value can be
    # negative even though users may not create an account with a negative
    # opening balance.
    starting_balance: Decimal = Field(max_digits=12, decimal_places=2)
    id: int
    current_balance: Decimal | None = None
