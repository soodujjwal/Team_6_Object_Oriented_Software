from pathlib import Path

import pytest
from app.core import config
from app.core.security import create_access_token, decode_access_token
from app.services.plaid_service import PlaidClient
from fastapi import HTTPException


@pytest.fixture
def profiles(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROJECT_ROOT", tmp_path)
    monkeypatch.setenv("MONGODB_DATABASE", "original_data")
    monkeypatch.setenv("JWT_SECRET_KEY", "original-jwt-secret-for-tests-only-12345")
    monkeypatch.setenv("PLAID_ENV", "production")
    monkeypatch.setenv("PLAID_SECRET", "production-secret")
    (tmp_path / ".env").write_text(
        "MONGODB_DATABASE=original_data\nJWT_SECRET_KEY=original-jwt-secret-for-tests-only-12345\n", encoding="utf-8"
    )
    path = tmp_path / ".env.plaid-sandbox"
    values = {
        "MONGODB_URI": "mongodb://sandbox-test-only",
        "MONGODB_DATABASE": "demo_plaid_sandbox",
        "JWT_SECRET_KEY": "sandbox-jwt-secret-" + "x" * 32,
        "PLAID_CLIENT_ID": "sandbox-client",
        "PLAID_SECRET": "sandbox-secret",
        "PLAID_ENV": "sandbox",
    }

    def write(**updates):
        data = {**values, **updates}
        path.write_text("\n".join(f"{key}={value}" for key, value in data.items()), encoding="utf-8")

    write()
    config.get_settings.cache_clear()
    yield path, write
    config.get_settings.cache_clear()


def test_sandbox_ignores_inherited_production_values(profiles, monkeypatch):
    monkeypatch.setenv("FINANCE_PROFILE", "plaid-sandbox")
    settings = config.get_settings()
    assert settings.mongodb_database == "demo_plaid_sandbox"
    assert settings.mongodb_uri == "mongodb://sandbox-test-only"
    assert settings.plaid_secret == "sandbox-secret"
    assert PlaidClient().base_url == "https://sandbox.plaid.com"
    assert settings.database_url == "sqlite://"
    assert settings.plaid_webhook_url == ""


@pytest.mark.parametrize("updates", [
    {"MONGODB_DATABASE": "original_data"},
    {"MONGODB_DATABASE": "finance_builder"},
    {"PLAID_ENV": "production"},
    {"JWT_SECRET_KEY": "original-jwt-secret-for-tests-only-12345"},
])
def test_unsafe_sandbox_configuration_is_rejected(profiles, updates):
    path, write = profiles
    write(**updates)
    with pytest.raises(ValueError):
        config.load_plaid_sandbox_settings(path)


def test_missing_sandbox_file_does_not_fall_back_to_original(profiles):
    with pytest.raises(ValueError, match="Create the project root"):
        config.load_plaid_sandbox_settings(Path("missing-sandbox-config"))


def test_missing_sandbox_plaid_key_does_not_inherit_production_key(profiles, monkeypatch):
    _, write = profiles
    write(PLAID_SECRET="")
    monkeypatch.setenv("FINANCE_PROFILE", "plaid-sandbox")
    assert not PlaidClient().configured


def test_sandbox_database_cannot_match_original_even_with_valid_suffix(profiles, monkeypatch):
    path, _ = profiles
    monkeypatch.setenv("MONGODB_DATABASE", "demo_plaid_sandbox")
    with pytest.raises(ValueError, match="differ from the original"):
        config.load_plaid_sandbox_settings(path)


def test_profiles_keep_records_separate_on_the_same_cluster(profiles, monkeypatch):
    import mongomock
    from app.core import database

    client = mongomock.MongoClient()
    monkeypatch.setattr(database, "get_mongo_client", lambda: client)
    monkeypatch.setenv("FINANCE_PROFILE", "original")
    database.get_mongo_database().accounts.insert_one({"_id": 1, "name": "Original bank"})
    monkeypatch.setenv("FINANCE_PROFILE", "plaid-sandbox")
    config.get_settings.cache_clear()
    demo = database.get_mongo_database()
    assert demo.accounts.count_documents({}) == 0
    demo.accounts.insert_one({"_id": 1, "name": "Test bank"})
    demo.accounts.delete_many({})
    assert client.original_data.accounts.find_one({"_id": 1})["name"] == "Original bank"


def test_sandbox_and_original_sessions_cannot_be_interchanged(profiles, monkeypatch):
    monkeypatch.setenv("FINANCE_PROFILE", "original")
    original_token = create_access_token("same@example.test")
    monkeypatch.setenv("FINANCE_PROFILE", "plaid-sandbox")
    config.get_settings.cache_clear()
    sandbox_token = create_access_token("same@example.test")
    with pytest.raises(HTTPException):
        decode_access_token(original_token)
    monkeypatch.setenv("FINANCE_PROFILE", "original")
    config.get_settings.cache_clear()
    with pytest.raises(HTTPException):
        decode_access_token(sandbox_token)


def test_original_profile_keeps_existing_environment(profiles, monkeypatch):
    monkeypatch.setenv("FINANCE_PROFILE", "original")
    settings = config.get_settings()
    assert settings.mongodb_database == "original_data"
    assert settings.plaid_environment == "production"
    assert settings.plaid_secret == "production-secret"
