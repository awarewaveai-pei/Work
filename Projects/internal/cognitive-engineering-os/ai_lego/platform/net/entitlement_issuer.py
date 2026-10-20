"""The permit issuer seam (ADR 017 §4): COS asks next-admin ``POST /api/internal/entitlements/permit/cognitive`` for a
signed permit when a request carries no ``X-AwareWave-Permit``. The answer is only a candidate: check.py verifies it
against the public keys and this request's binding before trusting or keeping it.

Traps for future readers:
- Goes through ``egress.fetch_json`` like every other outbound call (https only, host on the runtime allowlist; the
  public ``https://app.aware-wave.com`` is the address, same as collection_service.py).
- An HTTP error raises (ENTITLEMENT_ISSUER_UNAVAILABLE): the caller reads that as an infrastructure error, never a refusal.
"""

from __future__ import annotations

from typing import Any, Callable

from ai_lego.platform.net.egress import fetch_json

TIMEOUT_SECONDS = 5.0


def request_permit(base_url: str, token: str, product_key: str, organization_id: str, feature_key: str, actor: str, *,
                   fetch: Callable[..., dict[str, Any]] = fetch_json) -> dict[str, Any]:
    """``{"allowed": true, "permit": ...}`` or ``{"allowed": false, "reason": ...}`` as next-admin answered it."""
    return fetch(f"{base_url.rstrip('/')}/api/internal/entitlements/permit/{product_key}", TIMEOUT_SECONDS, method="POST",
                 headers={"Authorization": f"Bearer {token}"},
                 body={"organization_id": organization_id, "feature_key": feature_key, "actor": actor},
                 error_prefix="ENTITLEMENT_ISSUER")
