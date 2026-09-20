from dataclasses import asdict
from datetime import date
from decimal import Decimal
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from app.demo import DemoStore
from app.domain.transaction import Transaction, TransactionType


class PurchaseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: str = Field(max_length=32)


class TransactionInput(PurchaseInput):
    category: str = Field(min_length=1, max_length=40)
    transaction_type: TransactionType
    transaction_date: date
    note: str = Field(default="", max_length=160)


def encode(value):
    # Currency travels as decimal strings so JSON never introduces float rounding.
    return jsonable_encoder(value, custom_encoder={Decimal: lambda x: format(x, ".2f")})


def create_app():
    app = FastAPI(title="Personal Finance Manager - Iteration 1")
    store = DemoStore()

    @app.get("/api/demo")
    def get_demo():
        return encode(store.snapshot())

    @app.post("/api/transactions", status_code=201)
    def add_transaction(body: TransactionInput):
        try:
            return encode(store.add(Transaction(**body.model_dump())))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/affordability")
    def check_purchase(body: PurchaseInput):
        try:
            return encode(asdict(store.check(body.amount)))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/reset")
    def reset():
        return encode(store.reset())

    # A production build can be served by this same process; no separate web server.
    frontend = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    # backend/app/main.py -> project root is parents[2].
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


app = create_app()
