from typing import Generic, TypeVar

from sqlalchemy.orm import Session

ModelT = TypeVar("ModelT")


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, db: Session):
        self.db = db

    def list(self) -> list[ModelT]:
        return list(self.query().all())

    def query(self):
        from app.repositories.models import AccountModel, TransactionModel, RecurringTransactionModel
        query = self.db.query(self.model)
        user_id = self.db.info.get("user_id")
        if user_id is not None:
            if self.model is AccountModel:
                query = query.filter(AccountModel.user_id == user_id)
            elif self.model in {TransactionModel, RecurringTransactionModel}:
                owned_ids = [account.id for account in self.db.query(AccountModel).filter(AccountModel.user_id == user_id)]
                query = query.filter(self.model.account_id.in_(owned_ids))
        return query

    def get(self, item_id: int) -> ModelT | None:
        return self.query().filter(self.model.id == item_id).first()

    def create(self, data: dict) -> ModelT:
        from app.repositories.models import AccountModel
        if hasattr(self.model, "user_id") and self.db.info.get("user_id") is not None:
            data = {**data, "user_id": self.db.info["user_id"]}
        item = self.model(**data)
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update(self, item: ModelT, data: dict) -> ModelT:
        for key, value in data.items():
            if value is not None:
                setattr(item, key, value)
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete(self, item: ModelT) -> None:
        self.db.delete(item)
        self.db.commit()

