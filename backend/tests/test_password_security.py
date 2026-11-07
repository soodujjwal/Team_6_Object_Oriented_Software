import base64
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
from concurrent.futures import ThreadPoolExecutor

import httpx
import mongomock
import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.api import auth, accounts
from app.core.database import ensure_indexes, get_db
from app.core.mongo_store import MongoSession
from app.core.security import create_access_token, decode_access_token, get_current_user, hash_password, verify_password
from app.repositories.models import AccountModel, UserModel
from app.services import password_policy
from app.services.auth_throttle import MongoAuthLimiter

STRONG = 'Copper lantern orbit meadow 7249!'
# Keep a reference to the real boundary; the shared regression fixture replaces
# only external breach I/O so unrelated tests never send test passwords online.
real_breach_check = password_policy.check_breached_password


@pytest.fixture
def api():
    database = mongomock.MongoClient().password_security
    ensure_indexes(database)
    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(accounts.router, dependencies=[Depends(get_current_user)])
    def session():
        with MongoSession(database, testing_without_transactions=True) as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app) as client:
        yield client, database


def registration(password=STRONG, **changes):
    return {'name': 'Example User', 'email': 'new@example.test', 'phone_number': '(202) 555-0100', 'password': password, **changes}


@pytest.mark.parametrize('password', ['123456789012345', 'passwordpasswordpassword', 'qwertyuiopasdfghjkl', 'short'])
def test_weak_passwords_never_create_accounts(api, password):
    client, database = api
    response = client.post('/auth/register', json=registration(password))
    assert response.status_code in (400, 422)
    assert database.users.count_documents({}) == 0
    assert 'input' not in str(response.json())
    assert f'"{password}"' not in response.text


def test_strong_registration_confirmation_duplicate_and_private_errors(api, caplog):
    client, database = api
    mismatch = client.post('/auth/register', json=registration(confirm_password='Different unrelated meadow 8134!'))
    assert mismatch.status_code == 400
    assert database.users.count_documents({}) == 0
    created = client.post('/auth/register', json=registration(confirm_password=STRONG))
    assert created.status_code == 200, created.text
    assert database.users.find_one()['password_hash'].startswith('$argon2id$')
    assert STRONG not in created.text and 'password_hash' not in created.text
    assert client.post('/auth/register', json=registration()).status_code == 409
    oversized = STRONG * 8
    rejected = client.post('/auth/register', json=registration(oversized))
    assert rejected.status_code == 422
    assert oversized not in rejected.text and 'input' not in rejected.json()['detail'][0]
    assert STRONG not in caplog.text


def test_personal_words_are_penalized():
    with pytest.raises(HTTPException) as error:
        password_policy.validate_new_password(STRONG, name=STRONG, email='person@example.test')
    assert error.value.status_code == 400
    from zxcvbn import matching
    assert 'user_inputs' not in matching.RANKED_DICTIONARIES


def test_unicode_long_passwords_are_not_normalized_or_truncated():
    password = ('cello 粲 orbit 🪐 meadow lantern ' * 6)[:128]
    password_policy.validate_new_password(password, name='Example', email='person@example.test')
    hashed = hash_password(password)
    assert verify_password(password, hashed)
    assert not verify_password(password[:-1] + 'x', hashed)
    with pytest.raises(HTTPException):
        password_policy.validate_new_password(password + 'x', name='Example', email='person@example.test')


def test_breach_check_sends_only_prefix_and_uses_padding(monkeypatch):
    digest = hashlib.sha1(STRONG.encode(), usedforsecurity=False).hexdigest().upper()
    calls = []
    @contextmanager
    def stream(method, url, **kwargs):
        calls.append((method, url, kwargs))
        yield httpx.Response(200, text=f"{'A' * 35}:0\r\n{digest[5:]}:7\r\n", request=httpx.Request(method, url))
    monkeypatch.setattr(httpx, 'stream', stream)
    with pytest.raises(HTTPException) as error:
        real_breach_check(STRONG)
    assert error.value.status_code == 400
    assert calls[0][1] == 'https://api.pwnedpasswords.com/range/' + digest[:5]
    assert calls[0][2]['headers']['Add-Padding'] == 'true'
    assert STRONG not in repr(calls) and digest[5:] not in repr(calls)


@pytest.mark.parametrize('body,status', [('', 200), ('unusable response', 200), ('A' * 260000, 200), ('unavailable', 503), ('redirect', 302)], ids=['empty', 'malformed', 'oversized', 'unavailable', 'redirect'])
def test_breach_service_failures_fail_closed(monkeypatch, body, status):
    @contextmanager
    def stream(method, url, **kwargs):
        yield httpx.Response(status, text=body, request=httpx.Request(method, url))
    monkeypatch.setattr(httpx, 'stream', stream)
    with pytest.raises(HTTPException) as error:
        real_breach_check(STRONG)
    assert error.value.status_code == 503


def test_breach_service_timeout_cannot_register(api, monkeypatch):
    @contextmanager
    def stream(*args, **kwargs):
        raise httpx.ConnectTimeout('synthetic outage')
        yield
    monkeypatch.setattr(httpx, 'stream', stream)
    monkeypatch.setattr(password_policy, 'check_breached_password', real_breach_check)
    client, database = api
    assert client.post('/auth/register', json=registration()).status_code == 503
    assert database.users.count_documents({}) == 0


def test_legacy_password_upgrades_without_touching_finances(api):
    client, database = api
    password = 'oldpass8'
    salt = base64.urlsafe_b64encode(b'legacy-test-salt!').decode()
    legacy = salt + '$' + base64.urlsafe_b64encode(hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 120000)).decode()
    # A real historical document has no session_version field at all.
    database.users.insert_one({'_id': 81, 'name': 'Existing', 'email': 'old@example.test', 'phone_number': '', 'occupation': '', 'password_hash': legacy})
    database.accounts.insert_one({'_id': 83, 'user_id': 81, 'bank_name': 'Bank', 'name': 'Savings', 'starting_balance': 100, 'account_type': 'savings'})
    before = database.accounts.find_one()
    old_token = create_access_token('old@example.test')
    assert client.get('/auth/me', headers={'Authorization': 'Bearer ' + old_token}).status_code == 200
    response = client.post('/auth/login', json={'email': 'old@example.test', 'password': password})
    assert response.status_code == 200, response.text
    assert database.users.find_one({'_id': 81})['password_hash'].startswith('$argon2id$')
    assert database.accounts.find_one() == before
    assert client.get('/auth/me', headers={'Authorization': 'Bearer ' + old_token}).status_code == 200


def test_password_change_revokes_all_old_sessions_atomically(api):
    client, database = api
    created = client.post('/auth/register', json=registration()).json()
    headers = {'Authorization': 'Bearer ' + created['access_token']}
    assert client.get('/auth/me', headers=headers).status_code == 200
    old_hash = database.users.find_one()['password_hash']
    rejected = client.patch('/auth/me/password', headers=headers, json={'current_password': STRONG, 'new_password': '123456789012345'})
    assert rejected.status_code == 400
    assert database.users.find_one()['password_hash'] == old_hash
    new = 'Lanterns drift across velvet oceans 8341!'
    changed = client.patch('/auth/me/password', headers=headers, json={'current_password': STRONG, 'new_password': new, 'confirm_password': new})
    assert changed.status_code == 200, changed.text
    assert database.users.find_one()['session_version'] == 1
    assert client.get('/auth/me', headers=headers).status_code == 401
    assert client.post('/auth/login', json={'email': 'new@example.test', 'password': STRONG}).status_code == 401
    logged = client.post('/auth/login', json={'email': 'new@example.test', 'password': new})
    assert logged.status_code == 200
    assert decode_access_token(logged.json()['access_token'])['sv'] == 1


def test_limits_are_atomic_persistent_and_identifiers_private():
    database = mongomock.MongoClient().limits
    limiter = MongoAuthLimiter(database, 'long-synthetic-secret-for-this-test-only', clock=lambda: 1000)
    def attempt(_):
        try:
            MongoAuthLimiter(database, limiter.secret.decode(), clock=lambda: 1000).consume('test', 'private@example.test', 5, 60)
            return True
        except HTTPException as error:
            assert error.status_code == 429
            return False
    with ThreadPoolExecutor(max_workers=8) as executor:
        assert sum(executor.map(attempt, range(20))) == 5
    assert 'private@example.test' not in repr(list(database.auth_rate_limits.find()))


def test_login_errors_are_generic_and_progressively_throttled(api):
    client, database = api
    client.post('/auth/register', json=registration())
    for email in ['new@example.test', 'missing@example.test']:
        for _ in range(3):
            response = client.post('/auth/login', json={'email': email, 'password': 'incorrect'})
            assert response.status_code == 401
            assert response.json()['detail'] == 'invalid email or password'
        response = client.post('/auth/login', json={'email': email, 'password': 'incorrect'})
        assert response.status_code == 429 and int(response.headers['Retry-After']) >= 1

