from datetime import date
from decimal import Decimal

from app.repositories.models import AccountModel, SplitBillModel, TransactionModel, UserModel
from app.services.account_service import AccountService
from app.services.report_service import ReportService
from test_split_calculator import store
from test_split_groups import client, register
from test_split_bills import draft


def prepare(client, email='repayment@example.test', bank=False):
    headers = register(client, email)
    with store(client) as db:
        user = db.query(UserModel).filter_by(email=email).first()
        db.info['user_id'] = user.id
        account = AccountModel(user_id=user.id, bank_name='Test Bank', name='Checking', account_type='checking',
            starting_balance=Decimal('100'), bank_current_balance=Decimal('100') if bank else None)
        db.add(account)
        db.commit()
        account_id = account.id
    bill = client.post('/split-bills', headers=headers, json=draft().model_dump(mode='json')).json()
    return headers, account_id, bill


def test_mark_paid_is_idempotent_updates_balance_but_not_regular_income(client):
    headers, account_id, bill = prepare(client)
    path = f"/split-bills/{bill['id']}"
    options = client.get(path + '/repayment-options/friend', headers=headers).json()
    assert options['accounts'] == [{'id': account_id, 'name': 'Checking'}]
    assert client.post(path + '/mark-paid/self', headers=headers, json={'account_id': account_id, 'request_id': 'self'}).status_code == 400
    payload = {'account_id': account_id, 'request_id': 'payment-1'}
    response = client.post(path + '/mark-paid/friend', headers=headers, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['repayments']['friend'] == {'received': '20.80', 'remaining': '0.00', 'paid': True, 'needs_review': False}
    for request_id in ['payment-1', 'different-device']:
        payload['request_id'] = request_id
        assert client.post(path + '/mark-paid/friend', headers=headers, json=payload).status_code == 200
    with store(client) as db:
        assert db.query(TransactionModel).count() == 1
        transaction = db.query(TransactionModel).first()
        assert transaction.financial_kind == 'reimbursement'
        assert transaction.amount == Decimal('20.80')
        assert AccountService(db).get_account(account_id).current_balance == Decimal('120.80')
        report = ReportService(db).monthly_report(date.today().month, date.today().year)
        assert report.total_income == Decimal('0')
    assert client.get('/split-bills', headers=headers).json()[0]['repayments']['friend']['paid'] is True


def test_link_bank_repayment_without_duplicate_and_keep_finances_when_deleted(client):
    headers, account_id, bill = prepare(client, bank=True)
    path = f"/split-bills/{bill['id']}"
    with store(client) as db:
        transaction = TransactionModel(account_id=account_id, amount=Decimal('20.80'), category='Other',
            transaction_type='income', transaction_date=date.today(), financial_kind='standard', note='Friend transfer')
        db.add(transaction)
        db.commit()
        transaction_id = transaction.id
        before = AccountService(db).get_account(account_id).current_balance
    options = client.get(path + '/repayment-options/friend', headers=headers).json()
    assert options['accounts'] == []
    assert options['transactions'][0]['id'] == transaction_id
    assert client.post(path + '/mark-paid/friend', headers=headers, json={'account_id': account_id, 'request_id': 'bad'}).status_code == 409
    payload = {'transaction_id': transaction_id, 'request_id': 'bank-1'}
    response = client.post(path + '/mark-paid/friend', headers=headers, json=payload)
    assert response.status_code == 200, response.text
    second = client.post('/split-bills', headers=headers, json=draft().model_dump(mode='json')).json()
    assert client.post(f"/split-bills/{second['id']}/mark-paid/friend", headers=headers, json={**payload, 'request_id': 'reuse'}).status_code == 409
    assert client.delete(path, headers=headers).status_code == 204
    assert [row['id'] for row in client.get('/split-bills', headers=headers).json()] == [second['id']]
    assert client.post(path + '/mark-paid/friend', headers=headers, json=payload).status_code == 404
    with store(client) as db:
        assert db.query(TransactionModel).count() == 1
        assert db.get(TransactionModel, transaction_id).financial_kind == 'reimbursement'
        assert AccountService(db).get_account(account_id).current_balance == before
        assert db.get(SplitBillModel, bill['id']).repayments['friend']['transaction_id'] == transaction_id
    # Deleting never frees a bank transaction for a second receipt allocation.
    assert client.post(f"/split-bills/{second['id']}/mark-paid/friend", headers=headers, json={**payload, 'request_id': 'reuse-again'}).status_code == 409


def test_ownership_and_validation_and_delete_empty_receipt(client):
    owner, account_id, bill = prepare(client, 'owner-repayment@example.test')
    other, other_account, other_bill = prepare(client, 'other-repayment@example.test')
    path = f"/split-bills/{bill['id']}"
    assert client.delete(path, headers=other).status_code == 404
    assert client.get(path + '/repayment-options/friend', headers=other).status_code == 404
    assert client.post(path + '/mark-paid/friend', headers=other, json={'account_id': other_account, 'request_id': 'foreign'}).status_code == 404
    assert client.post(path + '/mark-paid/friend', headers=owner, json={'account_id': other_account, 'request_id': 'foreign-account'}).status_code == 404
    assert client.post(path + '/mark-paid/friend', headers=owner, json={'request_id': 'missing-account'}).status_code == 422
    with store(client) as db:
        assert db.query(TransactionModel).count() == 0
    assert client.delete(path, headers=owner).status_code == 204
    assert client.get('/split-bills', headers=owner).json() == []
    assert client.put(path, headers=owner, json=draft().model_dump(mode='json')).status_code == 404
    assert len(client.get('/split-bills', headers=other).json()) == 1
