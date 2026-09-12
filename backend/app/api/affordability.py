from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.affordability_schema import AffordabilityRead, AffordabilityRequest
from app.services.affordability_service import AffordabilityService

router = APIRouter(prefix="/affordability", tags=["affordability"])


@router.post("/check", response_model=AffordabilityRead)
def check_affordability(payload: AffordabilityRequest, db: Session = Depends(get_db)):
    return AffordabilityService(db).check_purchase(payload.purchase_amount)

