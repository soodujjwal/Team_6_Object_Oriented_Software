"""Final server-side policy. Passwords never leave this backend in plaintext."""
import hashlib
import hmac
import re
from threading import Lock

import httpx
from fastapi import HTTPException
from zxcvbn import zxcvbn
from zxcvbn import matching
from app.core.password_work import password_work

MIN_PASSWORD_LENGTH = 15
MAX_PASSWORD_LENGTH = 128
_RANGE_LINE = re.compile(r"^([A-F0-9]{35}):([0-9]{1,12})$")
_estimator_lock = Lock()


def personal_words(name: str, email: str, phone: str = "") -> list[str]:
    return list(dict.fromkeys(word.casefold() for word in
        [name, email, phone, *re.split(r"[\W_]+", f"{name} {email} {phone}")] if len(word) >= 3))


def check_breached_password(password: str) -> None:
    # SHA-1 is only HIBP's lookup fingerprint, never a stored password hash.
    digest = hashlib.sha1(password.encode("utf-8"), usedforsecurity=False).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]
    try:
        # No identity, password, suffix or complete hash is transmitted. Do not
        # follow redirects or silently fall back to accepting unchecked secrets.
        with httpx.stream("GET", f"https://api.pwnedpasswords.com/range/{prefix}",
                headers={"Add-Padding": "true", "User-Agent": "FinanceBuilder-PasswordCheck"},
                timeout=httpx.Timeout(5.0), follow_redirects=False) as response:
            response.raise_for_status()
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > 256_000:
                    raise ValueError("Oversized breach response")
                chunks.append(chunk)
        lines = b"".join(chunks).decode("ascii").splitlines()
        if not lines:
            raise ValueError("Empty breach response")
        found = False
        for line in lines:
            match = _RANGE_LINE.fullmatch(line)
            if not match:
                raise ValueError("Malformed breach response")
            if hmac.compare_digest(match[1], suffix) and int(match[2]) > 0:
                found = True
    except (httpx.HTTPError, ValueError, UnicodeError):
        raise HTTPException(503, "We couldn't safely check this password right now. Please try again shortly.",
            headers={"Retry-After": "30"}) from None
    if found:
        raise HTTPException(400, "This password has appeared in a data breach. Choose a different, unique passphrase.")


def validate_new_password(password: str, *, name: str, email: str, phone: str = "", confirmation: str | None = None) -> None:
    # No trimming, normalization or truncation: hash exactly what the user chose.
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise HTTPException(400, "Use between 15 and 128 characters. Spaces and Unicode are welcome.")
    if confirmation is not None and not hmac.compare_digest(password.encode("utf-8"), confirmation.encode("utf-8")):
        raise HTTPException(400, "Passwords do not match.")
    with password_work(), _estimator_lock:
        # This maintained Python port temporarily mutates a global user-input
        # dictionary. Serialize it and remove personal words after each check.
        try:
            result = zxcvbn(password, user_inputs=personal_words(name, email, phone), max_length=MAX_PASSWORD_LENGTH)
        finally:
            matching.RANKED_DICTIONARIES.pop("user_inputs", None)
    if result["score"] < 3:
        raise HTTPException(400, "Choose a stronger password: try several unrelated words and avoid your name, email, common phrases or repeated patterns.")
    check_breached_password(password)
