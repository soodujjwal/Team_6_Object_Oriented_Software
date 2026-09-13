from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.domain.savings_goal import SavingsGoal
from app.repositories.savings_goal_repository import SavingsGoalRepository
from app.schemas.savings_goal_schema import SavingsGoalCreate, SavingsGoalRead, SavingsGoalUpdate


class SavingsGoalService:
    def __init__(self, db: Session):
        self.goals = SavingsGoalRepository(db)

    def list_goals(self) -> list[SavingsGoalRead]:
        return [self._read(goal) for goal in self.goals.list()]

    def get_goal(self, goal_id: int) -> SavingsGoalRead:
        goal = self.goals.get(goal_id)
        if goal is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "savings goal not found")
        return self._read(goal)

    def create_goal(self, payload: SavingsGoalCreate) -> SavingsGoalRead:
        return self._read(self.goals.create(payload.model_dump()))

    def update_goal(self, goal_id: int, payload: SavingsGoalUpdate) -> SavingsGoalRead:
        goal = self.goals.get(goal_id)
        if goal is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "savings goal not found")
        return self._read(self.goals.update(goal, payload.model_dump(exclude_unset=True)))

    def delete_goal(self, goal_id: int) -> None:
        goal = self.goals.get(goal_id)
        if goal is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "savings goal not found")
        self.goals.delete(goal)

    def _read(self, goal_model) -> SavingsGoalRead:
        goal = SavingsGoal(
            name=goal_model.name,
            target_amount=goal_model.target_amount,
            current_amount=goal_model.current_amount,
            target_date=goal_model.target_date,
        )
        return SavingsGoalRead.model_validate(goal_model).model_copy(
            update={
                "remaining_amount": goal.remaining_amount,
                "progress_percent": goal.progress_percent,
                "daily_savings_amount": goal.daily_savings_required(),
            }
        )
