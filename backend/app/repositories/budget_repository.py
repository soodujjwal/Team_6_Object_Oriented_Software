from app.repositories.base import BaseRepository
from app.repositories.models import BudgetModel


class BudgetRepository(BaseRepository[BudgetModel]):
    model = BudgetModel

    def find_duplicate(self, category: str, month: int, year: int) -> BudgetModel | None:
        return (
            self.db.query(BudgetModel)
            .filter_by(category=category, month=month, year=year)
            .first()
        )

