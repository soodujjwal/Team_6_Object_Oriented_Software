from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session
from typing import Literal
from pydantic import BaseModel

from app.core.database import get_db
from app.schemas.account_schema import AccountCreate, AccountRead, AccountUpdate
from app.services.account_service import AccountService
from app.services.tracking_mode_service import TrackingModeService

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountRead])
def list_accounts(db: Session = Depends(get_db)):
    return AccountService(db).list_accounts()


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    TrackingModeService(db).require("manual")
    return AccountService(db).create_account(payload)


class TrackingModeChoice(BaseModel):
    mode: Literal["manual", "plaid"]


@router.get("/tracking-mode")
def tracking_mode(db: Session = Depends(get_db)):
    return TrackingModeService(db).read()


@router.patch("/tracking-mode")
def choose_tracking_mode(payload: TrackingModeChoice, db: Session = Depends(get_db)):
    return TrackingModeService(db).choose(payload.mode)


@router.get("/{account_id}", response_model=AccountRead)
def get_account(account_id: int, db: Session = Depends(get_db)):
    return AccountService(db).get_account(account_id)


@router.patch("/{account_id}", response_model=AccountRead)
def update_account(account_id: int, payload: AccountUpdate, db: Session = Depends(get_db)):
    return AccountService(db).update_account(account_id, payload)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    AccountService(db).delete_account(account_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

