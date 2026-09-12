from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.account_repository import AccountRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.transaction_schema import TransactionCreate, TransactionUpdate


class TransactionService:
    def __init__(self, db: Session):
        self.accounts = AccountRepository(db)
        self.transactions = TransactionRepository(db)

    def list_transactions(self):
        return self.transactions.list()

    def get_transaction(self, transaction_id: int):
        transaction = self.transactions.get(transaction_id)
        if transaction is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "transaction not found")
        return transaction

    def create_transaction(self, payload: TransactionCreate):
        self._require_account(payload.account_id)
        data = payload.model_dump()
        data["transaction_type"] = payload.transaction_type.value
        return self.transactions.create(data)

    def update_transaction(self, transaction_id: int, payload: TransactionUpdate):
        transaction = self.get_transaction(transaction_id)
        data = payload.model_dump(exclude_unset=True)
        if "account_id" in data:
            self._require_account(data["account_id"])
        if "transaction_type" in data and data["transaction_type"] is not None:
            data["transaction_type"] = data["transaction_type"].value
        return self.transactions.update(transaction, data)

    def delete_transaction(self, transaction_id: int) -> None:
        self.transactions.delete(self.get_transaction(transaction_id))

    def _require_account(self, account_id: int) -> None:
        if self.accounts.get(account_id) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "account_id does not exist")

