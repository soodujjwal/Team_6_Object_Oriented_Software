import base64
import hashlib
import hmac
import json
import os
import secrets
from functools import lru_cache
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerificationError, InvalidHashError
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.repositories.user_repository import UserRepository
from app.core.password_work import password_work

bearer_scheme = HTTPBearer()
_password_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1,
    hash_len=32, salt_len=16, type=Type.ID)


def hash_password(password: str, salt: str | None = None) -> str:
    if salt is not None:
        raise ValueError("Caller-supplied salts are not used for new password hashes.")
    with password_work():
        return _password_hasher.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    if not isinstance(stored_hash, str):
        return False
    with password_work():
        try:
            if stored_hash.startswith("$argon2"):
                return _password_hasher.verify(stored_hash, password)
            # Exact compatibility with the previous 120,000-round PBKDF2 format.
            salt, encoded = stored_hash.split("$", 1)
            if not 1 <= len(salt) <= 128 or len(encoded) != 44:
                return False
            derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
            return hmac.compare_digest(base64.urlsafe_b64encode(derived).decode("ascii"), encoded)
        except (VerificationError, InvalidHashError, ValueError, TypeError):
            return False


def password_needs_rehash(stored_hash: str) -> bool:
    return not stored_hash.startswith("$argon2id$") or _password_hasher.check_needs_rehash(stored_hash)


@lru_cache(maxsize=1)
def dummy_password_hash() -> str:
    return hash_password(secrets.token_urlsafe(32))


def create_access_token(subject: str, session_version: int = 0) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiration_minutes)
    header = {"alg": settings.jwt_algorithm, "typ": "JWT"}
    payload = {"sub": subject, "exp": int(expires_at.timestamp()), "sv": session_version}
    signing_input = ".".join([_encode_json(header), _encode_json(payload)])
    signature = _sign(signing_input)
    return f"{signing_input}.{signature}"


def decode_access_token(token: str) -> dict:
    try:
        header_part, payload_part, signature = token.split(".")
        header = json.loads(_base64url_decode(header_part))
        if header.get("alg") != "HS256" or get_settings().jwt_algorithm != "HS256":
            raise ValueError("unsupported algorithm")
        signing_input = f"{header_part}.{payload_part}"
        expected_signature = _sign(signing_input)
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("invalid signature")
        payload = json.loads(_base64url_decode(payload_part))
        if int(payload["exp"]) <= int(datetime.now(timezone.utc).timestamp()) or not isinstance(payload.get("sub"), str):
            raise ValueError("token expired")
        return payload
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
        ) from error


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    payload = decode_access_token(credentials.credentials)
    email = payload.get("sub")
    user = UserRepository(db).get_by_email(email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired session")
    # Missing fields on historical documents/tokens mean version zero. A real
    # password change increments the user's version and revokes every old token.
    if payload.get("sv", 0) != (user.session_version or 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired session")
    db.info["user_id"] = user.id
    return user


def _encode_json(value: dict) -> str:
    data = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _base64url_encode(data)


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("utf-8")


def _base64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def _sign(value: str) -> str:
    settings = get_settings()
    if len(settings.jwt_secret_key.encode("utf-8")) < 32:
        raise HTTPException(503, "Authentication is not configured.")
    signature = hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _base64url_encode(signature)
