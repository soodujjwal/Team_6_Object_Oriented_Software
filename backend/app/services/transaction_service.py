from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.account_repository import AccountRepository
from app.repositories.recurring_transaction_repository import RecurringTransactionRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.transaction_schema import TransactionCreate, TransactionUpdate


class TransactionService:
    def __init__(self, db: Session):
        self.accounts = AccountRepository(db)
        self.recurring = RecurringTransactionRepository(db)
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
        transaction = self.transactions.create(data)
        self._mark_matching_recurring_paid(transaction)
        return transaction

    def create_transactions(self, payloads: list[TransactionCreate]):
        for payload in payloads:
            self._require_account(payload.account_id)
        created = []
        for payload in payloads:
            data = payload.model_dump()
            data["transaction_type"] = payload.transaction_type.value
            created.append(self.transactions.model(**data))
        self.transactions.db.add_all(created)
        self.transactions.db.commit()
        for transaction in created:
            self.transactions.db.refresh(transaction)
            self._mark_matching_recurring_paid(transaction, commit=False)
        self.transactions.db.commit()
        return created

    def update_transaction(self, transaction_id: int, payload: TransactionUpdate):
        self._require_unlinked_transaction(transaction_id)
        transaction = self.get_transaction(transaction_id)
        data = payload.model_dump(exclude_unset=True)
        if "account_id" in data:
            self._require_account(data["account_id"])
        if "transaction_type" in data and data["transaction_type"] is not None:
            data["transaction_type"] = data["transaction_type"].value
        return self.transactions.update(transaction, data)

    def delete_transaction(self, transaction_id: int) -> None:
        self._require_unlinked_transaction(transaction_id)
        self.transactions.delete(self.get_transaction(transaction_id))

    def _require_unlinked_transaction(self, transaction_id: int) -> None:
        from app.repositories.models import SplitBillModel
        for bill in self.transactions.db.query(SplitBillModel):
            if bill.payment_transaction_id == transaction_id or any(
                payment["transaction_id"] == transaction_id for payment in bill.repayments.values()
            ):
                raise HTTPException(409, "Manage this payment from Split Bill to keep balances and repayments in sync.")

    def _require_account(self, account_id: int) -> None:
        if self.accounts.get(account_id) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "account_id does not exist")

    def _mark_matching_recurring_paid(self, transaction, commit: bool = True) -> None:
        if transaction.transaction_type != "expense":
            return
        candidates = [
            item for item in self.recurring.list()
            if item.transaction_type == "expense"
            and item.account_id == transaction.account_id
            and abs(float(item.amount) - float(transaction.amount)) < 0.01
        ]
        for recurring in candidates:
            if recurring.last_matched_transaction_id == transaction.id:
                return
            if not self._matches_recurring_cycle(transaction, recurring):
                continue
            recurring.last_paid_date = transaction.transaction_date
            recurring.last_matched_transaction_id = transaction.id
            recurring.next_due_date = self._advance_due_date(recurring.next_due_date, recurring.frequency)
            while recurring.next_due_date <= transaction.transaction_date:
                recurring.next_due_date = self._advance_due_date(recurring.next_due_date, recurring.frequency)
            if commit:
                self.recurring.db.commit()
                self.recurring.db.refresh(recurring)
            return

    def _matches_recurring_cycle(self, transaction, recurring) -> bool:
        if recurring.last_paid_date is not None and recurring.last_paid_date >= recurring.next_due_date:
            return False
        days_from_due = (transaction.transaction_date - recurring.next_due_date).days
        if days_from_due < -7 or days_from_due > 14:
            return False
        haystack = f"{transaction.note or ''} {transaction.category}".lower()
        terms = [recurring.name, recurring.note, recurring.category]
        return any(str(term or "").strip().lower() in haystack for term in terms if str(term or "").strip())

    def _advance_due_date(self, due_date, frequency: str):
        from calendar import monthrange
        from datetime import timedelta

        if frequency == "weekly":
            return due_date + timedelta(days=7)
        month = due_date.month + 1
        year = due_date.year
        if month > 12:
            month = 1
            year += 1
        day = min(due_date.day, monthrange(year, month)[1])
        return due_date.replace(year=year, month=month, day=day)
