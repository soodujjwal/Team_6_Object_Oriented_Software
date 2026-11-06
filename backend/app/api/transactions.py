from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.schemas.transaction_schema import TransactionBulkCreate, TransactionCreate, TransactionRead, TransactionUpdate
from app.services.transaction_service import TransactionService
from app.services.tracking_mode_service import TrackingModeService

router = APIRouter(prefix="/transactions", tags=["transactions"])


class MatchRequest(BaseModel):
    bank_transaction_id: int = Field(gt=0)


@router.get("/matches")
def match_suggestions(db: Session = Depends(get_db)):
    from app.services.transaction_matching import suggestions
    return suggestions(db)


@router.post("/{transaction_id}/match", response_model=TransactionRead)
def match_transaction(transaction_id: int, payload: MatchRequest, db: Session = Depends(get_db)):
    from app.services.transaction_matching import merge
    return merge(db, transaction_id, payload.bank_transaction_id)


@router.get("", response_model=list[TransactionRead])
def list_transactions(db: Session = Depends(get_db)):
    return TransactionService(db).list_transactions()


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    TrackingModeService(db).require("manual")
    return TransactionService(db).create_transaction(payload)


@router.post("/bulk", response_model=list[TransactionRead], status_code=status.HTTP_201_CREATED)
def create_transactions(payload: TransactionBulkCreate, db: Session = Depends(get_db)):
    TrackingModeService(db).require("manual")
    return TransactionService(db).create_transactions(payload.transactions)


@router.get("/{transaction_id}", response_model=TransactionRead)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    return TransactionService(db).get_transaction(transaction_id)


@router.patch("/{transaction_id}", response_model=TransactionRead)
def update_transaction(transaction_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)):
    return TransactionService(db).update_transaction(transaction_id, payload)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    TransactionService(db).delete_transaction(transaction_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
