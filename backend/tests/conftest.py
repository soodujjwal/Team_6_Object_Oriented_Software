"""Independent test-only security dependencies; never use live breach APIs/keys."""
import mongomock
import pytest
from app.core.config import get_settings
from app.services.auth_throttle import MongoAuthLimiter


@pytest.fixture(autouse=True)
def isolated_security_dependencies(monkeypatch):
    secret = "finance-builder-tests-only-security-key-not-for-deployment"
    monkeypatch.setattr(get_settings(), "jwt_secret_key", secret)
    limiter = MongoAuthLimiter(mongomock.MongoClient().auth_security_test, secret)
    # Existing SQLite regression fixtures deliberately exercise the SQL test
    # adapter. Production never falls back to an in-process rate limiter.
    monkeypatch.setattr("app.services.auth_service.get_auth_limiter", lambda db: limiter)
    monkeypatch.setattr("app.services.password_policy.check_breached_password", lambda password: None)
