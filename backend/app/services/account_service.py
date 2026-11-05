from decimal import Decimal
from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.domain.money import money
from app.repositories.account_repository import AccountRepository
from app.repositories.transaction_repository import TransactionRepository
from app.repositories.models import TransferModel, SplitBillModel, PlaidTransactionLinkModel, PlaidAccountLinkModel
from app.schemas.account_schema import AccountCreate, AccountRead, AccountUpdate


class AccountService:
    def __init__(self, db: Session):
        self.db = db
        self.accounts = AccountRepository(db)
        self.transactions = TransactionRepository(db)

    def list_accounts(self) -> list[AccountRead]:
        accounts = self.accounts.list()
        transactions = defaultdict(list)
        for transaction in self.transactions.list():
            transactions[transaction.account_id].append(transaction)
        linked = {link.transaction_id for link in self.db.query(PlaidTransactionLinkModel)}
        transfers = defaultdict(list)
        for transfer in self.db.query(TransferModel):
            transfers[transfer.from_account_id].append(transfer)
            if transfer.to_account_id != transfer.from_account_id:
                transfers[transfer.to_account_id].append(transfer)
        return [self._read(account, transactions=transactions[account.id], linked=linked,
                           transfers=transfers[account.id]) for account in accounts]

    def get_account(self, account_id: int) -> AccountRead:
        account = self.accounts.get(account_id)
        if account is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
        return self._read(account)

    def create_account(self, payload: AccountCreate) -> AccountRead:
        data = payload.model_dump()
        if data["account_type"] is None:
            name = payload.name.lower()
            data["account_type"] = "savings" if "savings" in name else "checking" if "checking" in name else "other"
        return self._read(self.accounts.create(data))

    def update_account(self, account_id: int, payload: AccountUpdate) -> AccountRead:
        account = self.accounts.get(account_id)
        if account is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
        if account.bank_current_balance is not None and payload.starting_balance is not None:
            raise HTTPException(409, "The opening balance of a connected bank is managed by bank sync.")
        return self._read(self.accounts.update(account, payload.model_dump(exclude_unset=True)))

    def delete_account(self, account_id: int) -> None:
        account = self.accounts.get(account_id)
        if account is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
        if self.db.query(PlaidAccountLinkModel).filter_by(account_id=account_id).first():
            raise HTTPException(409, "Disconnect this bank before deleting its accounts.")
        if any(bill.payment_transaction_id and bill.data.get("account_id") == account_id for bill in self.db.query(SplitBillModel)):
            raise HTTPException(409, "Accounts with recorded split bill payments cannot be deleted.")
        if self.db.query(TransferModel).filter(or_(TransferModel.from_account_id == account_id, TransferModel.to_account_id == account_id)).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "Accounts with recorded transfers cannot be deleted.")
        self.accounts.delete(account)

    def _read(self, account, *, transactions=None, linked=None, transfers=None) -> AccountRead:
        if transactions is None:
            transactions = self.transactions.list_for_account(account.id)
        if linked is None:
            linked = {link.transaction_id for link in self.db.query(PlaidTransactionLinkModel)}
        if transfers is None:
            transfers = self.db.query(TransferModel).filter(or_(TransferModel.from_account_id == account.id, TransferModel.to_account_id == account.id))
        unmatched = Decimal("0")
        balance = money(account.starting_balance)
        for transaction in transactions:
            if (transaction.receipt_metadata or {}).get("bank_removed"):
                continue
            movement = transaction.amount if transaction.transaction_type == "income" else -transaction.amount
            if transaction.id not in linked:
                unmatched += movement
            if transaction.transaction_type == "income":
                balance += transaction.amount
            else:
                balance -= transaction.amount
        for transfer in transfers:
            # Transfer ledger entries carry the movement; legacy transfers do not.
            if not any((t.receipt_metadata or {}).get("transfer_id") == transfer.id for t in transactions):
                movement = transfer.amount if transfer.to_account_id == account.id else -transfer.amount
                balance += movement
                unmatched += movement
        if account.bank_current_balance is not None:
            bank_balance = -account.bank_current_balance if account.bank_account_type == "credit" else account.bank_current_balance
            balance = bank_balance + unmatched
        is_credit = account.bank_account_type == "credit"
        return AccountRead.model_validate(account).model_copy(
            update={"current_balance": money(balance), "estimated_balance": money(balance), "unmatched_movement": money(unmatched),
                    "debt_owed": money(max(-balance, Decimal("0"))) if is_credit else None,
                    "available_credit": account.bank_available_balance if is_credit else None}
        )


def total_available_balance(db: Session) -> Decimal:
    return money(sum(account.current_balance or Decimal("0") for account in AccountService(db).list_accounts()))
