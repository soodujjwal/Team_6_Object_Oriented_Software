"""One account-wide source of bank records, persisted in existing user state."""
from fastapi import HTTPException
from sqlalchemy import update

from app.repositories.models import AccountModel, PlaidAccountLinkModel, PlaidItemModel, UserModel, UserStateModel


class TrackingModeService:
    KEY = "bank_tracking_mode"

    def __init__(self, db):
        self.db = db
        self.user_id = db.info.get("user_id")
        if self.user_id is None:
            raise HTTPException(401, "Sign in to choose a tracking method.")

    def read(self):
        accounts = self.db.query(AccountModel).filter_by(user_id=self.user_id).all()
        ids = [account.id for account in accounts]
        linked = {link.account_id for link in self.db.query(PlaidAccountLinkModel).filter(PlaidAccountLinkModel.account_id.in_(ids))}
        connected = sum(account.id in linked or account.bank_current_balance is not None for account in accounts)
        manual = len(accounts) - connected
        has_connection = self.db.query(PlaidItemModel).filter_by(user_id=self.user_id).first() is not None
        row = self.db.query(UserStateModel).filter_by(user_id=self.user_id, key=self.KEY).first()
        mode = "mixed" if manual and (connected or has_connection) else "plaid" if connected or has_connection else "manual" if manual else row.value if row else None
        return {"mode": mode, "manual_accounts": manual, "connected_accounts": connected,
                "can_switch": not accounts and not has_connection}

    def _lock(self):
        # Serialize mode selection and financial writes across requests/devices.
        # MongoSession translates this existing record-lock pattern to a revision write.
        self.db.execute(update(UserModel).where(UserModel.id == self.user_id).values(id=UserModel.id))

    def _store(self, mode):
        row = self.db.query(UserStateModel).filter_by(user_id=self.user_id, key=self.KEY).first()
        if row is None:
            self.db.add(UserStateModel(user_id=self.user_id, key=self.KEY, value=mode))
        else:
            row.value = mode

    def choose(self, mode):
        self._lock()
        state = self.read()
        if mode == "manual" and (state["connected_accounts"] or self.db.query(PlaidItemModel).filter_by(user_id=self.user_id).first()):
            raise HTTPException(409, "Disconnect your Plaid banks before choosing manual tracking. No records were changed.")
        if mode == "plaid" and state["manual_accounts"]:
            raise HTTPException(409, "This account has manual bank accounts. Resolve them before choosing Plaid syncing. No records were changed.")
        self._store(mode)
        self.db.commit()
        return self.read()

    def require(self, mode):
        self._lock()
        state = self.read()
        if state["mode"] not in (None, mode):
            raise HTTPException(409, "Use one tracking method for your entire account. Choose manual tracking or Plaid syncing in Account Settings before adding records.")
        self._store(mode)
