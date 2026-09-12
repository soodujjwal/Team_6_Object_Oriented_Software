from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.account_repository import AccountRepository
from app.repositories.recurring_transaction_repository import RecurringTransactionRepository
from app.schemas.recurring_transaction_schema import (
    RecurringTransactionCreate,
    RecurringTransactionUpdate,
)


class RecurringTransactionService:
    def __init__(self, db: Session):
        self.accounts = AccountRepository(db)
        self.recurring = RecurringTransactionRepository(db)

    def list_recurring_transactions(self):
        return self.recurring.list()

    def get_recurring_transaction(self, recurring_id: int):
        recurring = self.recurring.get(recurring_id)
        if recurring is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "recurring transaction not found")
        return recurring

    def create_recurring_transaction(self, payload: RecurringTransactionCreate):
        self._require_account(payload.account_id)
        data = payload.model_dump()
        data["transaction_type"] = payload.transaction_type.value
        data["frequency"] = payload.frequency.value
        return self.recurring.create(data)

    def update_recurring_transaction(self, recurring_id: int, payload: RecurringTransactionUpdate):
        recurring = self.get_recurring_transaction(recurring_id)
        data = payload.model_dump(exclude_unset=True)
        if "account_id" in data:
            self._require_account(data["account_id"])
        if "transaction_type" in data and data["transaction_type"] is not None:
            data["transaction_type"] = data["transaction_type"].value
        if "frequency" in data and data["frequency"] is not None:
            data["frequency"] = data["frequency"].value
        return self.recurring.update(recurring, data)

    def delete_recurring_transaction(self, recurring_id: int) -> None:
        self.recurring.delete(self.get_recurring_transaction(recurring_id))

    def _require_account(self, account_id: int) -> None:
        if self.accounts.get(account_id) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "account_id does not exist")

