from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.domain.transaction import TransactionType
from app.schemas.common import ORMModel, money_field


class TransactionCreate(ORMModel):
    financial_kind: Literal["standard", "reimbursement", "transfer"] = "standard"
    account_id: int
    amount: Decimal = money_field()
    category: str = Field(min_length=1, max_length=80)
    transaction_type: TransactionType
    transaction_date: date
    note: str | None = Field(default=None, max_length=255)
    receipt_items: list[dict] | None = None
    receipt_metadata: dict | None = None


class TransactionUpdate(ORMModel):
    financial_kind: Literal["standard", "reimbursement", "transfer"] | None = None
    account_id: int | None = None
    amount: Decimal | None = Field(default=None, ge=Decimal("0"), max_digits=12, decimal_places=2)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    transaction_type: TransactionType | None = None
    transaction_date: date | None = None
    note: str | None = Field(default=None, max_length=255)
    receipt_items: list[dict] | None = None
    receipt_metadata: dict | None = None


class TransactionRead(TransactionCreate):
    id: int
    reporting_amount: Decimal = Decimal("0")
    personal_amount: Decimal | None = None


class TransactionBulkCreate(ORMModel):
    transactions: list[TransactionCreate] = Field(min_length=1, max_length=1000)
