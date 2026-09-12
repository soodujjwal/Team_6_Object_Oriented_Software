from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.recurring_transaction_schema import (
    RecurringTransactionCreate,
    RecurringTransactionRead,
    RecurringTransactionUpdate,
)
from app.services.recurring_transaction_service import RecurringTransactionService

router = APIRouter(prefix="/recurring-transactions", tags=["recurring transactions"])


@router.get("", response_model=list[RecurringTransactionRead])
def list_recurring_transactions(db: Session = Depends(get_db)):
    return RecurringTransactionService(db).list_recurring_transactions()


@router.post("", response_model=RecurringTransactionRead, status_code=status.HTTP_201_CREATED)
def create_recurring_transaction(payload: RecurringTransactionCreate, db: Session = Depends(get_db)):
    return RecurringTransactionService(db).create_recurring_transaction(payload)


@router.get("/{recurring_id}", response_model=RecurringTransactionRead)
def get_recurring_transaction(recurring_id: int, db: Session = Depends(get_db)):
    return RecurringTransactionService(db).get_recurring_transaction(recurring_id)


@router.patch("/{recurring_id}", response_model=RecurringTransactionRead)
def update_recurring_transaction(
    recurring_id: int,
    payload: RecurringTransactionUpdate,
    db: Session = Depends(get_db),
):
    return RecurringTransactionService(db).update_recurring_transaction(recurring_id, payload)


@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_transaction(recurring_id: int, db: Session = Depends(get_db)):
    RecurringTransactionService(db).delete_recurring_transaction(recurring_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

