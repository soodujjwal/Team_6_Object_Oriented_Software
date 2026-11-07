import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.repositories.models import FriendModel, UserStateModel
from app.schemas.split_bill_schema import FriendCreate, FriendRead, MarkSplitPaid, SplitBillDraft
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


class FriendGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    friend_ids: list[int] = Field(min_length=1, max_length=49)


GROUP_PREFIX = "split_group_"


@router.get("/groups")
def friend_groups(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = db.query(UserStateModel).filter_by(user_id=user.id).all()
    groups = [{"id": row.key[len(GROUP_PREFIX):], **json.loads(row.value)}
              for row in rows if row.key.startswith(GROUP_PREFIX) and row.value]
    return sorted(groups, key=lambda group: (group["name"].casefold(), group["id"]))


@router.post("/groups", status_code=201)
def save_friend_group(payload: FriendGroupCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    name = payload.name.strip()
    if not name or len(set(payload.friend_ids)) != len(payload.friend_ids):
        raise HTTPException(400, "Enter a group name and select distinct saved friends.")
    owned = {friend.id for friend in db.query(FriendModel).filter_by(user_id=user.id).all()}
    if not set(payload.friend_ids).issubset(owned):
        raise HTTPException(400, "Choose friends saved to your own account.")
    group_id = str(uuid4())
    group = {"name": name, "friend_ids": payload.friend_ids}
    db.add(UserStateModel(user_id=user.id, key=f"{GROUP_PREFIX}{group_id}", value=json.dumps(group)))
    db.commit()
    return {"id": group_id, **group}


@router.get("")
def list_bills(svc=Depends(service)):
    return svc.list()


@router.post("", status_code=201)
def create_bill(payload: SplitBillDraft, svc=Depends(service)):
    return svc.save(payload)


@router.put("/{bill_id}")
def update_bill(bill_id: int, payload: SplitBillDraft, svc=Depends(service)):
    return svc.save(payload, bill_id)


@router.delete("/{bill_id}", status_code=204)
def delete_bill(bill_id: int, svc=Depends(service)):
    svc.delete(bill_id)


@router.get("/{bill_id}/repayment-options/{person_id}")
def repayment_options(bill_id: int, person_id: str, svc=Depends(service)):
    return svc.repayment_options(bill_id, person_id)


@router.post("/{bill_id}/mark-paid/{person_id}")
def mark_paid(bill_id: int, person_id: str, payload: MarkSplitPaid, svc=Depends(service)):
    return svc.mark_paid(bill_id, person_id, payload)
