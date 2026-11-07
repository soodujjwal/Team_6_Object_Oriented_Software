from types import SimpleNamespace
import pytest
from app.api.plaid import LinkTokenRequest
from app.services.plaid_service import PlaidService


def test_native_token_uses_fixed_package_and_web_token_keeps_existing_payload():
    calls = []
    client = SimpleNamespace(post=lambda path, payload: calls.append((path, payload)) or {"link_token": "synthetic-link-token"})
    service = PlaidService(SimpleNamespace(), client)
    assert service.create_link_token(37, android=True)["link_token"] == "synthetic-link-token"
    assert calls[-1][1]["android_package_name"] == "financebuilder.app.com"
    assert calls[-1][1]["user"] == {"client_user_id": "37"}
    assert calls[-1][1]["products"] == ["transactions"]
    assert "redirect_uri" not in calls[-1][1]
    service.create_link_token(37)
    assert "android_package_name" not in calls[-1][1]


def test_platform_request_preserves_old_clients_and_rejects_arbitrary_platforms():
    assert LinkTokenRequest().platform == "web"
    assert LinkTokenRequest(platform="android").platform == "android"
    with pytest.raises(ValueError):
        LinkTokenRequest(platform="arbitrary-package")
