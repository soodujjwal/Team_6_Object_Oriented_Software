"""Test-only historical ledger fixture. NEVER imported by application code.

Seeds records from the retired split-payment workflow so bank reconciliation,
legacy migrations and balance/reporting regressions remain testable. The real
SplitBillService is calculator-only and has no payment mutation methods.
"""
from datetime import date
from decimal import Decimal
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.domain.split_bill import calculate_bill as calculate_receipt
from app.repositories.models import AccountModel, SplitBillModel, TransactionModel
from app.schemas.split_bill_schema import SplitBillDraft as ReceiptDraft
from typing import Literal
from app.schemas.common import ORMModel
from pydantic import Field
from app.services.account_service import AccountService
from app.repositories.transaction_repository import TransactionRepository
from app.services.transaction_matching import allocated, bank_link


class SplitBillDraft(ReceiptDraft):
    """Retired input shape, used solely for constructing historical fixtures."""
    tip_method: Literal["bank", "cash"] = "bank"
    account_id: int | None = None
    category: str = "Food & Dining"


def calculate_bill(draft):
    return {**calculate_receipt(draft), "bank_debit": int((sum(item.price * item.quantity for item in draft.items) + draft.tax + (draft.tip if draft.tip_method == "bank" else 0)) * 100)}


class RepaymentUpdate(ORMModel):
    received: bool
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)


class RepaymentCreate(ORMModel):
    transaction_id: int | None = Field(default=None, gt=0)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    account_id: int | None = Field(default=None, gt=0)
    payment_date: date = Field(default_factory=date.today)
    request_id: str = Field(min_length=1, max_length=100)


class LegacySplitFixture:
    def __init__(self, db: Session, user_id: int):
        self.db, self.user_id = db, user_id

    def get(self, bill_id: int, lock=False):
        if lock:
            self.db.execute(update(SplitBillModel).where(
                SplitBillModel.id == bill_id, SplitBillModel.user_id == self.user_id
            ).values(user_id=SplitBillModel.user_id))
            self.db.expire_all()
        bill = self.db.query(SplitBillModel).filter_by(id=bill_id, user_id=self.user_id).first()
        if bill is None:
            raise HTTPException(404, "Split bill not found.")
        return bill

    def read(self, bill):
        repayments = {}
        review = bool(bill.data.get("bank_disconnect_review"))
        for person, value in bill.repayments.items():
            payments = self.payments(value)
            total = Decimal("0")
            history = []
            for entry in payments:
                transaction = self.db.get(TransactionModel, entry["transaction_id"])
                removed = transaction is None or (transaction.receipt_metadata or {}).get("bank_removed", False)
                amount = Decimal("0") if removed else transaction.amount
                changed = removed or amount != Decimal(entry["amount"])
                review = review or changed
                total += amount
                history.append({**entry, "amount": str(amount), "needs_review": changed})
            repayments[person] = {**value, "amount": value["amount"] if total == Decimal(value["amount"]) else str(total), "payments": history}
        payment = self.db.get(TransactionModel, bill.payment_transaction_id) if bill.payment_transaction_id else None
        review = review or bool(payment and ((payment.receipt_metadata or {}).get("bank_removed")
            or payment.amount != Decimal(calculate_bill(SplitBillDraft.model_validate(bill.data))["bank_debit"]) / 100))
        return dict(id=bill.id, data=bill.data, paid=bill.payment_transaction_id is not None,
                    payment_transaction_id=bill.payment_transaction_id, needs_review=review,
                    repayments=repayments, calculation=calculate_bill(SplitBillDraft.model_validate(bill.data)))

    def payments(self, value):
        return value.get("payments", [dict(id="legacy", amount=value["amount"],
            transaction_id=value["transaction_id"], payment_date=None)])

    def own_amount(self, draft):
        return Decimal(next(p["total"] for p in calculate_bill(draft)["people"] if p["id"] == draft.self_id)) / 100

    def list(self):
        return [self.read(bill) for bill in self.db.query(SplitBillModel).filter_by(user_id=self.user_id).order_by(SplitBillModel.id.desc())]

    def ready(self, draft):
        calculation = calculate_bill(draft)
        if not calculation["all_assigned"] or calculation["allocated"] != calculation["total"]:
            raise HTTPException(400, "Assign every item to at least one person before recording payment.")
        if not calculation["matches"]:
            raise HTTPException(400, "Enter the receipt total including tip and make sure it matches the split.")
        if calculation["subtotal"] <= 0 or calculation["bank_debit"] >= 10**12:
            raise HTTPException(400, "The bill must have a positive subtotal within the supported amount range.")
        if draft.account_id is None:
            raise HTTPException(400, "Select the account that paid the bill.")
        return calculation

    def require_balance(self, account_id, amount):
        self.db.execute(update(AccountModel).where(AccountModel.id == account_id).values(starting_balance=AccountModel.starting_balance))
        account = AccountService(self.db).get_account(account_id)
        if amount > account.current_balance:
            raise HTTPException(400, "The selected account has insufficient funds.")

    def save(self, draft: SplitBillDraft, bill_id=None):
        try:
            bill = self.get(bill_id, lock=True) if bill_id else SplitBillModel(user_id=self.user_id, repayments={})
            if bill.payment_transaction_id:
                calculation = self.ready(draft)
                old = SplitBillDraft.model_validate(bill.data)
                if old.account_id != draft.account_id or old.self_id != draft.self_id:
                    raise HTTPException(400, "The paying account and your identity cannot change after payment.")
                if not set(bill.repayments).issubset(person.id for person in draft.people):
                    raise HTTPException(400, "Undo a person's repayment before removing them.")
                transaction = self.db.get(TransactionModel, bill.payment_transaction_id)
                amount = Decimal(calculation["bank_debit"]) / 100
                if bank_link(self.db, transaction.id):
                    if amount != transaction.amount or draft.bill_date != old.bill_date:
                        raise HTTPException(409, "A linked bank charge cannot be changed. Keep its amount and payment date.")
                else:
                    self.require_balance(draft.account_id, max(Decimal(0), amount - transaction.amount))
                    transaction.amount = amount
                    transaction.note = f"Split bill: {draft.title}"
                transaction.category = draft.category
                transaction.transaction_date = draft.bill_date
                transaction.personal_amount = self.own_amount(draft)
            bill.data = draft.model_dump(mode="json")
            self.db.add(bill)
            self.db.commit()
            self.db.refresh(bill)
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise

    def pay(self, bill_id, transaction_id=None):
        try:
            bill = self.get(bill_id, lock=True)
            if not bill.payment_transaction_id:
                draft = SplitBillDraft.model_validate(bill.data)
                calculation = self.ready(draft)
                amount = Decimal(calculation["bank_debit"]) / 100
                AccountService(self.db).get_account(draft.account_id)
                if transaction_id:
                    transaction = TransactionRepository(self.db).get(transaction_id)
                    if (not transaction or transaction.account_id != draft.account_id or transaction.amount != amount
                            or transaction.transaction_type != "expense" or allocated(self.db, transaction.id)
                            or transaction.financial_kind == "transfer"
                            or (transaction.receipt_metadata or {}).get("pending")
                            or (transaction.receipt_metadata or {}).get("bank_removed")):
                        raise HTTPException(409, "Choose an unassigned posted expense with the same account and bill amount.")
                else:
                    self.require_balance(draft.account_id, amount)
                    transaction = TransactionModel(account_id=draft.account_id, amount=amount, category=draft.category,
                        transaction_type="expense", transaction_date=draft.bill_date, note=f"Split bill: {draft.title}",
                        receipt_metadata={"split_payment_created": True})
                transaction.personal_amount = self.own_amount(draft)
                transaction.category = draft.category
                transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "split_bill_id": bill.id}
                self.db.add(transaction)
                self.db.flush()
                bill.payment_transaction_id = transaction.id
            elif transaction_id and transaction_id != bill.payment_transaction_id:
                raise HTTPException(409, "This bill already has a payment.")
            self.db.commit()
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise

    def unlink_payment(self, bill_id):
        try:
            bill = self.get(bill_id, lock=True)
            if bill.repayments:
                raise HTTPException(409, "Remove repayment links before unlinking this bill payment.")
            transaction = self.db.get(TransactionModel, bill.payment_transaction_id) if bill.payment_transaction_id else None
            if transaction:
                if (transaction.receipt_metadata or {}).get("split_payment_created") and not bank_link(self.db, transaction.id):
                    self.db.delete(transaction)
                else:
                    transaction.personal_amount = None
                    transaction.receipt_metadata = {k: v for k, v in (transaction.receipt_metadata or {}).items()
                                                    if k not in {"split_bill_id", "split_payment_created"}}
            bill.payment_transaction_id = None
            self.db.commit()
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise

    def repay(self, bill_id, person_id, payload: RepaymentUpdate):
        try:
            bill = self.get(bill_id, lock=True)
            if not bill.payment_transaction_id:
                raise HTTPException(400, "Record the bill payment before recording repayments.")
            draft = SplitBillDraft.model_validate(bill.data)
            person = next((person for person in calculate_bill(draft)["people"] if person["id"] == person_id), None)
            if person is None or person_id == draft.self_id:
                raise HTTPException(400, "Choose a friend on this bill.")
            repayments = dict(bill.repayments)
            previous = repayments.get(person_id)
            if not payload.received:
                if previous:
                    for payment in self.payments(previous):
                        self.release(payment)
                    del repayments[person_id]
            else:
                if previous and len(self.payments(previous)) > 1:
                    raise HTTPException(409, "Manage individual payments in repayment history.")
                if previous and bank_link(self.db, previous["transaction_id"]):
                    raise HTTPException(409, "A bank repayment cannot be overwritten. Unlink it in repayment history.")
                amount = payload.amount if payload.amount is not None else Decimal(person["total"]) / 100
                if amount <= 0:
                    raise HTTPException(400, "The received amount must be positive.")
                transaction = self.db.get(TransactionModel, previous["transaction_id"]) if previous else TransactionModel(
                    account_id=draft.account_id, transaction_type="income", category="Refund", transaction_date=date.today())
                transaction.amount = amount
                transaction.financial_kind = "reimbursement"
                transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "split_bill_id": bill.id}
                transaction.note = f"Split bill repayment: {person['name']} — {draft.title}"[:255]
                self.db.add(transaction)
                self.db.flush()
                repayments[person_id] = dict(amount=str(amount), transaction_id=transaction.id)
            bill.repayments = repayments
            self.db.commit()
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise

    def release(self, payment):
        transaction = self.db.get(TransactionModel, payment["transaction_id"])
        if transaction:
            if bank_link(self.db, transaction.id) or payment.get("existing"):
                transaction.financial_kind = payment.get("previous_kind", "standard")
                transaction.receipt_metadata = {k: v for k, v in (transaction.receipt_metadata or {}).items() if k != "split_bill_id"}
            else:
                self.db.delete(transaction)

    def candidates(self, bill_id, person_id=None):
        bill = self.get(bill_id)
        draft = SplitBillDraft.model_validate(bill.data)
        rows = TransactionRepository(self.db).list()
        direction = "income" if person_id else "expense"
        amount = Decimal(calculate_bill(draft)["bank_debit"]) / 100
        from app.schemas.transaction_schema import TransactionRead
        remaining = Decimal("0")
        friend_name = ""
        if person_id:
            person = next((p for p in calculate_bill(draft)["people"] if p["id"] == person_id), None)
            if person is None or person_id == draft.self_id:
                raise HTTPException(400, "Choose a friend on this bill.")
            friend_name = person["name"].lower()
            remaining = Decimal(person["total"]) / 100 - Decimal(self.read(bill)["repayments"].get(person_id, {}).get("amount", "0"))
            rows.sort(key=lambda t: (friend_name in (t.note or "").lower(), t.amount == remaining, t.transaction_date), reverse=True)
        return [TransactionRead.model_validate(t) for t in rows
                if t.transaction_type == direction and t.financial_kind != "transfer"
                and not allocated(self.db, t.id) and not (t.receipt_metadata or {}).get("pending")
                and not (t.receipt_metadata or {}).get("bank_removed")
                and (person_id or (t.account_id == draft.account_id and t.amount == amount))
                and (draft.bill_date - timedelta(days=3) <= t.transaction_date <= date.today() if person_id
                     else abs((t.transaction_date - draft.bill_date).days) <= 7)]

    def add_repayment(self, bill_id, person_id, payload):
        try:
            bill = self.get(bill_id, lock=True)
            if not bill.payment_transaction_id:
                raise HTTPException(400, "Record the bill payment first.")
            draft = SplitBillDraft.model_validate(bill.data)
            person = next((p for p in calculate_bill(draft)["people"] if p["id"] == person_id), None)
            if not person or person_id == draft.self_id:
                raise HTTPException(400, "Choose a friend on this bill.")
            values = dict(bill.repayments)
            payments = list(self.payments(values[person_id])) if person_id in values else []
            if any(p["id"] == payload.request_id for value in values.values() for p in self.payments(value)):
                self.db.commit()
                return self.read(bill)
            account_id = payload.account_id or draft.account_id
            if payload.transaction_id:
                transaction = TransactionRepository(self.db).get(payload.transaction_id)
                if (not transaction or transaction.transaction_type != "income" or allocated(self.db, transaction.id)
                        or transaction.financial_kind == "transfer" or (transaction.receipt_metadata or {}).get("pending")
                        or (transaction.receipt_metadata or {}).get("bank_removed")):
                    raise HTTPException(409, "Choose an unassigned posted incoming transaction.")
                if payload.amount is not None and payload.amount != transaction.amount:
                    raise HTTPException(400, "The repayment must match the selected transaction's amount.")
            else:
                if payload.amount is None:
                    raise HTTPException(400, "Enter the amount received.")
                AccountService(self.db).get_account(account_id)
                transaction = TransactionModel(account_id=account_id, amount=payload.amount, category="Refund",
                    transaction_type="income", transaction_date=payload.payment_date,
                    note=f"Split bill repayment: {person['name']} — {draft.title}"[:255])
                self.db.add(transaction)
                self.db.flush()
            payment = dict(id=payload.request_id, amount=str(transaction.amount), transaction_id=transaction.id,
                           payment_date=transaction.transaction_date.isoformat(), existing=bool(payload.transaction_id),
                           previous_kind=transaction.financial_kind or "standard")
            transaction.financial_kind = "reimbursement"
            transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "split_bill_id": bill.id}
            payments.append(payment)
            values[person_id] = dict(amount=str(sum(Decimal(p["amount"]) for p in payments)),
                                     transaction_id=transaction.id, payments=payments)
            bill.repayments = values
            self.db.commit()
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise

    def remove_repayment(self, bill_id, person_id, payment_id):
        try:
            bill = self.get(bill_id, lock=True)
            values = dict(bill.repayments)
            if person_id not in values:
                raise HTTPException(404, "Repayment not found.")
            payments = self.payments(values[person_id])
            entry = next((p for p in payments if p["id"] == payment_id), None)
            if entry is None:
                raise HTTPException(404, "Repayment not found.")
            self.release(entry)
            payments = [p for p in payments if p["id"] != payment_id]
            if payments:
                values[person_id] = dict(amount=str(sum(Decimal(p["amount"]) for p in payments)),
                    transaction_id=payments[-1]["transaction_id"], payments=payments)
            else:
                del values[person_id]
            bill.repayments = values
            self.db.commit()
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise
