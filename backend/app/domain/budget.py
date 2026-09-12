from dataclasses import dataclass
from decimal import Decimal

from app.domain.money import money, require_non_negative
from app.domain.transaction import Transaction, TransactionType


@dataclass
class Budget:
    category: str
    monthly_limit: Decimal
    month: int
    year: int

    def __post_init__(self) -> None:
        self.monthly_limit = require_non_negative(self.monthly_limit, "monthly_limit")
        if not self.category.strip():
            raise ValueError("category is required")
        if not 1 <= self.month <= 12:
            raise ValueError("month must be between 1 and 12")

    def used_amount(self, transactions: list[Transaction]) -> Decimal:
        total = sum(
            transaction.amount
            for transaction in transactions
            if transaction.transaction_type == TransactionType.EXPENSE
            and transaction.category.lower() == self.category.lower()
            and transaction.transaction_date.month == self.month
            and transaction.transaction_date.year == self.year
        )
        return money(total)

    def remaining_amount(self, transactions: list[Transaction]) -> Decimal:
        return money(self.monthly_limit - self.used_amount(transactions))

    def usage_percent(self, transactions: list[Transaction]) -> Decimal:
        if self.monthly_limit == 0:
            return money(0)
        return money((self.used_amount(transactions) / self.monthly_limit) * 100)

