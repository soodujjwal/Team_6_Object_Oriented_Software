from fastapi import APIRouter, Depends, Response, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.auth_schema import AuthResponse, LoginRequest, PasswordChangeRequest, ProfileUpdateRequest, RegisterRequest, UserRead
from app.services.auth_service import AuthService

class PrivateAuthRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def private_handler(request: Request):
            try:
                return await handler(request)
            except RequestValidationError as error:
                # FastAPI's default includes rejected input values, including
                # plaintext passwords or the entire request body. Never echo it.
                return JSONResponse(status_code=422, content={"detail": [
                    {"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]}
                    for item in error.errors()]})
        return private_handler


router = APIRouter(prefix="/auth", tags=["auth"], route_class=PrivateAuthRoute)


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    return AuthService(db).register(payload, request.client.host if request.client else "unknown")


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    return AuthService(db).login(payload, request.client.host if request.client else "unknown")


@router.get("/me", response_model=UserRead)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=AuthResponse)
def update_profile(payload: ProfileUpdateRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return AuthService(db).update_profile(current_user, payload)


@router.patch("/me/password", response_model=UserRead)
def change_password(payload: PasswordChangeRequest, request: Request, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return AuthService(db).change_password(current_user, payload, request.client.host if request.client else "unknown")


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    AuthService(db).delete_account(current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
