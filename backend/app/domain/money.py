"""Decimal currency rules shared by transactions and purchase checks."""
from decimal import Decimal, InvalidOperation

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("1000000")


def money(value: Decimal | int | str) -> Decimal:
    # Never silently round user input: half a cent is not a supported amount.
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or abs(amount) > Decimal("1000000000"):
            raise ValueError("Amount is outside the supported range.")
        rounded = amount.quantize(CENT)
        if amount != rounded:
            raise ValueError("Use at most two decimal places.")
        return rounded
    except (InvalidOperation, TypeError) as exc:
        raise ValueError("Enter a valid dollar amount.") from exc


def positive_amount(value: Decimal | int | str) -> Decimal:
    amount = money(value)
    if not 0 < amount <= MAX_AMOUNT:
        raise ValueError("Amount must be between $0.01 and $1,000,000.00.")
    return amount
