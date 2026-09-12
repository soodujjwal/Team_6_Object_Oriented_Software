from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from app.domain.money import require_non_negative


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


@dataclass(frozen=True)
class Transaction:
    amount: Decimal
    category: str
    transaction_type: TransactionType
    transaction_date: date
    account_id: int
    note: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "amount", require_non_negative(self.amount))
        if not self.category.strip():
            raise ValueError("category is required")

