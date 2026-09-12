from functools import lru_cache
from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Personal Finance Manager"
    database_url: str = "sqlite:///./finance_manager.db"
    jwt_secret_key: str = "change-this-development-secret"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 60 * 24


@lru_cache
def get_settings() -> Settings:
    return Settings()
