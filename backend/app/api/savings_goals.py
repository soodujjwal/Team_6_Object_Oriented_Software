from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.savings_goal_schema import SavingsGoalCreate, SavingsGoalRead, SavingsGoalUpdate
from app.services.savings_goal_service import SavingsGoalService

router = APIRouter(prefix="/savings-goals", tags=["savings goals"])


@router.get("", response_model=list[SavingsGoalRead])
def list_goals(db: Session = Depends(get_db)):
    return SavingsGoalService(db).list_goals()


@router.post("", response_model=SavingsGoalRead, status_code=status.HTTP_201_CREATED)
def create_goal(payload: SavingsGoalCreate, db: Session = Depends(get_db)):
    return SavingsGoalService(db).create_goal(payload)


@router.get("/{goal_id}", response_model=SavingsGoalRead)
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    return SavingsGoalService(db).get_goal(goal_id)


@router.patch("/{goal_id}", response_model=SavingsGoalRead)
def update_goal(goal_id: int, payload: SavingsGoalUpdate, db: Session = Depends(get_db)):
    return SavingsGoalService(db).update_goal(goal_id, payload)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    SavingsGoalService(db).delete_goal(goal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

