from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.domain.affordability import AffordabilityCalculator
from app.domain.money import money
from app.repositories.recurring_transaction_repository import RecurringTransactionRepository
from app.repositories.savings_goal_repository import SavingsGoalRepository
from app.schemas.affordability_schema import AffordabilityRead
from app.services.account_service import total_available_balance


class AffordabilityService:
    def __init__(self, db: Session):
        self.db = db
        self.recurring = RecurringTransactionRepository(db)
        self.goals = SavingsGoalRepository(db)
        self.calculator = AffordabilityCalculator()

    def check_purchase(self, purchase_amount: Decimal) -> AffordabilityRead:
        today = date.today()
        upcoming_required = money(
            sum(transaction.amount for transaction in self.recurring.upcoming_expenses(today.replace(day=28)))
        )
        savings_remaining = money(
            sum(max(goal.target_amount - goal.current_amount, Decimal("0")) for goal in self.goals.list())
        )
        result = self.calculator.evaluate(
            purchase_amount=purchase_amount,
            current_available=total_available_balance(self.db),
            upcoming_required=upcoming_required,
            savings_remaining=savings_remaining,
        )
        return AffordabilityRead.model_validate(result)

