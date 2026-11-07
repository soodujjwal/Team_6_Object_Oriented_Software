"""Bound CPU/memory-intensive password work on the small Render instance."""
from contextlib import contextmanager
from threading import BoundedSemaphore
from fastapi import HTTPException

_slots = BoundedSemaphore(2)


@contextmanager
def password_work():
    if not _slots.acquire(blocking=False):
        raise HTTPException(503, "Authentication is busy. Please try again shortly.", headers={"Retry-After": "2"})
    try:
        yield
    finally:
        _slots.release()
