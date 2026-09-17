from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.domain.split_bill import calculate_bill
from app.repositories.models import AccountModel, SplitBillModel, TransactionModel
from app.schemas.split_bill_schema import RepaymentUpdate, SplitBillDraft
from app.services.account_service import AccountService


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
        if bill is None:
            raise HTTPException(404, "Split bill not found.")
        return bill

    def read(self, bill):
        return dict(id=bill.id, data=bill.data, paid=bill.payment_transaction_id is not None,
                    repayments=bill.repayments, calculation=calculate_bill(SplitBillDraft.model_validate(bill.data)))

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
                self.require_balance(draft.account_id, max(Decimal(0), amount - transaction.amount))
                transaction.amount = amount
                transaction.note = f"Split bill: {draft.title}"
                transaction.category = draft.category
                transaction.transaction_date = draft.bill_date
            bill.data = draft.model_dump(mode="json")
            self.db.add(bill)
            self.db.commit()
            self.db.refresh(bill)
            return self.read(bill)
        except Exception:
            self.db.rollback()
            raise

    def pay(self, bill_id):
        try:
            bill = self.get(bill_id, lock=True)
            if not bill.payment_transaction_id:
                draft = SplitBillDraft.model_validate(bill.data)
                calculation = self.ready(draft)
                amount = Decimal(calculation["bank_debit"]) / 100
                self.require_balance(draft.account_id, amount)
                transaction = TransactionModel(account_id=draft.account_id, amount=amount, category=draft.category,
                    transaction_type="expense", transaction_date=draft.bill_date, note=f"Split bill: {draft.title}")
                self.db.add(transaction)
                self.db.flush()
                bill.payment_transaction_id = transaction.id
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
                    self.db.delete(self.db.get(TransactionModel, previous["transaction_id"]))
                    del repayments[person_id]
            else:
                amount = payload.amount if payload.amount is not None else Decimal(person["total"]) / 100
                if amount <= 0:
                    raise HTTPException(400, "The received amount must be positive.")
                transaction = self.db.get(TransactionModel, previous["transaction_id"]) if previous else TransactionModel(
                    account_id=draft.account_id, transaction_type="income", category="Refund", transaction_date=date.today())
                transaction.amount = amount
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
