from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def money_field():
    return Field(ge=Decimal("0"), max_digits=12, decimal_places=2)
