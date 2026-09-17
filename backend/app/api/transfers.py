from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.models import TransferModel
from app.schemas.transfer_schema import TransferCreate, TransferRead
from app.services.transfer_service import TransferService

router = APIRouter(prefix="/transfers", tags=["transfers"])


@router.post("", response_model=TransferRead, status_code=status.HTTP_201_CREATED)
def create_transfer(payload: TransferCreate, db: Session = Depends(get_db)):
    return TransferService(db).create(payload)


@router.get("", response_model=list[TransferRead])
def list_transfers(db: Session = Depends(get_db)):
    return db.query(TransferModel).order_by(TransferModel.id.desc()).all()
