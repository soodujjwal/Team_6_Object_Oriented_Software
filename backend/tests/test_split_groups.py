import mongomock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import auth, split_bills
from app.core.database import Base, ensure_indexes, get_db
from app.core.mongo_store import MongoSession


@pytest.fixture(params=['sqlite', 'mongo'])
def client(request):
    if request.param == 'mongo':
        database = mongomock.MongoClient().split_groups
        ensure_indexes(database)
        factory = lambda: MongoSession(database, testing_without_transactions=True)
    else:
        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        factory = lambda: Session(engine)
    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(split_bills.router)
    def session():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app) as connection:
        yield connection


def register(client, email):
    response = client.post('/auth/register', json={'name': 'Group Test', 'email': email, 'password': 'safe-test-password', 'phone_number': '(202) 555-0100'})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['access_token']}


def test_groups_persist_across_sessions_and_are_isolated_without_changing_bills(client):
    owner = register(client, 'groups@example.test')
    friend = client.post('/split-bills/friends', headers=owner, json={'name': 'Alex'}).json()
    draft = {'title': 'Shared meal', 'people': [{'id': 'self', 'name': 'You'}, {'id': f"friend-{friend['id']}", 'name': 'Alex'}],
             'self_id': 'self', 'items': [{'id': 'one', 'name': 'Dinner', 'quantity': 1, 'price': '20.00', 'people': ['self', f"friend-{friend['id']}"]}],
             'tax': '2.00', 'tip': '4.00', 'receipt_total': '26.00', 'bill_date': '2026-11-06'}
    bill = client.post('/split-bills', headers=owner, json=draft)
    assert bill.status_code == 201, bill.text
    response = client.post('/split-bills/groups', headers=owner, json={'name': '  Weekend friends  ', 'friend_ids': [friend['id']]})
    assert response.status_code == 201, response.text
    group = response.json()
    assert group['name'] == 'Weekend friends'
    other = register(client, 'other-groups@example.test')
    assert client.get('/split-bills/groups', headers=other).json() == []
    assert client.post('/split-bills/groups', headers=other, json={'name': 'Stolen friends', 'friend_ids': [friend['id']]}).status_code == 400
    session = client.post('/auth/login', json={'email': 'groups@example.test', 'password': 'safe-test-password'}).json()
    fresh = {'Authorization': 'Bearer ' + session['access_token']}
    assert client.get('/split-bills/groups', headers=fresh).json() == [group]
    assert client.get('/split-bills/friends', headers=fresh).json() == [friend]
    assert client.get('/split-bills', headers=fresh).json() == [bill.json()]
    assert 'paid' not in bill.json()
    assert bill.json()['repayments'][f"friend-{friend['id']}"]['paid'] is False
    assert sum(person['total'] for person in bill.json()['calculation']['people']) == 2600


def test_group_validation_and_authentication(client):
    assert client.get('/split-bills/groups').status_code in (401, 403)
    headers = register(client, 'validation-groups@example.test')
    friend_id = client.post('/split-bills/friends', headers=headers, json={'name': 'Sam'}).json()['id']
    for payload in [{'name': ' ', 'friend_ids': [friend_id]}, {'name': 'Duplicates', 'friend_ids': [friend_id, friend_id]},
                    {'name': 'Empty', 'friend_ids': []}, {'name': 'Foreign', 'friend_ids': [99999]},
                    {'name': 'Too many', 'friend_ids': list(range(50))}]:
        assert client.post('/split-bills/groups', headers=headers, json=payload).status_code in (400, 422)
    assert client.get('/split-bills/groups', headers=headers).json() == []
