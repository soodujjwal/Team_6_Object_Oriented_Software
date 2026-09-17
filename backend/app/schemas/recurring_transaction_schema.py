from datetime import date
from decimal import Decimal

from pydantic import Field

from app.domain.recurring_transaction import RecurrenceFrequency
from app.domain.transaction import TransactionType
from app.schemas.common import ORMModel, money_field


class RecurringTransactionCreate(ORMModel):
    name: str = Field(default="", max_length=120)
    account_id: int
    amount: Decimal = money_field()
    category: str = Field(min_length=1, max_length=80)
    transaction_type: TransactionType
    frequency: RecurrenceFrequency
    next_due_date: date
    note: str | None = Field(default=None, max_length=255)
    auto_pay_status: bool = False
    reminder_settings: list[int] | None = Field(default_factory=lambda: [7, 3, 1, 0, -1])


class RecurringTransactionUpdate(ORMModel):
    name: str | None = Field(default=None, max_length=120)
    account_id: int | None = None
    amount: Decimal | None = Field(default=None, ge=Decimal("0"), max_digits=12, decimal_places=2)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    transaction_type: TransactionType | None = None
    frequency: RecurrenceFrequency | None = None
    next_due_date: date | None = None
    note: str | None = Field(default=None, max_length=255)
    auto_pay_status: bool | None = None
    reminder_settings: list[int] | None = None


class RecurringTransactionRead(RecurringTransactionCreate):
    id: int
    last_paid_date: date | None = None
    last_matched_transaction_id: int | None = None
