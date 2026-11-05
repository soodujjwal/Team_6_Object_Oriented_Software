from functools import lru_cache
import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv
from pydantic import BaseModel, Field


PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env", override=False)


class Settings(BaseModel):
    profile: str = "original"
    mongodb_uri: str = Field(default="", repr=False, exclude=True)
    mongodb_database: str = "finance_builder"
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
    profile = os.getenv("FINANCE_PROFILE", "original")
    if profile == "plaid-sandbox":
        return load_plaid_sandbox_settings(PROJECT_ROOT / ".env.plaid-sandbox")
    if profile != "original":
        raise ValueError("FINANCE_PROFILE must be original or plaid-sandbox.")
    return Settings(
        mongodb_uri=os.getenv("MONGODB_URI", "").strip(),
        mongodb_database=os.getenv("MONGODB_DATABASE", "finance_builder").strip() or "finance_builder",
        database_url=os.getenv("DATABASE_URL", "sqlite:///./finance_manager.db"),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", "change-this-development-secret"),
        plaid_client_id=os.getenv("PLAID_CLIENT_ID", ""),
        plaid_secret=os.getenv("PLAID_SECRET", ""),
        plaid_environment=os.getenv("PLAID_ENV", "sandbox").lower(),
        plaid_webhook_url=os.getenv("PLAID_WEBHOOK_URL", ""),
    )


def load_plaid_sandbox_settings(path: Path) -> Settings:
    """Load an isolated profile; never inherit production keys or database names."""
    if not path.is_file():
        raise ValueError("Create the project root .env.plaid-sandbox before starting the sandbox.")
    values = dotenv_values(path, interpolate=False)
    original = dotenv_values(PROJECT_ROOT / ".env", interpolate=False)
    database = (values.get("MONGODB_DATABASE") or "").strip()
    original_databases = {original.get("MONGODB_DATABASE") or "finance_builder",
                          os.getenv("MONGODB_DATABASE", "finance_builder")}
    if not database.endswith("_plaid_sandbox") or database in original_databases:
        raise ValueError("Sandbox database must end with _plaid_sandbox and differ from the original database.")
    if values.get("PLAID_ENV") != "sandbox":
        raise ValueError("The demo profile only permits PLAID_ENV=sandbox.")
    secret = values.get("JWT_SECRET_KEY") or ""
    if len(secret) < 32 or secret in {original.get("JWT_SECRET_KEY"), os.getenv("JWT_SECRET_KEY")}:
        raise ValueError("Sandbox JWT_SECRET_KEY must be unique and at least 32 characters long.")
    return Settings(
        profile="plaid-sandbox",
        app_name="Finance Builder — Plaid Sandbox",
        mongodb_uri=(values.get("MONGODB_URI") or "").strip(),
        mongodb_database=database,
        database_url="sqlite://",
        jwt_secret_key=secret,
        plaid_client_id=values.get("PLAID_CLIENT_ID") or "",
        plaid_secret=values.get("PLAID_SECRET") or "",
        plaid_environment="sandbox",
        plaid_webhook_url=values.get("PLAID_WEBHOOK_URL") or "",
    )
