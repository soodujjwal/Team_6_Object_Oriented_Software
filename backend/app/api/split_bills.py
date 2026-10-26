from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.repositories.models import FriendModel
from app.schemas.split_bill_schema import FriendCreate, FriendRead, RepaymentUpdate, SplitBillDraft, PaymentLink, RepaymentCreate
from app.services.split_bill_service import SplitBillService

router = APIRouter(prefix="/split-bills", tags=["split bills"])


def service(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return SplitBillService(db, user.id)


@router.get("/friends", response_model=list[FriendRead])
def friends(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(FriendModel).filter_by(user_id=user.id).order_by(FriendModel.name).all()


@router.post("/friends", response_model=FriendRead, status_code=201)
def add_friend(payload: FriendCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Enter your friend's name.")
    existing = db.query(FriendModel).filter_by(user_id=user.id, name=name).first()
    if existing:
        return existing
    friend = FriendModel(user_id=user.id, name=name)
    db.add(friend)
    db.commit()
    db.refresh(friend)
    return friend


@router.get("")
def list_bills(svc=Depends(service)):
    return svc.list()


@router.post("", status_code=201)
def create_bill(payload: SplitBillDraft, svc=Depends(service)):
    return svc.save(payload)


@router.put("/{bill_id}")
def update_bill(bill_id: int, payload: SplitBillDraft, svc=Depends(service)):
    return svc.save(payload, bill_id)


@router.post("/{bill_id}/pay")
def pay_bill(bill_id: int, payload: PaymentLink | None = None, svc=Depends(service)):
    return svc.pay(bill_id, payload.transaction_id if payload else None)


@router.get("/{bill_id}/candidates")
def candidates(bill_id: int, person_id: str | None = None, svc=Depends(service)):
    return svc.candidates(bill_id, person_id)


@router.delete("/{bill_id}/payment")
def unlink_payment(bill_id: int, svc=Depends(service)):
    return svc.unlink_payment(bill_id)


@router.post("/{bill_id}/repayments/{person_id}")
def add_repayment(bill_id: int, person_id: str, payload: RepaymentCreate, svc=Depends(service)):
    return svc.add_repayment(bill_id, person_id, payload)


@router.delete("/{bill_id}/repayments/{person_id}/{payment_id}")
def remove_repayment(bill_id: int, person_id: str, payment_id: str, svc=Depends(service)):
    return svc.remove_repayment(bill_id, person_id, payment_id)


@router.put("/{bill_id}/repayments/{person_id}")
def repay(bill_id: int, person_id: str, payload: RepaymentUpdate, svc=Depends(service)):
    return svc.repay(bill_id, person_id, payload)
