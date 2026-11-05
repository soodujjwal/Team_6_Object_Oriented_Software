"""Online MongoDB connection and request-scoped units of work.

The legacy exports exist only for SQLite regression tests and backup tooling.
Application requests always use MongoDB; missing credentials never fall back to
the old local database.
"""
from collections.abc import Generator
from functools import lru_cache
import re

from fastapi import HTTPException
from pymongo import MongoClient, IndexModel, ASCENDING
from pymongo.errors import BulkWriteError, DuplicateKeyError, OperationFailure, PyMongoError

from app.core.config import get_settings
from app.core.legacy_database import Base, engine, migrate_database  # Legacy test compatibility.
from app.core.mongo_store import MongoSession


def mongodb_configured() -> bool:
    uri = get_settings().mongodb_uri
    return bool(uri and "<" not in uri and ">" not in uri and uri.startswith(("mongodb+srv://", "mongodb://")))


@lru_cache
def get_mongo_client():
    if not mongodb_configured():
        raise HTTPException(503, "MongoDB is not configured. Set MONGODB_URI in the project root .env with the actual database password.")
    try:
        return MongoClient(get_settings().mongodb_uri, appname="Team6FinanceBuilder", serverSelectionTimeoutMS=5000,
                           connectTimeoutMS=5000, socketTimeoutMS=15000, maxPoolSize=20, retryWrites=True)
    except (PyMongoError, ValueError):
        raise HTTPException(503, "The MongoDB connection string is invalid. Check MONGODB_URI and percent-encode special characters in its password.") from None


def get_mongo_database():
    name = get_settings().mongodb_database
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,63}", name):
        raise HTTPException(503, "MONGODB_DATABASE must contain only letters, digits, underscores or hyphens.")
    return get_mongo_client()[name]


def ensure_indexes(database):
    from app.repositories import models  # noqa: F401
    collections = {mapper.local_table.name for mapper in Base.registry.mappers} | {"_counters", "_allocations"}
    existing = set(database.list_collection_names())
    for name in collections - existing:
        database.create_collection(name)
    indexes = {
        "user_state": [IndexModel([("user_id", ASCENDING), ("key", ASCENDING)], unique=True)],
        "users": [IndexModel([("email", ASCENDING)], unique=True)],
        "accounts": [IndexModel([("user_id", ASCENDING)])],
        "transactions": [IndexModel([("account_id", ASCENDING), ("transaction_date", ASCENDING)])],
        "budgets": [IndexModel([("user_id", ASCENDING), ("category", ASCENDING), ("month", ASCENDING), ("year", ASCENDING)], unique=True)],
        "friends": [IndexModel([("user_id", ASCENDING), ("name", ASCENDING)], unique=True)],
        "split_bills": [IndexModel([("user_id", ASCENDING)])],
        "savings_goals": [IndexModel([("user_id", ASCENDING)])],
        "transfers": [IndexModel([("from_account_id", ASCENDING), ("to_account_id", ASCENDING)])],
        "recurring_transactions": [IndexModel([("account_id", ASCENDING), ("next_due_date", ASCENDING)])],
        "plaid_items": [IndexModel([("item_id", ASCENDING)], unique=True), IndexModel([("user_id", ASCENDING)])],
        "plaid_account_links": [IndexModel([("plaid_account_id", ASCENDING)], unique=True), IndexModel([("account_id", ASCENDING)], unique=True)],
        "plaid_transaction_links": [IndexModel([("plaid_transaction_id", ASCENDING)], unique=True), IndexModel([("transaction_id", ASCENDING)], unique=True)],
        "_allocations": [IndexModel([("user_id", ASCENDING)]), IndexModel([("bill_id", ASCENDING)])],
    }
    for name, definitions in indexes.items():
        database[name].create_indexes(definitions)


def create_database() -> None:
    if not mongodb_configured():
        return
    try:
        database = get_mongo_database()
        database.command("ping")
        ensure_indexes(database)
    except PyMongoError:
        raise RuntimeError("MongoDB initialization failed. Check the database password, Atlas IP access list, and network connectivity.") from None


def get_db() -> Generator[MongoSession, None, None]:
    db = MongoSession(get_mongo_database())
    try:
        yield db
    except DuplicateKeyError:
        db.rollback()
        raise HTTPException(409, "This record or payment link already exists. Refresh before retrying.") from None
    except BulkWriteError as error:
        db.rollback()
        if any(item.get("code") == 11000 for item in error.details.get("writeErrors", [])):
            raise HTTPException(409, "The batch contains a duplicate record. Refresh before retrying.") from None
        raise HTTPException(503, "MongoDB could not save this batch. Refresh before retrying.") from None
    except OperationFailure as error:
        db.rollback()
        if error.has_error_label("TransientTransactionError"):
            raise HTTPException(409, "Another request changed these records. Refresh and retry.") from None
        if error.has_error_label("UnknownTransactionCommitResult"):
            raise HTTPException(503, "Database confirmation is unavailable. Refresh transaction history before retrying.") from None
        raise HTTPException(503, "MongoDB could not complete this operation. Check database access and try again.") from None
    except PyMongoError:
        db.rollback()
        raise HTTPException(503, "MongoDB is unavailable. Check Atlas network access and refresh before retrying.") from None
    finally:
        db.close()


def database_health():
    if not mongodb_configured():
        return {"status": "not_configured", "engine": "mongodb"}
    try:
        get_mongo_database().command("ping")
        return {"status": "ok", "engine": "mongodb"}
    except (PyMongoError, HTTPException):
        return {"status": "unavailable", "engine": "mongodb"}
