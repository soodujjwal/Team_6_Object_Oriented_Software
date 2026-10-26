"""Reconcile bank imports with manual ledger entries without duplicating money."""
import re
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import update

from app.repositories.models import AccountModel, PlaidTransactionLinkModel, SplitBillModel, RecurringTransactionModel
from app.repositories.transaction_repository import TransactionRepository


def bank_link(db, transaction_id):
    return db.query(PlaidTransactionLinkModel).filter_by(transaction_id=transaction_id).first()


def allocated(db, transaction_id):
    if transaction_id is None:
        return False
    for bill in db.query(SplitBillModel):
        if bill.payment_transaction_id == transaction_id:
            return True
        for repayment in bill.repayments.values():
            if repayment.get("transaction_id") == transaction_id or any(
                p.get("transaction_id") == transaction_id for p in repayment.get("payments", [])
            ):
                return True
    return False


def compatible(manual, imported):
    return (manual.id != imported.id and manual.account_id == imported.account_id
            and manual.amount == imported.amount and manual.transaction_type == imported.transaction_type
            and abs((manual.transaction_date - imported.transaction_date).days) <= 3
            and not (imported.receipt_metadata or {}).get("pending")
            and not (manual.receipt_metadata or {}).get("bank_removed"))


def merchant(transaction):
    metadata = transaction.receipt_metadata or {}
    return re.sub(r"[^a-z0-9]", "", str(metadata.get("merchant") or transaction.note or "").lower())


def suggestions(db):
    rows = TransactionRepository(db).list()
    linked = {link.transaction_id for link in db.query(PlaidTransactionLinkModel)}
    used = set()
    for bill in db.query(SplitBillModel):
        if bill.payment_transaction_id:
            used.add(bill.payment_transaction_id)
        for repayment in bill.repayments.values():
            used.update(payment["transaction_id"] for payment in repayment.get("payments", [repayment]))
    imports = defaultdict(list)
    for row in rows:
        if row.id in linked and row.id not in used:
            imports[(row.account_id, row.transaction_type, row.amount)].append(row)
    return [dict(manual_id=manual.id, bank_transaction_id=imported.id, amount=str(manual.amount),
                 manual_note=manual.note, bank_note=imported.note, date=imported.transaction_date.isoformat(),
                 reason="Same account, amount and direction; dates within 3 days")
            for manual in rows if manual.id not in linked
            for imported in imports[(manual.account_id, manual.transaction_type, manual.amount)] if compatible(manual, imported)]


def merge(db, manual_id, bank_transaction_id, commit=True):
    repo = TransactionRepository(db)
    manual, imported = repo.get(manual_id), repo.get(bank_transaction_id)
    if manual is None or imported is None:
        raise HTTPException(404, "Transaction not found.")
    db.execute(update(AccountModel).where(AccountModel.id == manual.account_id)
               .values(starting_balance=AccountModel.starting_balance))
    db.refresh(manual)
    db.refresh(imported)
    link = bank_link(db, imported.id)
    if bank_link(db, manual.id):
        raise HTTPException(409, "This entry is already matched to a bank transaction.")
    if not link or not compatible(manual, imported) or allocated(db, imported.id):
        raise HTTPException(409, "These transactions cannot be matched. Refresh the suggestions.")
    manual.amount = imported.amount
    manual.transaction_date = imported.transaction_date
    manual.receipt_metadata = {**(manual.receipt_metadata or {}), **(imported.receipt_metadata or {}),
                               "matched_manual": True}
    if manual.financial_kind == "standard" and imported.financial_kind == "transfer":
        manual.financial_kind = "transfer"
    link.transaction_id = manual.id
    for schedule in db.query(RecurringTransactionModel).filter_by(last_matched_transaction_id=imported.id):
        schedule.last_matched_transaction_id = manual.id
    db.delete(imported)
    db.flush()
    if commit:
        from app.services.transaction_service import TransactionService
        TransactionService(db)._mark_matching_recurring_paid(manual, commit=False)
        db.commit()
    return manual


def auto_match(db):
    candidates = suggestions(db)
    for candidate in candidates:
        # Require an exact merchant identity and a unique pairing on BOTH sides.
        if sum(c["manual_id"] == candidate["manual_id"] for c in candidates) != 1:
            continue
        if sum(c["bank_transaction_id"] == candidate["bank_transaction_id"] for c in candidates) != 1:
            continue
        repo = TransactionRepository(db)
        manual, imported = repo.get(candidate["manual_id"]), repo.get(candidate["bank_transaction_id"])
        if manual and imported and len(merchant(manual)) >= 4 and merchant(manual) == merchant(imported):
            merge(db, manual.id, imported.id, commit=False)
