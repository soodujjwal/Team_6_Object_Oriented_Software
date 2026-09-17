from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.repositories.models import AccountModel, TransferModel
from app.schemas.transfer_schema import TransferCreate, TransferRead
from app.services.account_service import AccountService


class TransferService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, payload: TransferCreate) -> TransferRead:
        try:
            if payload.from_account_id == payload.to_account_id:
                raise HTTPException(400, "Choose two different accounts.")
            # Acquire a database write lock before reading balances. This serializes
            # competing transfers in SQLite and locks the account rows on other DBs.
            self.db.execute(update(AccountModel).where(AccountModel.id.in_(
                [payload.from_account_id, payload.to_account_id]
            )).values(starting_balance=AccountModel.starting_balance))
            self.db.expire_all()
            accounts = AccountService(self.db)
            source = accounts.get_account(payload.from_account_id)
            destination = accounts.get_account(payload.to_account_id)
            if source.account_type != "savings" or destination.account_type != "checking":
                raise HTTPException(400, "Funds can only move from Savings to Checking.")
            if payload.amount > source.current_balance:
                raise HTTPException(400, "Amount exceeds the available Savings balance.")
            transfer = TransferModel(**payload.model_dump())
            self.db.add(transfer)
            self.db.flush()
            result = TransferRead.model_validate(transfer)
            self.db.commit()
            return result
        except Exception:
            self.db.rollback()
            raise
