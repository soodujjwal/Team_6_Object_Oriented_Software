from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import base64
import hashlib

import httpx
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
                raise HTTPException(
                    503,
                    f"Plaid rejected PLAID_CLIENT_ID or PLAID_SECRET for the {self.environment} environment. "
                    "Copy the matching keys from the Plaid Dashboard into the root .env file, then restart the backend.",
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

    def create_link_token(self, user_id: int) -> dict:
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
        original_cursor = item.cursor
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

        for page in pages:
            for plaid_transaction in page.get("added", []):
                if self._upsert_transaction(item, plaid_transaction):
                    totals["added"] += 1
            for plaid_transaction in page.get("modified", []):
                if self._upsert_transaction(item, plaid_transaction):
                    totals["modified"] += 1
            for removed in page.get("removed", []):
                link = self.db.query(PlaidTransactionLinkModel).filter(
                    PlaidTransactionLinkModel.plaid_transaction_id == removed.get("transaction_id")
                ).first()
                if link:
                    transaction = self.db.get(TransactionModel, link.transaction_id)
                    self.db.delete(link)
                    if transaction:
                        self.db.delete(transaction)
                    totals["removed"] += 1
        item.cursor = cursor
        item.status = "active"
        item.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self._reconcile_balances(item)
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
        links = self.db.query(PlaidTransactionLinkModel).filter(PlaidTransactionLinkModel.plaid_item_id == item.id).all()
        for link in links:
            self.db.delete(link)
        self.db.query(PlaidAccountLinkModel).filter(PlaidAccountLinkModel.plaid_item_id == item.id).delete()
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
                bank_name=item.institution_name,
                name=plaid_account.get("name") or plaid_account.get("official_name") or "Connected account",
                starting_balance=Decimal(str(current if current is not None else 0)),
                account_type=account_type,
            )
            self.db.add(account)
            self.db.flush()
            self.db.add(PlaidAccountLinkModel(plaid_item_id=item.id, plaid_account_id=plaid_id, account_id=account.id))

    def _upsert_transaction(self, item: PlaidItemModel, value: dict) -> bool:
        account_link = self.db.query(PlaidAccountLinkModel).filter(
            PlaidAccountLinkModel.plaid_item_id == item.id,
            PlaidAccountLinkModel.plaid_account_id == value.get("account_id"),
        ).first()
        if not account_link:
            return False
        plaid_id = value["transaction_id"]
        link = self.db.query(PlaidTransactionLinkModel).filter(
            PlaidTransactionLinkModel.plaid_transaction_id == plaid_id
        ).first()
        transaction = self.db.get(TransactionModel, link.transaction_id) if link else None
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
        transaction.category = CATEGORY_MAP.get(primary, "Other")
        transaction.transaction_date = date.fromisoformat(value.get("authorized_date") or value["date"])
        transaction.note = (value.get("merchant_name") or value.get("name") or "Plaid transaction")[:255]
        transaction.receipt_metadata = {"source": "plaid", "pending": bool(value.get("pending"))}
        if link is None:
            self.db.flush()
            self.db.add(PlaidTransactionLinkModel(
                plaid_item_id=item.id, plaid_transaction_id=plaid_id, transaction_id=transaction.id
            ))
        return True

    def _reconcile_balances(self, item: PlaidItemModel) -> None:
        result = self.client.post("/accounts/get", {"access_token": _decrypt_token(item.access_token)})
        for plaid_account in result.get("accounts", []):
            current = (plaid_account.get("balances") or {}).get("current")
            if current is None:
                continue
            link = self.db.query(PlaidAccountLinkModel).filter(
                PlaidAccountLinkModel.plaid_item_id == item.id,
                PlaidAccountLinkModel.plaid_account_id == plaid_account["account_id"],
            ).first()
            if not link:
                continue
            imported = (
                self.db.query(TransactionModel)
                .join(PlaidTransactionLinkModel, PlaidTransactionLinkModel.transaction_id == TransactionModel.id)
                .filter(
                    PlaidTransactionLinkModel.plaid_item_id == item.id,
                    TransactionModel.account_id == link.account_id,
                )
                .all()
            )
            movement = sum(
                (transaction.amount if transaction.transaction_type == "income" else -transaction.amount)
                for transaction in imported
            )
            account = self.db.get(AccountModel, link.account_id)
            if account:
                account.starting_balance = Decimal(str(current)) - movement

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
