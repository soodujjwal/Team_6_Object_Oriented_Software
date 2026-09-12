from dataclasses import dataclass
from decimal import Decimal

from app.domain.money import money
from app.domain.transaction import Transaction, TransactionType


@dataclass
class Account:
    name: str
    starting_balance: Decimal

    def __post_init__(self) -> None:
        self.starting_balance = money(self.starting_balance)
        if not self.name.strip():
            raise ValueError("account name is required")

    def current_balance(self, transactions: list[Transaction]) -> Decimal:
        total = self.starting_balance
        for transaction in transactions:
            if transaction.transaction_type == TransactionType.INCOME:
                total += transaction.amount
            else:
                total -= transaction.amount
        return money(total)

