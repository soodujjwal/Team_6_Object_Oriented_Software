"""Mongo-backed, atomic, multi-worker authentication throttling.

Counts commit independently of failed login/registration transactions. Only
purpose-separated keyed digests are stored, never raw emails or IP addresses.
"""
import hashlib
import hmac
import logging
import math
from datetime import datetime, timezone
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class MongoAuthLimiter:
    def __init__(self, database, secret: str, clock=None):
        if len(secret.encode("utf-8")) < 32:
            raise HTTPException(503, "Authentication is not configured.")
        self.collection = database["auth_rate_limits"]
        self.secret = secret.encode("utf-8")
        self.clock = clock or (lambda: datetime.now(timezone.utc).timestamp())

    def _key(self, action, subject, window):
        bucket = int(self.clock()) // window
        data = f"auth-throttle-v1\0{action}\0{subject}\0{bucket}".encode("utf-8")
        return hmac.new(self.secret, data, hashlib.sha256).hexdigest(), (bucket + 1) * window

    def _increment(self, action, subject, window):
        key, end = self._key(action, subject, window)
        try:
            row = self.collection.find_one_and_update({"_id": key},
                {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": datetime.fromtimestamp(end + 60, timezone.utc)}},
                upsert=True, return_document=ReturnDocument.AFTER)
            return row, end
        except PyMongoError:
            raise HTTPException(503, "Authentication protection is temporarily unavailable. Please try again.") from None

    def consume(self, action, subject, limit, window):
        row, end = self._increment(action, subject, window)
        if row["count"] > limit:
            self._deny(end - self.clock())

    @staticmethod
    def _deny(seconds):
        logger.warning("auth_event=rate_limited")
        raise HTTPException(429, "Too many attempts. Please try again later.",
            headers={"Retry-After": str(max(1, math.ceil(seconds)))})

    def registration(self, email, ip):
        self.consume("register-ip", ip, 20, 3600)
        self.consume("register-account", email, 5, 3600)

    def login(self, email, ip):
        self.consume("login-ip", ip, 120, 60)
        self.consume("login-account", email, 30, 900)
        key, _ = self._key("login-failures", email, 900)
        try:
            row = self.collection.find_one({"_id": key})
        except PyMongoError:
            raise HTTPException(503, "Authentication protection is temporarily unavailable.") from None
        if row and row.get("retry_at", 0) > self.clock():
            self._deny(row["retry_at"] - self.clock())

    def failed_login(self, email):
        row, _ = self._increment("login-failures", email, 900)
        delay = min(60, 2 ** min(6, max(0, row["count"] - 3))) if row["count"] >= 3 else 0
        try:
            self.collection.update_one({"_id": row["_id"], "count": row["count"]},
                {"$max": {"retry_at": self.clock() + delay}})
        except PyMongoError:
            raise HTTPException(503, "Authentication protection is temporarily unavailable.") from None
        logger.warning("auth_event=login_failed")

    def successful_login(self, email):
        key, _ = self._key("login-failures", email, 900)
        try:
            self.collection.delete_one({"_id": key})
        except PyMongoError:
            raise HTTPException(503, "Authentication protection is temporarily unavailable.") from None

    def password_change(self, user_id, ip):
        self.consume("password-change-ip", ip, 30, 900)
        self.consume("password-change-user", str(user_id), 10, 900)


def get_auth_limiter(db):
    # The production application already requires MongoDB. No in-process fallback
    # that could silently bypass limits on multiple workers/restarts is provided.
    if not hasattr(db, "database"):
        raise HTTPException(503, "Persistent authentication protection is unavailable.")
    return MongoAuthLimiter(db.database, get_settings().jwt_secret_key)
