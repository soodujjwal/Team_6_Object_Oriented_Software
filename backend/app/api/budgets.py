from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.budget_schema import BudgetCreate, BudgetRead, BudgetUpdate
from app.schemas.notification_schema import NotificationRead
from app.services.alert_service import AlertService
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetRead])
def list_budgets(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return BudgetService(db, user.id).list_budgets()


@router.post("", response_model=BudgetRead, status_code=status.HTTP_201_CREATED)
def create_budget(payload: BudgetCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return BudgetService(db, user.id).create_budget(payload)


@router.get("/alerts", response_model=list[NotificationRead])
def budget_alerts(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return AlertService().budget_alerts(BudgetService(db, user.id).list_budgets())


@router.get("/{budget_id}", response_model=BudgetRead)
def get_budget(budget_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return BudgetService(db, user.id).get_budget(budget_id)


@router.patch("/{budget_id}", response_model=BudgetRead)
def update_budget(budget_id: int, payload: BudgetUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return BudgetService(db, user.id).update_budget(budget_id, payload)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    BudgetService(db, user.id).delete_budget(budget_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
