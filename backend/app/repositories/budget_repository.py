from app.repositories.base import BaseRepository
from app.repositories.models import BudgetModel


class BudgetRepository(BaseRepository[BudgetModel]):
    model = BudgetModel

    def list_for_user(self, user_id: int) -> list[BudgetModel]:
        return list(self.db.query(BudgetModel).filter_by(user_id=user_id).all())

    def get_for_user(self, budget_id: int, user_id: int) -> BudgetModel | None:
        return self.db.query(BudgetModel).filter_by(id=budget_id, user_id=user_id).first()

    def find_duplicate(self, user_id: int, category: str, month: int, year: int) -> BudgetModel | None:
        return (
            self.db.query(BudgetModel)
            .filter_by(user_id=user_id, category=category, month=month, year=year)
            .first()
        )

