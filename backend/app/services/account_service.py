from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.domain.money import money
from app.repositories.account_repository import AccountRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.account_schema import AccountCreate, AccountRead, AccountUpdate


class AccountService:
    def __init__(self, db: Session):
        self.accounts = AccountRepository(db)
        self.transactions = TransactionRepository(db)

    def list_accounts(self) -> list[AccountRead]:
        return [self._read(account) for account in self.accounts.list()]

    def get_account(self, account_id: int) -> AccountRead:
        account = self.accounts.get(account_id)
        if account is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
        return self._read(account)

    def create_account(self, payload: AccountCreate) -> AccountRead:
        return self._read(self.accounts.create(payload.model_dump()))

    def update_account(self, account_id: int, payload: AccountUpdate) -> AccountRead:
        account = self.accounts.get(account_id)
        if account is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
        return self._read(self.accounts.update(account, payload.model_dump(exclude_unset=True)))

    def delete_account(self, account_id: int) -> None:
        account = self.accounts.get(account_id)
        if account is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
        self.accounts.delete(account)

    def _read(self, account) -> AccountRead:
        transactions = self.transactions.list_for_account(account.id)
        balance = money(account.starting_balance)
        for transaction in transactions:
            if transaction.transaction_type == "income":
                balance += transaction.amount
            else:
                balance -= transaction.amount
        return AccountRead.model_validate(account).model_copy(
            update={"current_balance": money(balance)}
        )


def total_available_balance(db: Session) -> Decimal:
    return money(sum(account.current_balance or Decimal("0") for account in AccountService(db).list_accounts()))

