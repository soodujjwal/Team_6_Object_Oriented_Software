from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.domain.budget import Budget
from app.repositories.budget_repository import BudgetRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.budget_schema import BudgetCreate, BudgetRead, BudgetUpdate
from app.services.converters import to_domain_transaction


class BudgetService:
    def __init__(self, db: Session):
        self.budgets = BudgetRepository(db)
        self.transactions = TransactionRepository(db)

    def list_budgets(self) -> list[BudgetRead]:
        return [self._read(budget) for budget in self.budgets.list()]

    def get_budget(self, budget_id: int) -> BudgetRead:
        budget = self.budgets.get(budget_id)
        if budget is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "budget not found")
        return self._read(budget)

    def create_budget(self, payload: BudgetCreate) -> BudgetRead:
        duplicate = self.budgets.find_duplicate(payload.category, payload.month, payload.year)
        if duplicate is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "budget already exists for category and month")
        return self._read(self.budgets.create(payload.model_dump()))

    def update_budget(self, budget_id: int, payload: BudgetUpdate) -> BudgetRead:
        budget = self.budgets.get(budget_id)
        if budget is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "budget not found")
        return self._read(self.budgets.update(budget, payload.model_dump(exclude_unset=True)))

    def delete_budget(self, budget_id: int) -> None:
        budget = self.budgets.get(budget_id)
        if budget is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "budget not found")
        self.budgets.delete(budget)

    def _read(self, budget_model) -> BudgetRead:
        budget = Budget(
            category=budget_model.category,
            monthly_limit=budget_model.monthly_limit,
            month=budget_model.month,
            year=budget_model.year,
        )
        transactions = [to_domain_transaction(t) for t in self.transactions.list_for_month(budget.month, budget.year)]
        return BudgetRead.model_validate(budget_model).model_copy(
            update={
                "used_amount": budget.used_amount(transactions),
                "remaining_amount": budget.remaining_amount(transactions),
                "usage_percent": budget.usage_percent(transactions),
            }
        )

