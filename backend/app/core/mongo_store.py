"""MongoDB document storage for the finance service's typed records.

SQLAlchemy supplies record metadata and predicate objects only; no SQL database
is opened by this store. Predicates become native MongoDB filters, and a request
unit of work persists related document changes in a MongoDB transaction.
"""
from copy import deepcopy
from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum

from bson.decimal128 import Decimal128
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern
from sqlalchemy.sql import operators
from sqlalchemy.sql.elements import BooleanClauseList, Grouping


def encode(value):
    if isinstance(value, Decimal):
        return Decimal128(value)
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {key: encode(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [encode(item) for item in value]
    return value


def decode(value):
    if isinstance(value, Decimal128):
        return value.to_decimal()
    if isinstance(value, dict):
        return {key: decode(item) for key, item in value.items()}
    if isinstance(value, list):
        return [decode(item) for item in value]
    return value


def field_name(column):
    return "_id" if column.name == "id" else column.name


def mongo_filter(expression):
    if isinstance(expression, Grouping):
        return mongo_filter(expression.element)
    if isinstance(expression, BooleanClauseList):
        if expression.operator not in {operators.and_, operators.or_}:
            raise NotImplementedError("Unsupported boolean record filter.")
        key = "$and" if expression.operator is operators.and_ else "$or"
        return {key: [mongo_filter(clause) for clause in expression.clauses]}
    operation = expression.operator
    key = field_name(expression.left)
    if operation in {operators.is_, operators.is_not}:
        value = None
    else:
        value = encode(expression.right.value)
    comparisons = {operators.eq: "$eq", operators.ne: "$ne", operators.lt: "$lt", operators.le: "$lte",
                   operators.gt: "$gt", operators.ge: "$gte", operators.in_op: "$in", operators.not_in_op: "$nin",
                   operators.is_: "$eq", operators.is_not: "$ne"}
    if operation not in comparisons:
        raise NotImplementedError("This record filter is not supported by MongoDB storage.")
    return {key: {comparisons[operation]: value}}


class MongoQuery:
    def __init__(self, store, model, filters=(), sorting=()):
        self.store, self.model = store, model
        self.filters, self.sorting = list(filters), list(sorting)

    def filter(self, *expressions):
        return MongoQuery(self.store, self.model, [*self.filters, *(mongo_filter(e) for e in expressions)], self.sorting)

    def filter_by(self, **values):
        filters = [{"_id" if key == "id" else key: encode(value)} for key, value in values.items()]
        return MongoQuery(self.store, self.model, [*self.filters, *filters], self.sorting)

    def order_by(self, *columns):
        ordering = []
        for column in columns:
            descending = getattr(column, "modifier", None) is operators.desc_op
            field = column.element if descending else column
            ordering.append((field_name(field), -1 if descending else 1))
        return MongoQuery(self.store, self.model, self.filters, [*self.sorting, *ordering])

    def _filter(self):
        clauses = [self.store.scope(self.model), *self.filters]
        return {"$and": clauses} if len(clauses) > 1 else clauses[0]

    def all(self):
        cursor = self.store.collection(self.model).find(self._filter(), **self.store.options())
        if self.sorting:
            cursor = cursor.sort(self.sorting)
        return [self.store.materialize(self.model, document) for document in cursor]

    def first(self):
        cursor = self.store.collection(self.model).find(self._filter(), **self.store.options())
        if self.sorting:
            cursor = cursor.sort(self.sorting)
        document = next(iter(cursor.limit(1)), None)
        return self.store.materialize(self.model, document) if document is not None else None

    def one(self):
        records = self.all()
        if len(records) != 1:
            raise ValueError("Expected exactly one record.")
        return records[0]

    def count(self):
        return self.store.collection(self.model).count_documents(self._filter(), **self.store.options())

    def delete(self):
        records = self.all()
        for record in records:
            self.store.delete(record)
        self.store.flush()
        return len(records)

    def __iter__(self):
        return iter(self.all())


class MongoSession:
    def __init__(self, database, *, testing_without_transactions=False):
        if testing_without_transactions and not type(database.client).__module__.startswith("mongomock"):
            raise ValueError("Transactions may only be disabled for an in-memory mongomock test database.")
        self.database = database
        self.info = {}
        self.native_session = None
        self.testing_without_transactions = testing_without_transactions
        self.records, self.originals = {}, {}
        self.pending, self.deleted = [], set()
        self.parent_cache = {}

    def options(self):
        if self.testing_without_transactions:
            return {}
        if self.native_session is None:
            self.native_session = self.database.client.start_session()
        if not self.native_session.in_transaction:
            self.native_session.start_transaction(read_concern=ReadConcern("snapshot"), write_concern=WriteConcern("majority"))
        return {"session": self.native_session}

    def collection(self, model):
        return self.database[model.__tablename__]

    def scope(self, model):
        user_id = self.info.get("user_id")
        if user_id is None or model.__tablename__ == "users":
            return {}
        columns = model.__table__.columns
        if "user_id" in columns:
            return {"user_id": user_id}
        owned = [document["_id"] for document in self.database.accounts.find({"user_id": user_id}, {"_id": 1}, **self.options())]
        if "account_id" in columns:
            return {"account_id": {"$in": owned}}
        if model.__tablename__ == "transfers":
            return {"from_account_id": {"$in": owned}, "to_account_id": {"$in": owned}}
        if "plaid_item_id" in columns:
            items = [document["_id"] for document in self.database.plaid_items.find({"user_id": user_id}, {"_id": 1}, **self.options())]
            return {"plaid_item_id": {"$in": items}}
        return {}

    def query(self, model):
        return MongoQuery(self, model)

    def get(self, model, record_id):
        if record_id is None:
            return None
        return self.query(model).filter_by(id=record_id).first()

    def materialize(self, model, document, *, refresh=False):
        key = (model, document["_id"])
        if key in self.records and not refresh:
            return self.records[key]
        values = {}
        for column in model.__table__.columns:
            value = decode(document.get(field_name(column)))
            if column.type.python_type is date and isinstance(value, datetime):
                value = value.date()
            values[column.name] = value
        record = self.records.get(key)
        if record is None:
            record = model(**values)
        else:
            for name, value in values.items():
                setattr(record, name, value)
        self.records[key] = record
        self.originals[key] = deepcopy(document)
        return record

    def add(self, record):
        if any(existing is record for existing in self.pending):
            return
        key = (type(record), record.id)
        if record.id is not None and key in self.records:
            return
        for column in record.__table__.columns:
            if getattr(record, column.name, None) is None and column.default is not None:
                default = column.default
                setattr(record, column.name, default.arg(None) if default.is_callable else deepcopy(default.arg))
        if hasattr(record, "user_id") and self.info.get("user_id") is not None:
            if record.user_id is None:
                record.user_id = self.info["user_id"]
            elif record.user_id != self.info["user_id"]:
                raise HTTPException(403, "This record belongs to another user.")
        self.pending.append(record)

    def add_all(self, records):
        for record in records:
            self.add(record)

    def document(self, record):
        document = {}
        for column in record.__table__.columns:
            value = getattr(record, column.name, None)
            if value is not None and getattr(column.type, "scale", None) == 2:
                value = Decimal(str(value)).quantize(Decimal("0.01"))
                setattr(record, column.name, value)
            if isinstance(value, datetime):
                value = value.replace(microsecond=value.microsecond // 1000 * 1000)
                setattr(record, column.name, value)
            document[field_name(column)] = encode(value)
        return document

    def authorize(self, record):
        user_id = self.info.get("user_id")
        if user_id is not None and hasattr(record, "user_id") and record.user_id != user_id:
            raise HTTPException(403, "This record belongs to another user.")
        if user_id is not None and record.__tablename__ == "users" and record.id != user_id:
            raise HTTPException(403, "This user cannot be modified.")
        if user_id is not None:
            for name in ("account_id", "from_account_id", "to_account_id"):
                if hasattr(record, name):
                    parent_key = ("accounts", getattr(record, name))
                    if parent_key not in self.parent_cache:
                        self.parent_cache[parent_key] = self.database.accounts.find_one({"_id": getattr(record, name)}, **self.options())
                    account = self.parent_cache[parent_key]
                    if account is None or account.get("user_id") != user_id:
                        raise HTTPException(404, "Account not found.")
        for column in record.__table__.columns:
            value = getattr(record, column.name, None)
            if value is None:
                continue
            for reference in column.foreign_keys:
                parent_key = (reference.column.table.name, value)
                if parent_key not in self.parent_cache:
                    self.parent_cache[parent_key] = self.database[reference.column.table.name].find_one({"_id": value}, **self.options())
                parent = self.parent_cache[parent_key]
                if parent is None:
                    raise HTTPException(400, "A related record no longer exists.")

    def _bill_allocations(self, document):
        if document is None:
            return {}
        allocations = {}
        def add(transaction_id, person_id, payment_id):
            if transaction_id is None:
                return
            if transaction_id in allocations:
                raise HTTPException(409, "A transaction cannot be used twice on a bill.")
            allocations[transaction_id] = (person_id, payment_id)
        add(document.get("payment_transaction_id"), "bill", "payment")
        for person, repayment in (document.get("repayments") or {}).items():
            for payment in repayment.get("payments", [repayment]):
                add(payment.get("transaction_id"), person, payment.get("id", "legacy"))
        return allocations

    def reserve_bill_allocations(self, record, before, after):
        if record.__tablename__ != "split_bills":
            return
        old, new = self._bill_allocations(before), self._bill_allocations(after)
        for transaction_id, allocation in old.items():
            if new.get(transaction_id) != allocation:
                self.database["_allocations"].delete_one({"_id": transaction_id, "bill_id": record.id}, **self.options())
        for transaction_id, (person_id, payment_id) in new.items():
            self.database["_allocations"].update_one({"_id": transaction_id, "bill_id": record.id,
                "person_id": person_id, "payment_id": payment_id}, {"$setOnInsert": {"user_id": record.user_id}},
                upsert=True, **self.options())

    def flush(self):
        groups = {}
        for record in self.pending:
            groups.setdefault(type(record), []).append(record)
        for model, records in groups.items():
            explicit = [record.id for record in records if record.id is not None]
            if explicit:
                self.database["_counters"].update_one({"_id": model.__tablename__}, {"$max": {"value": max(explicit)}}, upsert=True, **self.options())
            missing = [record for record in records if record.id is None]
            if missing:
                counter = self.database["_counters"].find_one_and_update({"_id": model.__tablename__},
                    {"$inc": {"value": len(missing)}}, upsert=True, return_document=ReturnDocument.AFTER, **self.options())
                for offset, record in enumerate(missing):
                    record.id = counter["value"] - len(missing) + offset + 1
            documents = []
            for record in records:
                self.authorize(record)
                document = {**self.document(record), "_revision": 0}
                self.reserve_bill_allocations(record, None, document)
                documents.append(document)
            if len(documents) == 1:
                self.collection(model).insert_one(documents[0], **self.options())
            else:
                self.collection(model).insert_many(documents, ordered=True, **self.options())
            for record, document in zip(records, documents):
                key = (model, record.id)
                self.records[key], self.originals[key] = record, deepcopy(document)
                self.parent_cache[(model.__tablename__, record.id)] = document
                self.pending.remove(record)
        for key in list(self.deleted):
            model, record_id = key
            record = self.records[key]
            self.reserve_bill_allocations(record, self.originals.get(key), {})
            self._cascade_delete(record)
            self.collection(model).delete_one({"_id": record_id}, **self.options())
            self.parent_cache.pop((model.__tablename__, record_id), None)
            self.records.pop(key, None)
            self.originals.pop(key, None)
            self.deleted.remove(key)
        for key, record in list(self.records.items()):
            original = self.originals[key]
            document = self.document(record)
            if document == {k: v for k, v in original.items() if k != "_revision"}:
                continue
            self.authorize(record)
            self.reserve_bill_allocations(record, original, document)
            revision = original.get("_revision", 0)
            document["_revision"] = revision + 1
            result = self.collection(type(record)).replace_one({"_id": record.id, "_revision": revision}, document, **self.options())
            if result.matched_count != 1:
                raise HTTPException(409, "This record changed in another request. Refresh and retry.")
            self.originals[key] = deepcopy(document)
            self.parent_cache[(type(record).__tablename__, record.id)] = document

    def execute(self, statement):
        # Existing financial services use self-assignment updates as row locks.
        # Incrementing a revision gives MongoDB an actual write-conflict lock.
        from app.core.database import Base
        model = next(mapper.class_ for mapper in Base.registry.mappers if mapper.local_table.name == statement.table.name)
        for column, value in statement._values.items():
            if getattr(value, "name", None) != (column if isinstance(column, str) else column.name):
                raise NotImplementedError("Only record lock updates are supported.")
        self.flush()
        query = self.query(model).filter(*statement._where_criteria)
        self.collection(model).update_many(query._filter(), {"$inc": {"_revision": 1}}, **self.options())
        for (record_model, _), record in list(self.records.items()):
            if record_model is model:
                self.refresh(record)

    def refresh(self, record):
        document = self.collection(type(record)).find_one({"_id": record.id}, **self.options())
        if document is None:
            raise HTTPException(409, "This record no longer exists.")
        self.materialize(type(record), document, refresh=True)

    def expire_all(self):
        for record in list(self.records.values()):
            self.refresh(record)

    def delete(self, record):
        if record is None:
            return
        if any(item is record for item in self.pending):
            self.pending = [item for item in self.pending if item is not record]
            return
        self.authorize(record)
        self.deleted.add((type(record), record.id))

    def _cascade_delete(self, record):
        if record.__tablename__ == "accounts":
            self.database.transactions.delete_many({"account_id": record.id}, **self.options())
            self.database.recurring_transactions.delete_many({"account_id": record.id}, **self.options())
        elif record.__tablename__ == "users":
            accounts = [row["_id"] for row in self.database.accounts.find({"user_id": record.id}, {"_id": 1}, **self.options())]
            items = [row["_id"] for row in self.database.plaid_items.find({"user_id": record.id}, {"_id": 1}, **self.options())]
            for name in ("transactions", "recurring_transactions"):
                self.database[name].delete_many({"account_id": {"$in": accounts}}, **self.options())
            for name in ("plaid_account_links", "plaid_transaction_links"):
                self.database[name].delete_many({"plaid_item_id": {"$in": items}}, **self.options())
            self.database.transfers.delete_many({"$or": [{"from_account_id": {"$in": accounts}}, {"to_account_id": {"$in": accounts}}]}, **self.options())
            for name in ("accounts", "budgets", "friends", "split_bills", "savings_goals", "plaid_items", "_allocations", "user_state"):
                self.database[name].delete_many({"user_id": record.id}, **self.options())

    def commit(self):
        self.flush()
        if self.native_session is not None and self.native_session.in_transaction:
            for attempt in range(3):
                try:
                    self.native_session.commit_transaction()
                    break
                except PyMongoError as error:
                    if not error.has_error_label("UnknownTransactionCommitResult") or attempt == 2:
                        raise
        self.parent_cache.clear()

    def rollback(self):
        if self.native_session is not None and self.native_session.in_transaction:
            try:
                self.native_session.abort_transaction()
            except PyMongoError:
                pass
        self.records.clear()
        self.originals.clear()
        self.pending.clear()
        self.deleted.clear()
        self.parent_cache.clear()

    def release_read_transaction(self):
        """Do not hold a database transaction open while waiting for Plaid."""
        if self.pending or self.deleted or any(self.document(record) != {k: v for k, v in self.originals[key].items() if k != "_revision"}
                for key, record in self.records.items()):
            raise RuntimeError("Cannot release a transaction containing unsaved changes.")
        if self.native_session is not None and self.native_session.in_transaction:
            self.native_session.abort_transaction()
        self.parent_cache.clear()

    def close(self):
        try:
            self.rollback()
        finally:
            if self.native_session is not None:
                self.native_session.end_session()
                self.native_session = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
