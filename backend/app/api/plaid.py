import hashlib
import hmac
import time

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jwt import PyJWK
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.plaid_service import PlaidClient, PlaidService

router = APIRouter(prefix="/plaid", tags=["plaid"], dependencies=[Depends(get_current_user)])
webhook_router = APIRouter(prefix="/plaid", tags=["plaid"])


class ExchangeRequest(BaseModel):
    public_token: str = Field(min_length=1)
    metadata: dict | None = None


@router.get("/status")
def plaid_status(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return PlaidService(db).status(user.id)


@router.post("/link-token")
def create_link_token(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return PlaidService(db).create_link_token(user.id)


@router.post("/exchange")
def exchange_public_token(payload: ExchangeRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return PlaidService(db).exchange(user.id, payload.public_token, payload.metadata)


@router.post("/sync")
def sync_transactions(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return PlaidService(db).sync_user(user.id)


@router.post("/refresh", status_code=status.HTTP_202_ACCEPTED)
def refresh_transactions(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return PlaidService(db).request_refresh(user.id)


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(connection_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    PlaidService(db).disconnect(user.id, connection_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@webhook_router.post("/webhook")
async def plaid_webhook(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()
    _verify_webhook(raw_body, request.headers.get("Plaid-Verification"))
    payload = await request.json()
    if payload.get("webhook_type") == "TRANSACTIONS" and payload.get("webhook_code") == "SYNC_UPDATES_AVAILABLE":
        PlaidService(db).sync_by_plaid_item_id(payload.get("item_id", ""))
    return {"received": True}


def _verify_webhook(raw_body: bytes, token: str | None) -> None:
    settings = get_settings()
    if settings.plaid_environment == "sandbox" and not settings.plaid_webhook_url:
        return
    if not token:
        raise HTTPException(401, "Missing Plaid webhook signature.")
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "ES256" or not header.get("kid"):
            raise ValueError("invalid JWT header")
        key_data = PlaidClient().post("/webhook_verification_key/get", {"key_id": header["kid"]})["key"]
        claims = jwt.decode(token, PyJWK.from_dict(key_data).key, algorithms=["ES256"], options={"verify_aud": False})
        if abs(time.time() - float(claims["iat"])) > 300:
            raise ValueError("stale webhook")
        digest = hashlib.sha256(raw_body).hexdigest()
        if not hmac.compare_digest(digest, claims.get("request_body_sha256", "")):
            raise ValueError("body hash mismatch")
    except Exception as error:
        raise HTTPException(401, "Invalid Plaid webhook signature.") from error
