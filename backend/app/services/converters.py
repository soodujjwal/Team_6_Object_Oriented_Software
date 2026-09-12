from app.domain.transaction import Transaction, TransactionType
from app.repositories.models import TransactionModel


def to_domain_transaction(transaction: TransactionModel) -> Transaction:
    return Transaction(
        account_id=transaction.account_id,
        amount=transaction.amount,
        category=transaction.category,
        transaction_type=TransactionType(transaction.transaction_type),
        transaction_date=transaction.transaction_date,
        note=transaction.note,
    )

