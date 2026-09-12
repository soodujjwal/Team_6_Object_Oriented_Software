from dataclasses import dataclass
from decimal import Decimal

from app.domain.money import money
from app.domain.transaction import Transaction, TransactionType


@dataclass(frozen=True)
class MonthlyReport:
    month: int
    year: int
    total_income: Decimal
    total_expenses: Decimal
    net_cash_flow: Decimal
    category_expenses: dict[str, Decimal]


class FinancialReportBuilder:
    def monthly_report(self, transactions: list[Transaction], month: int, year: int) -> MonthlyReport:
        selected = [
            transaction
            for transaction in transactions
            if transaction.transaction_date.month == month and transaction.transaction_date.year == year
        ]
        income = money(sum(t.amount for t in selected if t.transaction_type == TransactionType.INCOME))
        expenses = money(sum(t.amount for t in selected if t.transaction_type == TransactionType.EXPENSE))
        categories: dict[str, Decimal] = {}
        for transaction in selected:
            if transaction.transaction_type == TransactionType.EXPENSE:
                categories[transaction.category] = money(
                    categories.get(transaction.category, Decimal("0")) + transaction.amount
                )
        return MonthlyReport(
            month=month,
            year=year,
            total_income=income,
            total_expenses=expenses,
            net_cash_flow=money(income - expenses),
            category_expenses=categories,
        )

