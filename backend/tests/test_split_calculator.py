from contextlib import contextmanager
from copy import deepcopy
from decimal import Decimal
from datetime import date

from app.core.database import get_db
from app.repositories.models import AccountModel, SplitBillModel, TransactionModel, UserModel
from app.services.account_service import AccountService
from app.services.report_service import ReportService
from test_split_groups import client, register  # Both SQLite and MongoDB test stores.
from test_split_bills import draft


@contextmanager
def store(client):
    iterator = client.app.dependency_overrides[get_db]()
    db = next(iterator)
    db.info['user_id'] = 1
    try:
        yield db
    finally:
        iterator.close()


def test_receipt_save_edit_and_history_have_no_financial_fields_or_writes(client):
    headers = register(client, 'calculator@example.test')
    payload = draft().model_dump(mode='json')
    result = client.post('/split-bills', headers=headers, json=payload)
    assert result.status_code == 201, result.text
    receipt = result.json()
    assert set(receipt) == {'id', 'data', 'calculation', 'repayments'}
    assert not {'account_id', 'tip_method', 'category'}.intersection(receipt['data'])
    assert 'bank_debit' not in receipt['calculation']
    assert receipt['calculation']['allocated'] == receipt['calculation']['total'] == 5330
    payload.update(tip='10.00', receipt_total='55.10')
    updated = client.put(f"/split-bills/{receipt['id']}", headers=headers, json=payload)
    assert updated.status_code == 200, updated.text
    assert updated.json()['id'] == receipt['id']
    assert client.get('/split-bills', headers=headers).json() == [updated.json()]
    with store(client) as db:
        assert db.query(TransactionModel).count() == 0
        assert db.query(AccountModel).count() == 0
    document = client.app.openapi()
    assert not {'account_id', 'tip_method', 'category'}.intersection(document['components']['schemas']['SplitBillDraft']['properties'])
    paths = document['paths']
    assert f"/split-bills/{{bill_id}}/mark-paid/{{person_id}}" in paths
    for method, suffix in [('post', '/pay'), ('delete', '/payment'), ('get', '/candidates'), ('post', '/repayments/friend'), ('put', '/repayments/friend')]:
        assert getattr(client, method)(f"/split-bills/{receipt['id']}{suffix}", headers=headers).status_code == 404
    other = register(client, 'stranger-calculator@example.test')
    assert client.get('/split-bills', headers=other).json() == []
    assert client.put(f"/split-bills/{receipt['id']}", headers=other, json=payload).status_code == 404


def test_legacy_ledger_and_balance_are_preserved_when_receipt_is_read_or_copied(client):
    headers = register(client, 'legacy-calculator@example.test')
    with store(client) as db:
        owner = db.query(UserModel).filter_by(email='legacy-calculator@example.test').first()
        account = AccountModel(user_id=owner.id, bank_name='Bank', name='Checking', account_type='checking', starting_balance=Decimal('1000'))
        db.add(account)
        db.flush()
        charge = TransactionModel(account_id=account.id, amount=Decimal('53.30'), personal_amount=Decimal('32.50'), category='Food & Dining', transaction_type='expense', transaction_date=date(2026, 9, 16), financial_kind='standard')
        refund = TransactionModel(account_id=account.id, amount=Decimal('20.00'), category='Refund', transaction_type='income', transaction_date=date(2026, 9, 16), financial_kind='reimbursement')
        db.add_all([charge, refund])
        db.flush()
        old_data = {**draft().model_dump(mode='json'), 'account_id': account.id, 'tip_method': 'bank', 'category': 'Food & Dining'}
        old_repayments = {'friend': {'amount': '20.00', 'transaction_id': refund.id, 'payments': [{'id': 'legacy', 'amount': '20.00', 'transaction_id': refund.id, 'payment_date': '2026-09-16'}]}}
        bill = SplitBillModel(user_id=owner.id, data=old_data, payment_transaction_id=charge.id, repayments=deepcopy(old_repayments))
        db.add(bill)
        db.commit()
        original_id, account_id, charge_id, refund_id = bill.id, account.id, charge.id, refund.id
        balance = AccountService(db).get_account(account_id).current_balance
        report = ReportService(db).monthly_report(9, 2026)
        totals = (report.total_income, report.total_expenses)
    public = client.get('/split-bills', headers=headers).json()[0]
    assert set(public) == {'id', 'data', 'calculation', 'repayments'}
    assert public['calculation']['total'] == 5330
    changed = {**public['data'], 'tip': '10.00', 'receipt_total': '55.10'}
    response = client.put(f'/split-bills/{original_id}', headers=headers, json=changed)
    assert response.status_code == 200, response.text
    assert response.json()['id'] != original_id
    assert response.json()['calculation']['total'] == 5510
    with store(client) as db:
        original = db.get(SplitBillModel, original_id)
        assert original.data == old_data
        assert original.repayments == old_repayments
        assert original.payment_transaction_id == charge_id
        assert db.query(TransactionModel).count() == 2
        assert db.get(TransactionModel, charge_id).amount == Decimal('53.30')
        assert db.get(TransactionModel, charge_id).personal_amount == Decimal('32.50')
        assert db.get(TransactionModel, refund_id).amount == Decimal('20.00')
        assert AccountService(db).get_account(account_id).current_balance == balance
        report = ReportService(db).monthly_report(9, 2026)
        assert (report.total_income, report.total_expenses) == totals == (Decimal('0'), Decimal('32.50'))


def test_incomplete_receipt_is_rejected_without_saving(client):
    headers = register(client, 'incomplete-calculator@example.test')
    payload = draft().model_dump(mode='json')
    payload['items'][0]['people'] = []
    assert client.post('/split-bills', headers=headers, json=payload).status_code == 400
    payload = draft().model_dump(mode='json')
    payload['receipt_total'] = '999.00'
    assert client.post('/split-bills', headers=headers, json=payload).status_code == 400
    assert client.get('/split-bills', headers=headers).json() == []
