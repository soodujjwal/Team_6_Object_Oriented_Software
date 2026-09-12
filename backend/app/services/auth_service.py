from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import AuthResponse, LoginRequest, RegisterRequest, UserRead


class AuthService:
    def __init__(self, db: Session):
        self.users = UserRepository(db)

    def register(self, payload: RegisterRequest) -> AuthResponse:
        email = payload.email.lower()
        if self.users.get_by_email(email) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
        user = self.users.create(
            {
                "name": payload.name.strip(),
                "email": email,
                "phone_number": payload.phone_number,
                "password_hash": hash_password(payload.password),
            }
        )
        return self._auth_response(user)

    def login(self, payload: LoginRequest) -> AuthResponse:
        user = self.users.get_by_email(payload.email.lower())
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid email or password")
        return self._auth_response(user)

    def _auth_response(self, user) -> AuthResponse:
        return AuthResponse(
            access_token=create_access_token(user.email),
            user=UserRead.model_validate(user),
        )
