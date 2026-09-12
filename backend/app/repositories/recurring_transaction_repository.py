from datetime import date

from app.repositories.base import BaseRepository
from app.repositories.models import RecurringTransactionModel


class RecurringTransactionRepository(BaseRepository[RecurringTransactionModel]):
    model = RecurringTransactionModel

    def upcoming_expenses(self, through_date: date) -> list[RecurringTransactionModel]:
        return list(
            self.db.query(RecurringTransactionModel)
            .filter(
                RecurringTransactionModel.transaction_type == "expense",
                RecurringTransactionModel.next_due_date <= through_date,
            )
            .all()
        )

