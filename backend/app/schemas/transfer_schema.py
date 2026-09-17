from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import ORMModel


class TransferCreate(ORMModel):
    from_account_id: int = Field(gt=0)
    to_account_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    note: str | None = Field(default=None, max_length=255)


class TransferRead(TransferCreate):
    id: int
    transfer_date: date
    transaction_type: Literal["transfer"] = "transfer"
