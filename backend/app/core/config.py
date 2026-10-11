from functools import lru_cache
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel


PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env", override=False)


class Settings(BaseModel):
    app_name: str = "Personal Finance Manager"
    database_url: str = "sqlite:///./finance_manager.db"
    jwt_secret_key: str = "change-this-development-secret"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 60 * 24
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_environment: str = "sandbox"
    plaid_webhook_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite:///./finance_manager.db"),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", "change-this-development-secret"),
        plaid_client_id=os.getenv("PLAID_CLIENT_ID", ""),
        plaid_secret=os.getenv("PLAID_SECRET", ""),
        plaid_environment=os.getenv("PLAID_ENV", "sandbox").lower(),
        plaid_webhook_url=os.getenv("PLAID_WEBHOOK_URL", ""),
    )
