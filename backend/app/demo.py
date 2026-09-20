"""One in-memory account; restarting the server restores this demo fixture."""
from dataclasses import asdict
from datetime import date, timedelta
from decimal import Decimal
from threading import RLock

from app.domain.account import Account
from app.domain.affordability import AffordabilityCalculator
from app.domain.transaction import Transaction, TransactionType


class DemoStore:
    def __init__(self):
        self.lock = RLock()
        self.reset()

    def reset(self):
        with self.lock:
            self.account = Account("Demo checking", Decimal("1000.00"))
            self.upcoming_required = Decimal("800.00")
            self.savings_remaining = Decimal("100.00")
            self.transactions = [
                Transaction(Decimal("500"), "Paycheck", TransactionType.INCOME,
                            date.today() - timedelta(days=2), note="Part-time work"),
                Transaction(Decimal("75"), "Groceries", TransactionType.EXPENSE,
                            date.today() - timedelta(days=1), note="Weekly groceries"),
                Transaction(Decimal("25"), "Transport", TransactionType.EXPENSE,
                            date.today(), note="Bus pass"),
            ]
            return self.snapshot()

    def snapshot(self):
        with self.lock:
            balance = self.account.current_balance(self.transactions)
            return {
                "name": self.account.name,
                "starting_balance": self.account.starting_balance,
                "current_balance": balance,
                "upcoming_required": self.upcoming_required,
                "savings_remaining": self.savings_remaining,
                "spendable": balance - self.upcoming_required - self.savings_remaining,
                "transactions": [asdict(t) for t in reversed(self.transactions)],
            }

    def add(self, transaction: Transaction):
        with self.lock:
            if len(self.transactions) >= 1000:
                raise ValueError("Demo log is full. Reset the demo to continue.")
            # Record actual spending even if it overdraws the account.
            # Validate the resulting balance before mutating the ledger.
            self.account.current_balance([*self.transactions, transaction])
            self.transactions.append(transaction)
            return self.snapshot()

    def check(self, purchase_amount: Decimal):
        with self.lock:
            return AffordabilityCalculator().evaluate(
                purchase_amount, self.account.current_balance(self.transactions),
                self.upcoming_required, self.savings_remaining)
