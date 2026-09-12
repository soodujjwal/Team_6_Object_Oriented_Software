from decimal import Decimal

from app.schemas.common import ORMModel, money_field


class AffordabilityRequest(ORMModel):
    purchase_amount: Decimal = money_field()


class AffordabilityRead(ORMModel):
    purchase_amount: Decimal
    current_available: Decimal
    upcoming_required: Decimal
    savings_remaining: Decimal
    projected_remaining: Decimal
    can_afford: bool
    message: str
