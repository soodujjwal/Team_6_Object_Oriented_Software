from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.auth_schema import AuthResponse, LoginRequest, PasswordChangeRequest, ProfileUpdateRequest, RegisterRequest, UserRead
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    return AuthService(db).register(payload)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    return AuthService(db).login(payload)


@router.get("/me", response_model=UserRead)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=AuthResponse)
def update_profile(payload: ProfileUpdateRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return AuthService(db).update_profile(current_user, payload)


@router.patch("/me/password", response_model=UserRead)
def change_password(payload: PasswordChangeRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return AuthService(db).change_password(current_user, payload)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    AuthService(db).delete_account(current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
