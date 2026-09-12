from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal("0.01")


def money(value: Decimal | int | str) -> Decimal:
    amount = Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    return amount


def require_non_negative(value: Decimal | int | str, field_name: str = "amount") -> Decimal:
    amount = money(value)
    if amount < 0:
        raise ValueError(f"{field_name} cannot be negative")
    return amount

