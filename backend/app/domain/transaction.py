from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from app.domain.money import positive_amount


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


@dataclass(frozen=True)
class Transaction:
    amount: Decimal
    category: str
    transaction_type: TransactionType
    transaction_date: date
    account_id: int = 1
    note: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "amount", positive_amount(self.amount))
        object.__setattr__(self, "transaction_type", TransactionType(self.transaction_type))
        object.__setattr__(self, "category", self.category.strip())
        object.__setattr__(self, "note", self.note.strip())
        if not 1 <= len(self.category) <= 40:
            raise ValueError("Category must contain 1 to 40 characters.")
        if len(self.note) > 160:
            raise ValueError("Note must be at most 160 characters.")
        if self.transaction_date > date.today():
            raise ValueError("Use today or a past date for a completed transaction.")
        if self.account_id != 1:
            raise ValueError("Only the demo account is available.")
