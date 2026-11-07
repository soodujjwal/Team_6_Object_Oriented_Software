"""Receipt splitting with explicitly confirmed, idempotent reimbursements."""
from datetime import date, timedelta
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.domain.split_bill import calculate_bill
from app.repositories.models import AccountModel, PlaidAccountLinkModel, SplitBillModel, TransactionModel
from app.schemas.split_bill_schema import SplitBillDraft
from app.services.tracking_mode_service import TrackingModeService
from app.services.transaction_matching import allocated


LEGACY_FIELDS = {"account_id", "tip_method", "category"}


class SplitBillService:
    def __init__(self, db: Session, user_id: int):
        self.db, self.user_id = db, user_id

    def get(self, bill_id: int, lock=False):
        if lock:
            self.db.execute(update(SplitBillModel).where(
                SplitBillModel.id == bill_id, SplitBillModel.user_id == self.user_id
            ).values(user_id=SplitBillModel.user_id))
            self.db.expire_all()
        bill = self.db.query(SplitBillModel).filter_by(id=bill_id, user_id=self.user_id).first()
        if bill is None or bill.data.get("_deleted"):
            raise HTTPException(404, "Split bill not found.")
        return bill

    def read(self, bill):
        draft = SplitBillDraft.model_validate(bill.data)
        calculation = calculate_bill(draft)
        repayments = {}
        for person in calculation["people"]:
            if person["id"] == draft.self_id:
                continue
            received = Decimal("0")
            needs_review = False
            value = (bill.repayments or {}).get(person["id"])
            for entry in self.payments(value) if value else []:
                transaction = self.db.get(TransactionModel, entry["transaction_id"])
                account = self.db.get(AccountModel, transaction.account_id) if transaction else None
                valid = transaction and account and account.user_id == self.user_id and not (transaction.receipt_metadata or {}).get("bank_removed")
                amount = transaction.amount if valid else Decimal("0")
                needs_review |= not valid or amount != Decimal(entry["amount"])
                received += amount
            owed = Decimal(person["total"]) / 100
            repayments[person["id"]] = {"received": str(received), "remaining": str(max(owed - received, Decimal("0"))),
                "paid": received >= owed and owed > 0 and not needs_review, "needs_review": bool(needs_review)}
        return {"id": bill.id, "data": draft.model_dump(mode="json", exclude=LEGACY_FIELDS),
                "calculation": calculation, "repayments": repayments}

    @staticmethod
    def payments(value):
        # Preserve compatibility with historical records and Plaid disconnect.
        return value.get("payments", [dict(id="legacy", amount=value["amount"],
            transaction_id=value["transaction_id"], payment_date=None)])

    def list(self):
        return [self.read(bill) for bill in self.db.query(SplitBillModel).filter_by(user_id=self.user_id).order_by(SplitBillModel.id.desc()) if not bill.data.get("_deleted")]

    def delete(self, bill_id):
        try:
            bill = self.get(bill_id, lock=True)
            # Keep the record's financial references intact for matching, bank
            # reconciliation and historical audit. No ledger entries are removed.
            bill.data = {**bill.data, "_deleted": True}
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def repayment_options(self, bill_id, person_id):
        bill = self.get(bill_id)
        status = self.read(bill)["repayments"].get(person_id)
        if status is None:
            raise HTTPException(400, "Choose a friend on this split.")
        remaining = Decimal(status["remaining"])
        accounts = self.db.query(AccountModel).filter_by(user_id=self.user_id).all()
        ids = {account.id for account in accounts}
        transactions = [transaction for transaction in self.db.query(TransactionModel)
            if transaction.account_id in ids and self._eligible(transaction, bill, remaining)]
        manual = TrackingModeService(self.db).read()["mode"] in (None, "manual")
        return {"accounts": [{"id": account.id, "name": account.name} for account in accounts
                if manual and account.bank_current_balance is None and not self.db.query(PlaidAccountLinkModel).filter_by(account_id=account.id).first()],
            "transactions": [{"id": transaction.id, "note": transaction.note, "amount": str(transaction.amount),
                "transaction_date": transaction.transaction_date.isoformat()} for transaction in transactions]}

    def _eligible(self, transaction, bill, remaining):
        metadata = transaction.receipt_metadata or {}
        return (transaction.transaction_type == "income" and transaction.amount == remaining and remaining > 0
            and transaction.financial_kind == "standard" and not allocated(self.db, transaction.id)
            and not metadata.get("pending") and not metadata.get("bank_removed")
            and date.fromisoformat(bill.data["bill_date"]) - timedelta(days=3) <= transaction.transaction_date <= date.today())

    def mark_paid(self, bill_id, person_id, payload):
        try:
            bill = self.get(bill_id, lock=True)
            status = self.read(bill)["repayments"].get(person_id)
            if status is None:
                raise HTTPException(400, "Choose a friend on this split.")
            if status["needs_review"]:
                raise HTTPException(409, "A linked bank repayment changed. Review the transaction before recording more money.")
            if status["paid"]:
                self.db.commit()
                return self.read(bill)
            if any(entry.get("id") == payload.request_id for value in (bill.repayments or {}).values() for entry in self.payments(value)):
                raise HTTPException(409, "This repayment request was already used. Refresh the split.")
            remaining = Decimal(status["remaining"])
            if remaining <= 0:
                raise HTTPException(400, "This friend has no remaining share.")
            draft = SplitBillDraft.model_validate(bill.data)
            person = next(person for person in draft.people if person.id == person_id)
            if payload.transaction_id:
                transaction = self.db.get(TransactionModel, payload.transaction_id)
                account_id = transaction.account_id if transaction else None
            else:
                transaction = None
                account_id = payload.account_id
                TrackingModeService(self.db).require("manual")
            # Serialize allocation across different splits targeting the same account.
            self.db.execute(update(AccountModel).where(AccountModel.id == account_id, AccountModel.user_id == self.user_id).values(starting_balance=AccountModel.starting_balance))
            account = self.db.query(AccountModel).filter_by(id=account_id, user_id=self.user_id).first()
            if account is None:
                raise HTTPException(404, "Receiving account or transaction not found.")
            if payload.transaction_id:
                self.db.refresh(transaction)
                if not self._eligible(transaction, bill, remaining):
                    raise HTTPException(409, "Choose an unassigned posted incoming transaction matching the remaining share.")
            else:
                if account.bank_current_balance is not None or self.db.query(PlaidAccountLinkModel).filter_by(account_id=account.id).first():
                    raise HTTPException(409, "Link the existing bank transaction instead of creating a duplicate repayment.")
                transaction = TransactionModel(account_id=account.id, amount=remaining, category="Refund",
                    transaction_type="income", transaction_date=date.today(),
                    note=f"Split bill repayment: {person.name} — {draft.title}"[:255])
                self.db.add(transaction)
                self.db.flush()
            transaction.financial_kind = "reimbursement"
            transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "split_bill_id": bill.id}
            values = dict(bill.repayments or {})
            payments = list(self.payments(values[person_id])) if person_id in values else []
            payments.append({"id": payload.request_id, "amount": str(remaining), "transaction_id": transaction.id,
                "payment_date": transaction.transaction_date.isoformat(), "existing": bool(payload.transaction_id), "previous_kind": "standard"})
            values[person_id] = {"amount": str(sum(Decimal(entry["amount"]) for entry in payments)),
                "transaction_id": transaction.id, "payments": payments}
            bill.repayments = values
            self.db.commit()
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise

    def save(self, draft: SplitBillDraft, bill_id=None):
        calculation = calculate_bill(draft)
        if not calculation["all_assigned"] or calculation["allocated"] != calculation["total"]:
            raise HTTPException(400, "Assign every item to at least one person before saving the split.")
        if not calculation["matches"] or calculation["subtotal"] <= 0 or calculation["total"] >= 10**12:
            raise HTTPException(400, "Check the receipt total and item amounts before saving the split.")
        try:
            bill = self.get(bill_id, lock=True) if bill_id else None
            # Older receipts may own financial references. Create a calculator
            # copy rather than editing, removing or reclassifying their ledger.
            if bill is None or bill.payment_transaction_id is not None or bill.repayments or bill.data.get("account_id") is not None or bill.data.get("bank_disconnect_review"):
                bill = SplitBillModel(user_id=self.user_id, repayments={})
            bill.data = draft.model_dump(mode="json", exclude=LEGACY_FIELDS)
            self.db.add(bill)
            self.db.commit()
            self.db.refresh(bill)
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise
