from decimal import Decimal

from pydantic import Field

from app.schemas.common import ORMModel


class MonthlyReportRead(ORMModel):
    month: int = Field(ge=1, le=12)
    year: int
    total_income: Decimal
    total_expenses: Decimal
    net_cash_flow: Decimal
    category_expenses: dict[str, Decimal]

