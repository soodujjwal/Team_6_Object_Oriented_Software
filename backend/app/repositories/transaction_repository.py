from app.repositories.base import BaseRepository
from app.repositories.models import TransactionModel


class TransactionRepository(BaseRepository[TransactionModel]):
    model = TransactionModel

    def list_for_account(self, account_id: int) -> list[TransactionModel]:
        return list(self.db.query(TransactionModel).filter_by(account_id=account_id).all())

    def list_for_month(self, month: int, year: int) -> list[TransactionModel]:
        return [
            transaction
            for transaction in self.list()
            if transaction.transaction_date.month == month and transaction.transaction_date.year == year
        ]

