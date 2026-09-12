from datetime import date
from decimal import Decimal

from app.domain.financial_report import FinancialReportBuilder
from app.domain.transaction import Transaction, TransactionType


def test_monthly_report_totals_income_expenses_and_categories():
    transactions = [
        Transaction(Decimal("1200.00"), "Paycheck", TransactionType.INCOME, date(2026, 9, 1), 1),
        Transaction(Decimal("300.00"), "Rent", TransactionType.EXPENSE, date(2026, 9, 2), 1),
        Transaction(Decimal("40.00"), "Food", TransactionType.EXPENSE, date(2026, 9, 3), 1),
        Transaction(Decimal("25.00"), "Food", TransactionType.EXPENSE, date(2026, 9, 4), 1),
        Transaction(Decimal("999.00"), "Ignored", TransactionType.EXPENSE, date(2026, 8, 1), 1),
    ]

    report = FinancialReportBuilder().monthly_report(transactions, month=9, year=2026)

    assert report.total_income == Decimal("1200.00")
    assert report.total_expenses == Decimal("365.00")
    assert report.net_cash_flow == Decimal("835.00")
    assert report.category_expenses == {
        "Rent": Decimal("300.00"),
        "Food": Decimal("65.00"),
    }

