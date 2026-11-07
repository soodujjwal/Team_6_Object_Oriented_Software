from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import update
from app.repositories.models import UserModel

from app.core.security import create_access_token, hash_password, verify_password, password_needs_rehash, dummy_password_hash
from app.services.password_policy import validate_new_password
from app.services.auth_throttle import get_auth_limiter
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import AuthResponse, LoginRequest, PasswordChangeRequest, ProfileUpdateRequest, RegisterRequest, UserRead


class AuthService:
    def __init__(self, db: Session):
        self.users = UserRepository(db)

    def register(self, payload: RegisterRequest, client_ip: str = "unknown") -> AuthResponse:
        email = payload.email.strip().lower()
        get_auth_limiter(self.users.db).registration(email, client_ip)
        validate_new_password(payload.password, name=payload.name, email=email, phone=payload.phone_number,
            confirmation=payload.confirm_password)
        if self.users.get_by_email(email) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
        user = self.users.create(
            {
                "name": payload.name.strip(),
                "email": email,
                "phone_number": payload.phone_number,
                "occupation": "",
                "password_hash": hash_password(payload.password),
            }
        )
        return self._auth_response(user)

    def login(self, payload: LoginRequest, client_ip: str = "unknown") -> AuthResponse:
        email = payload.email.strip().lower()
        limiter = get_auth_limiter(self.users.db)
        limiter.login(email, client_ip)
        user = self.users.get_by_email(email)
        valid = verify_password(payload.password, user.password_hash if user else dummy_password_hash())
        if user is None or not valid:
            limiter.failed_login(email)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid email or password")
        # Serialize rehashing with password changes. MongoSession turns this
        # existing row-lock pattern into an atomic revision write conflict.
        previous_hash = user.password_hash
        self.users.db.execute(update(UserModel).where(UserModel.id == user.id).values(id=UserModel.id))
        self.users.db.refresh(user)
        if user.password_hash != previous_hash and not verify_password(payload.password, user.password_hash):
            limiter.failed_login(email)
            raise HTTPException(401, "invalid email or password")
        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(payload.password)
        self.users.db.commit()
        limiter.successful_login(email)
        return self._auth_response(user)

    def update_profile(self, user, payload: ProfileUpdateRequest) -> AuthResponse:
        email = payload.email.lower()
        existing = self.users.get_by_email(email)
        if existing is not None and existing.id != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
        updated = self.users.update(
            user,
            {
                "name": payload.name.strip(),
                "email": email,
                "occupation": payload.occupation.strip(),
            },
        )
        return self._auth_response(updated)

    def change_password(self, user, payload: PasswordChangeRequest, client_ip: str = "unknown") -> UserRead:
        get_auth_limiter(self.users.db).password_change(user.id, client_ip)
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "current password is incorrect")
        validate_new_password(payload.new_password, name=user.name, email=user.email, phone=user.phone_number,
            confirmation=payload.confirm_password)
        if payload.new_password == payload.current_password:
            raise HTTPException(400, "Choose a password different from your current password.")
        password_hash = hash_password(payload.new_password)
        old_hash = user.password_hash
        self.users.db.execute(update(UserModel).where(UserModel.id == user.id).values(id=UserModel.id))
        self.users.db.refresh(user)
        if user.password_hash != old_hash:
            raise HTTPException(409, "Your account changed. Please sign in again before changing your password.")
        # Commit revocation and the new hash in the same unit of work.
        updated = self.users.update(user, {"password_hash": password_hash, "session_version": (user.session_version or 0) + 1})
        return UserRead.model_validate(updated)

    def delete_account(self, user) -> None:
        from app.repositories.models import UserStateModel
        self.users.db.query(UserStateModel).filter_by(user_id=user.id).delete()
        self.users.delete(user)

    def _auth_response(self, user) -> AuthResponse:
        return AuthResponse(
            access_token=create_access_token(user.email, user.session_version or 0),
            user=UserRead.model_validate(user),
        )
