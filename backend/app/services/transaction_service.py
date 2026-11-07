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
        self._recurring_records = None

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
        transaction = self.transactions.model(**data)
        self.transactions.db.add(transaction)
        self.transactions.db.flush()
        from app.services.transaction_matching import auto_match
        auto_match(self.transactions.db)
        self._mark_matching_recurring_paid(transaction, commit=False)
        self.transactions.db.commit()
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
        self.transactions.db.flush()
        for transaction in created:
            self._mark_matching_recurring_paid(transaction, commit=False)
        from app.services.transaction_matching import auto_match
        auto_match(self.transactions.db)
        self.transactions.db.commit()
        return created

    def update_transaction(self, transaction_id: int, payload: TransactionUpdate):
        self._require_unlinked_transaction(transaction_id, allow_bank_annotations=True)
        transaction = self.get_transaction(transaction_id)
        from app.services.transaction_matching import bank_link
        linked = bank_link(self.transactions.db, transaction_id)
        if linked:
            for key in ("account_id", "amount", "transaction_type", "transaction_date"):
                value = getattr(payload, key)
                if value is not None and value != getattr(transaction, key):
                    raise HTTPException(409, "Bank account, amount, type and date are managed by bank sync.")
        from app.services.plaid_service import PlaidService
        PlaidService(self.transactions.db)._undo_recurring(transaction)
        data = payload.model_dump(exclude_unset=True)
        if linked:
            data.pop("receipt_metadata", None)
            transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "user_categorized": True}
        if "account_id" in data:
            self._require_account(data["account_id"])
        if "transaction_type" in data and data["transaction_type"] is not None:
            data["transaction_type"] = data["transaction_type"].value
        for key, value in data.items():
            if value is not None:
                setattr(transaction, key, value)
        self.transactions.db.flush()
        self._mark_matching_recurring_paid(transaction, commit=False)
        self.transactions.db.commit()
        return transaction

    def delete_transaction(self, transaction_id: int) -> None:
        self._require_unlinked_transaction(transaction_id)
        transaction = self.get_transaction(transaction_id)
        from app.services.plaid_service import PlaidService
        PlaidService(self.transactions.db)._undo_recurring(transaction)
        self.transactions.delete(transaction)

    def _require_unlinked_transaction(self, transaction_id: int, allow_bank_annotations=False) -> None:
        from app.services.transaction_matching import bank_link, allocated
        transaction = self.get_transaction(transaction_id)
        if ((bank_link(self.transactions.db, transaction_id) and not allow_bank_annotations)
                or (transaction.receipt_metadata or {}).get("transfer_id")):
            raise HTTPException(409, "Bank transactions and transfers are managed by their source.")
        if allocated(self.transactions.db, transaction_id):
            raise HTTPException(409, "Manage this payment from Split Bill.")
        from app.repositories.models import SplitBillModel
        for bill in self.transactions.db.query(SplitBillModel):
            if bill.payment_transaction_id == transaction_id or any(
                payment["transaction_id"] == transaction_id for payment in bill.repayments.values()
            ):
                raise HTTPException(409, "This transaction is linked to a historical split record and cannot be changed here. Its existing financial links are preserved.")

    def _require_account(self, account_id: int) -> None:
        if self.accounts.get(account_id) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "account_id does not exist")

    def _mark_matching_recurring_paid(self, transaction, commit: bool = True) -> None:
        if (transaction.transaction_type != "expense" or transaction.financial_kind == "transfer"
                or (transaction.receipt_metadata or {}).get("pending") or (transaction.receipt_metadata or {}).get("bank_removed")):
            return
        if (transaction.receipt_metadata or {}).get("recurring_previous"):
            return
        if self._recurring_records is None:
            self._recurring_records = self.recurring.list()
        candidates = [
            item for item in self._recurring_records
            if item.transaction_type == "expense"
            and item.account_id == transaction.account_id
            and item.amount == transaction.amount
        ]
        for recurring in candidates:
            if recurring.last_matched_transaction_id == transaction.id:
                return
            if not self._matches_recurring_cycle(transaction, recurring):
                continue
            transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "recurring_previous": {
                "id": recurring.id, "next_due_date": recurring.next_due_date.isoformat(),
                "last_paid_date": recurring.last_paid_date.isoformat() if recurring.last_paid_date else None,
                "last_matched_transaction_id": recurring.last_matched_transaction_id}}
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
        terms = [recurring.name, recurring.note] if recurring.name or recurring.note else [recurring.category]
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
