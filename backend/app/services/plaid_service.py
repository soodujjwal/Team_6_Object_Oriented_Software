from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import base64
import hashlib

import httpx
from pymongo.errors import OperationFailure
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.repositories.models import (
    AccountModel,
    PlaidAccountLinkModel,
    PlaidItemModel,
    PlaidTransactionLinkModel,
    TransactionModel,
)


PLAID_BASE_URLS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}

CATEGORY_MAP = {
    "FOOD_AND_DRINK": "Food & Dining",
    "TRANSPORTATION": "Transportation",
    "RENT_AND_UTILITIES": "Housing",
    "GENERAL_MERCHANDISE": "Shopping",
    "ENTERTAINMENT": "Entertainment",
    "MEDICAL": "Health & Medical",
    "TRAVEL": "Travel",
    "LOAN_PAYMENTS": "Debt Payment",
    "PERSONAL_CARE": "Personal Care",
    "GOVERNMENT_AND_NON_PROFIT": "Other",
    "INCOME": "Salary",
    "TRANSFER_IN": "Other",
    "TRANSFER_OUT": "Other",
}


class _SyncCursorChanged(Exception):
    """Another sync committed while this request was fetching bank updates."""


class PlaidClient:
    def __init__(self):
        settings = get_settings()
        self.client_id = settings.plaid_client_id
        self.secret = settings.plaid_secret
        self.environment = settings.plaid_environment
        self.base_url = PLAID_BASE_URLS.get(self.environment, PLAID_BASE_URLS["sandbox"])

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.secret)

    def post(self, path: str, payload: dict) -> dict:
        if not self.configured:
            raise HTTPException(503, "Plaid is not configured on the server.")
        try:
            response = httpx.post(
                f"{self.base_url}{path}",
                json={"client_id": self.client_id, "secret": self.secret, **payload},
                timeout=30,
            )
            data = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise HTTPException(502, "Could not reach Plaid.") from error
        if response.is_error:
            if data.get("error_code") == "INVALID_API_KEYS":
                config_file = ".env.plaid-sandbox" if get_settings().profile == "plaid-sandbox" else ".env"
                raise HTTPException(
                    503,
                    f"Plaid rejected PLAID_CLIENT_ID or PLAID_SECRET for the {self.environment} environment. "
                    f"Copy the matching keys from the Plaid Dashboard into the root {config_file} file, then restart the backend.",
                )
            message = data.get("error_message") or data.get("display_message") or "Plaid request failed."
            raise HTTPException(502, message)
        return data


class PlaidService:
    def __init__(self, db: Session, client: PlaidClient | None = None):
        self.db = db
        self.client = client or PlaidClient()

    def status(self, user_id: int) -> dict:
        items = self.db.query(PlaidItemModel).filter(PlaidItemModel.user_id == user_id).all()
        return {
            "configured": self.client.configured,
            "connections": [self._item_status(item) for item in items],
        }

    def create_link_token(self, user_id: int, *, android: bool = False) -> dict:
        settings = get_settings()
        payload = {
            "client_name": settings.app_name,
            "country_codes": ["US"],
            "language": "en",
            "products": ["transactions"],
            "user": {"client_user_id": str(user_id)},
        }
        if settings.plaid_webhook_url:
            payload["webhook"] = settings.plaid_webhook_url
        if android:
            # Fixed to the published application identity; never accept an
            # arbitrary package name from the requesting client.
            payload["android_package_name"] = "financebuilder.app.com"
        result = self.client.post("/link/token/create", payload)
        return {"link_token": result["link_token"], "expiration": result.get("expiration")}

    def exchange(self, user_id: int, public_token: str, metadata: dict | None = None) -> dict:
        exchanged = self.client.post("/item/public_token/exchange", {"public_token": public_token})
        existing = self.db.query(PlaidItemModel).filter(PlaidItemModel.item_id == exchanged["item_id"]).first()
        if existing:
            if existing.user_id != user_id:
                raise HTTPException(409, "This bank connection belongs to another user.")
            item = existing
            item.access_token = _encrypt_token(exchanged["access_token"])
        else:
            institution = (metadata or {}).get("institution") or {}
            item = PlaidItemModel(
                user_id=user_id,
                access_token=_encrypt_token(exchanged["access_token"]),
                item_id=exchanged["item_id"],
                institution_id=institution.get("institution_id"),
                institution_name=institution.get("name") or "Connected bank",
            )
            self.db.add(item)
            self.db.flush()
        self._upsert_accounts(item)
        self.db.commit()
        sync = self.sync_item(item)
        return {"connection": self._item_status(item), "sync": sync}

    def sync_user(self, user_id: int) -> dict:
        items = self.db.query(PlaidItemModel).filter(PlaidItemModel.user_id == user_id).all()
        totals = {"added": 0, "modified": 0, "removed": 0}
        for item in items:
            result = self.sync_item(item)
            for key in totals:
                totals[key] += result[key]
        return totals

    def sync_by_plaid_item_id(self, item_id: str) -> dict:
        item = self.db.query(PlaidItemModel).filter(PlaidItemModel.item_id == item_id).first()
        if not item:
            return {"added": 0, "modified": 0, "removed": 0}
        return self.sync_item(item)

    def sync_item(self, item: PlaidItemModel) -> dict:
        item_id = item.id
        for attempt in range(3):
            try:
                return self._sync_item_once(item)
            except (_SyncCursorChanged, OperationFailure) as error:
                if isinstance(error, OperationFailure) and (
                    not error.has_error_label("TransientTransactionError")
                    or error.has_error_label("UnknownTransactionCommitResult")
                ):
                    raise
                self.db.rollback()
                if attempt == 2:
                    raise HTTPException(409, "Bank sync is busy. Please try again shortly.") from None
                item = self.db.get(PlaidItemModel, item_id)
                if item is None:
                    raise HTTPException(409, "This bank was disconnected during sync.") from None

    def _sync_item_once(self, item: PlaidItemModel) -> dict:
        original_cursor = item.cursor
        if hasattr(self.db, "release_read_transaction"):
            self.db.release_read_transaction()
        cursor = original_cursor
        totals = {"added": 0, "modified": 0, "removed": 0}
        pages: list[dict] = []
        while True:
            try:
                page = self.client.post("/transactions/sync", {"access_token": _decrypt_token(item.access_token), "cursor": cursor or ""})
            except HTTPException as error:
                if "mutation during pagination" in str(error.detail).lower() and cursor != original_cursor:
                    cursor, pages = original_cursor, []
                    continue
                item.status = "error"
                self.db.commit()
                raise
            pages.append(page)
            cursor = page.get("next_cursor", cursor)
            if not page.get("has_more"):
                break

        # Complete external requests before opening the atomic import transaction.
        balances = self.client.post("/accounts/get", {"access_token": _decrypt_token(item.access_token)})
        if hasattr(self.db, "release_read_transaction"):
            from sqlalchemy import update
            self.db.execute(update(PlaidItemModel).where(PlaidItemModel.id == item.id).values(cursor=PlaidItemModel.cursor))
            if item.cursor != original_cursor:
                raise _SyncCursorChanged()
        self.db.flush()
        account_links = {link.plaid_account_id: link for link in
                         self.db.query(PlaidAccountLinkModel).filter_by(plaid_item_id=item.id)}
        transaction_links = {link.plaid_transaction_id: link for link in
                             self.db.query(PlaidTransactionLinkModel).filter_by(plaid_item_id=item.id)}
        for page in pages:
            for plaid_transaction in page.get("added", []):
                if self._upsert_transaction(item, plaid_transaction, account_links, transaction_links):
                    totals["added"] += 1
            for plaid_transaction in page.get("modified", []):
                if self._upsert_transaction(item, plaid_transaction, account_links, transaction_links):
                    totals["modified"] += 1
        # A posted transaction can replace a pending transaction from another page.
        self.db.flush()
        for page in pages:
            for removed in page.get("removed", []):
                link = self.db.query(PlaidTransactionLinkModel).filter(
                    PlaidTransactionLinkModel.plaid_transaction_id == removed.get("transaction_id"),
                    PlaidTransactionLinkModel.plaid_item_id == item.id,
                ).first()
                if link:
                    transaction = self.db.get(TransactionModel, link.transaction_id)
                    self.db.delete(link)
                    if transaction:
                        self._undo_recurring(transaction)
                        from app.services.transaction_matching import allocated
                        if allocated(self.db, transaction.id) or (transaction.receipt_metadata or {}).get("matched_manual"):
                            transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "bank_removed": True}
                        else:
                            self.db.delete(transaction)
                    totals["removed"] += 1
        self.db.flush()
        from app.services.transaction_matching import auto_match
        from app.services.transaction_service import TransactionService
        auto_match(self.db)
        imported_ids = [link.transaction_id for link in self.db.query(PlaidTransactionLinkModel).filter_by(plaid_item_id=item.id)]
        matcher = TransactionService(self.db)
        for transaction in self.db.query(TransactionModel).filter(TransactionModel.id.in_(imported_ids)):
            matcher._mark_matching_recurring_paid(transaction, commit=False)
        item.cursor = cursor
        item.status = "active"
        item.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self._reconcile_balances(item, balances)
        self.db.commit()
        return totals

    def request_refresh(self, user_id: int) -> dict:
        items = self.db.query(PlaidItemModel).filter(PlaidItemModel.user_id == user_id).all()
        for item in items:
            self.client.post("/transactions/refresh", {"access_token": _decrypt_token(item.access_token)})
        return {"requested": len(items)}

    def disconnect(self, user_id: int, connection_id: int) -> None:
        item = self.db.query(PlaidItemModel).filter(
            PlaidItemModel.id == connection_id, PlaidItemModel.user_id == user_id
        ).first()
        if not item:
            raise HTTPException(404, "Bank connection not found.")
        try:
            self.client.post("/item/remove", {"access_token": _decrypt_token(item.access_token)})
        except HTTPException:
            pass
        from app.repositories.models import RecurringTransactionModel, SplitBillModel, TransferModel
        from app.services.split_bill_service import SplitBillService
        account_links = self.db.query(PlaidAccountLinkModel).filter_by(plaid_item_id=item.id).all()
        account_ids = {link.account_id for link in account_links}
        accounts = self.db.query(AccountModel).filter(AccountModel.id.in_(account_ids)).all()
        rows = self.db.query(TransactionModel).filter(TransactionModel.account_id.in_(account_ids)).all()
        removed_ids = {row.id for row in rows}

        # Keep receipts as reviewable drafts rather than references to deleted records.
        bills = SplitBillService(self.db, user_id)
        for bill in self.db.query(SplitBillModel).filter_by(user_id=user_id):
            changed = bill.data.get("account_id") in account_ids or bill.payment_transaction_id in removed_ids
            if changed:
                bill.data = {**bill.data, "account_id": None, "bank_disconnect_review": True}
                bill.payment_transaction_id = None
            repayments = {}
            for person, value in bill.repayments.items():
                payments = bills.payments(value)
                kept = [payment for payment in payments if payment["transaction_id"] not in removed_ids]
                if len(kept) != len(payments):
                    changed = True
                    if kept:
                        repayments[person] = {**value, "payments": kept,
                            "amount": str(sum((Decimal(p["amount"]) for p in kept), Decimal("0"))),
                            "transaction_id": kept[-1]["transaction_id"]}
                else:
                    repayments[person] = value
            if changed:
                bill.repayments = repayments
                bill.data = {**bill.data, "bank_disconnect_review": True}

        for transfer in self.db.query(TransferModel).all():
            if not account_ids.intersection({transfer.from_account_id, transfer.to_account_id}):
                continue
            # The surviving account still received/sent this money. Retain its
            # transaction while removing the ledger's deleted-account reference.
            survivor = transfer.to_account_id if transfer.from_account_id in account_ids else transfer.from_account_id
            if survivor not in account_ids:
                legs = [row for row in self.db.query(TransactionModel).filter_by(account_id=survivor)
                        if (row.receipt_metadata or {}).get("transfer_id") == transfer.id]
                for leg in legs:
                    leg.receipt_metadata = {key: value for key, value in (leg.receipt_metadata or {}).items() if key != "transfer_id"}
                if not legs:
                    self.db.add(TransactionModel(account_id=survivor, amount=transfer.amount, category="Transfer",
                        transaction_type="income" if survivor == transfer.to_account_id else "expense",
                        transaction_date=transfer.transfer_date, note=transfer.note or "Transfer from disconnected bank",
                        financial_kind="transfer"))
            self.db.delete(transfer)

        links = self.db.query(PlaidTransactionLinkModel).filter(PlaidTransactionLinkModel.plaid_item_id == item.id).all()
        for link in links:
            self.db.delete(link)
        for link in account_links:
            self.db.delete(link)
        for row in rows:
            self.db.delete(row)
        for schedule in self.db.query(RecurringTransactionModel).filter(RecurringTransactionModel.account_id.in_(account_ids)):
            self.db.delete(schedule)
        self.db.flush()
        for account in accounts:
            self.db.delete(account)
        self.db.flush()
        self.db.delete(item)
        self.db.commit()

    def _upsert_accounts(self, item: PlaidItemModel) -> None:
        result = self.client.post("/accounts/get", {"access_token": _decrypt_token(item.access_token)})
        for plaid_account in result.get("accounts", []):
            plaid_id = plaid_account["account_id"]
            link = self.db.query(PlaidAccountLinkModel).filter(PlaidAccountLinkModel.plaid_account_id == plaid_id).first()
            if link:
                continue
            subtype = plaid_account.get("subtype") or "other"
            account_type = subtype if subtype in {"checking", "savings"} else "other"
            balances = plaid_account.get("balances") or {}
            current = balances.get("current")
            account = AccountModel(
                user_id=item.user_id,
                bank_name=item.institution_name,
                name=plaid_account.get("name") or plaid_account.get("official_name") or "Connected account",
                starting_balance=Decimal(str(current if current is not None else 0)) * (-1 if plaid_account.get("type") == "credit" else 1),
                bank_account_type=plaid_account.get("type"),
                account_type=account_type,
            )
            self.db.add(account)
            self.db.flush()
            self.db.add(PlaidAccountLinkModel(plaid_item_id=item.id, plaid_account_id=plaid_id, account_id=account.id))

    def _upsert_transaction(self, item: PlaidItemModel, value: dict,
                            account_links: dict, transaction_links: dict) -> bool:
        account_link = account_links.get(value.get("account_id"))
        if not account_link:
            return False
        plaid_id = value["transaction_id"]
        link = transaction_links.get(plaid_id)
        if link is None and value.get("pending_transaction_id"):
            link = transaction_links.get(value["pending_transaction_id"])
            if link:
                transaction_links.pop(value["pending_transaction_id"], None)
                link.plaid_transaction_id = plaid_id
                transaction_links[plaid_id] = link
        transaction = self.db.get(TransactionModel, link.transaction_id) if link else None
        if transaction is not None:
            self._undo_recurring(transaction)
        if transaction is None:
            transaction = TransactionModel(
                account_id=account_link.account_id,
                amount=Decimal("0"),
                category="Other",
                transaction_type="expense",
                transaction_date=date.today(),
            )
            self.db.add(transaction)
        amount = Decimal(str(value.get("amount", 0)))
        primary = ((value.get("personal_finance_category") or {}).get("primary") or "").upper()
        transaction.account_id = account_link.account_id
        transaction.amount = abs(amount)
        transaction.transaction_type = "expense" if amount >= 0 else "income"
        preserve = bool((transaction.receipt_metadata or {}).get("matched_manual") or (transaction.receipt_metadata or {}).get("user_categorized"))
        from app.services.transaction_matching import allocated
        preserve = preserve or allocated(self.db, transaction.id)
        if not preserve:
            transaction.category = CATEGORY_MAP.get(primary, "Other")
            detail = ((value.get("personal_finance_category") or {}).get("detailed") or "").upper()
            # Peer repayments can also be TRANSFER_IN; only classify account transfers here.
            transaction.financial_kind = "transfer" if detail in {"TRANSFER_IN_ACCOUNT_TRANSFER", "TRANSFER_OUT_ACCOUNT_TRANSFER"} else "standard"
        transaction.transaction_date = date.fromisoformat(value.get("authorized_date") or value["date"])
        bank_name = (value.get("merchant_name") or value.get("name") or "Plaid transaction")[:255]
        if not preserve:
            transaction.note = bank_name
        transaction.receipt_metadata = {**(transaction.receipt_metadata or {}), "source": "plaid",
            "bank_description": bank_name, "pending": bool(value.get("pending")), "bank_removed": False}
        if link is None:
            self.db.flush()
            link = PlaidTransactionLinkModel(
                plaid_item_id=item.id, plaid_transaction_id=plaid_id, transaction_id=transaction.id
            )
            self.db.add(link)
            transaction_links[plaid_id] = link
        return True

    def _reconcile_balances(self, item: PlaidItemModel, result: dict) -> None:
        links = {row.plaid_account_id: row for row in
                 self.db.query(PlaidAccountLinkModel).filter_by(plaid_item_id=item.id)}
        imported_ids = [row.transaction_id for row in self.db.query(PlaidTransactionLinkModel).filter_by(plaid_item_id=item.id)]
        movements = {}
        for transaction in self.db.query(TransactionModel).filter(TransactionModel.id.in_(imported_ids)):
            movement = transaction.amount if transaction.transaction_type == "income" else -transaction.amount
            movements[transaction.account_id] = movements.get(transaction.account_id, Decimal("0")) + movement
        accounts = {row.id: row for row in self.db.query(AccountModel).filter(
            AccountModel.id.in_([link.account_id for link in links.values()]))}
        for plaid_account in result.get("accounts", []):
            current = (plaid_account.get("balances") or {}).get("current")
            if current is None:
                continue
            link = links.get(plaid_account["account_id"])
            if not link:
                continue
            movement = movements.get(link.account_id, Decimal("0"))
            account = accounts.get(link.account_id)
            if account:
                account.bank_account_type = plaid_account.get("type") or account.bank_account_type
                signed_current = Decimal(str(current)) * (-1 if account.bank_account_type == "credit" else 1)
                account.starting_balance = signed_current - movement
                account.bank_current_balance = Decimal(str(current))
                available = (plaid_account.get("balances") or {}).get("available")
                account.bank_available_balance = Decimal(str(available)) if available is not None else None
                limit = (plaid_account.get("balances") or {}).get("limit")
                account.bank_credit_limit = Decimal(str(limit)) if limit is not None else None
                account.balance_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)

    def _undo_recurring(self, transaction):
        from app.repositories.models import RecurringTransactionModel
        previous = (transaction.receipt_metadata or {}).get("recurring_previous")
        if not previous:
            return
        schedule = self.db.get(RecurringTransactionModel, previous["id"])
        if schedule and schedule.last_matched_transaction_id == transaction.id:
            schedule.next_due_date = date.fromisoformat(previous["next_due_date"])
            schedule.last_paid_date = date.fromisoformat(previous["last_paid_date"]) if previous["last_paid_date"] else None
            schedule.last_matched_transaction_id = previous["last_matched_transaction_id"]
        transaction.receipt_metadata = {k: v for k, v in (transaction.receipt_metadata or {}).items() if k != "recurring_previous"}

    def _item_status(self, item: PlaidItemModel) -> dict:
        account_count = self.db.query(PlaidAccountLinkModel).filter(PlaidAccountLinkModel.plaid_item_id == item.id).count()
        return {
            "id": item.id,
            "institution_name": item.institution_name,
            "status": item.status,
            "account_count": account_count,
            "last_synced_at": item.last_synced_at.isoformat() + "Z" if item.last_synced_at else None,
        }


def _token_cipher() -> Fernet:
    secret = get_settings().jwt_secret_key.encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def _encrypt_token(token: str) -> str:
    return "enc:" + _token_cipher().encrypt(token.encode("utf-8")).decode("utf-8")


def _decrypt_token(token: str) -> str:
    if not token.startswith("enc:"):
        return token
    return _token_cipher().decrypt(token[4:].encode("utf-8")).decode("utf-8")
