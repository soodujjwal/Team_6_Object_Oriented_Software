from sqlalchemy.orm import Session

from app.domain.financial_report import FinancialReportBuilder
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.report_schema import MonthlyReportRead
from app.services.converters import to_domain_transaction


class ReportService:
    def __init__(self, db: Session):
        self.transactions = TransactionRepository(db)
        self.builder = FinancialReportBuilder()

    def monthly_report(self, month: int, year: int) -> MonthlyReportRead:
        transactions = [to_domain_transaction(t) for t in self.transactions.list_for_month(month, year)]
        return MonthlyReportRead.model_validate(self.builder.monthly_report(transactions, month, year))

