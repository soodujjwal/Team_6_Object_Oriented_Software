from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

EmailField = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = EmailField
    phone_number: str = Field(min_length=14, max_length=14, pattern=r"^\(\d{3}\) \d{3}-\d{4}$")
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = EmailField
    password: str = Field(min_length=1, max_length=128)


class UserRead(ORMModel):
    id: int
    name: str
    email: str
    phone_number: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
