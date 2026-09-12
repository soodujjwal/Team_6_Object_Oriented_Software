from app.repositories.base import BaseRepository
from app.repositories.models import SavingsGoalModel


class SavingsGoalRepository(BaseRepository[SavingsGoalModel]):
    model = SavingsGoalModel

