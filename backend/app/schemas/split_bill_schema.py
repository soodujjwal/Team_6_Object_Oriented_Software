from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import ORMModel


class Person(ORMModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)


class BillItem(ORMModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)
    quantity: int = Field(ge=1, le=1000)
    price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    people: list[str] = Field(max_length=50)


class SplitBillDraft(ORMModel):
    title: str = Field(min_length=1, max_length=150)
    people: list[Person] = Field(min_length=1, max_length=50)
    self_id: str
    items: list[BillItem] = Field(min_length=1, max_length=200)
    tax: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    tip: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    receipt_total: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    tip_method: Literal["bank", "cash"] = "bank"
    account_id: int | None = Field(default=None, gt=0)
    category: str = Field(default="Food & Dining", min_length=1, max_length=80)
    bill_date: date

    @model_validator(mode="after")
    def validate_assignments(self):
        ids = [person.id for person in self.people]
        if len(set(ids)) != len(ids) or self.self_id not in ids:
            raise ValueError("People must have unique IDs and include you.")
        if any(not person.name.strip() for person in self.people):
            raise ValueError("Each person needs a name.")
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("Items must have unique IDs.")
        for item in self.items:
            if len(set(item.people)) != len(item.people) or not set(item.people).issubset(ids):
                raise ValueError("Item assignments must reference distinct people on this bill.")
        return self


class RepaymentUpdate(ORMModel):
    received: bool
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)


class FriendCreate(ORMModel):
    name: str = Field(min_length=1, max_length=100)


class FriendRead(FriendCreate):
    id: int
