from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.repositories.models import AccountModel, UserStateModel

router = APIRouter(prefix="/auth/state", tags=["account state"])
StateKey = Literal["budget_preferences", "import_history", "completed_goal_months", "onboarding_draft",
                   "onboarding_step", "onboarding_complete", "financial_goals"]


class StateUpdate(BaseModel):
    value: str | None = Field(max_length=262144)


@router.get("")
def read_state(user=Depends(get_current_user), db: Session = Depends(get_db)):
    values = {row.key: row.value for row in db.query(UserStateModel).filter_by(user_id=user.id)}
    # Existing accounts predate database-backed onboarding completion.
    if "onboarding_complete" not in values and db.query(AccountModel).filter_by(user_id=user.id).first():
        values["onboarding_complete"] = "true"
    return values


@router.patch("/{key}")
def save_state(key: StateKey, payload: StateUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(UserStateModel).filter_by(user_id=user.id, key=key).first()
    if row is None:
        row = UserStateModel(user_id=user.id, key=key, value=payload.value)
        db.add(row)
    else:
        row.value = payload.value
    db.commit()
    return {"value": row.value}
