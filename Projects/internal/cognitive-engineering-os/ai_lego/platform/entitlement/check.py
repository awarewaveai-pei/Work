"""``check_entitlement`` -- the one entitlement question every capability call and every paid model call asks:
the Python thin adapter of next-admin ``lib/entitlements/can.ts`` ``can(subject, feature_key, actor)`` (ADR 017 §4;
customer-model card step 3). Fields per ADR 017 §3; HCI gate positions per ADR-0031.

The answer comes from a control-plane permit (``X-AwareWave-Permit``, verified by ``permit.py``) bound to the
billing account (``on_behalf_of``), ``product_key=cognitive``, the feature key and the actor. ``actor`` only reaches
the audit, never ``allowed``. Contract for the issuer (not built yet): the permit's ``actor`` is
``cognitive:<identity_id>`` (main.py ``require_entitlement``), not next-admin's ``requestActor`` form.

Shadow mode (operator 2026-10-19): ``ENTITLEMENT_MODE`` unset or anything but the exact word ``enforce`` = shadow:
the real verdict is computed, a refusal is logged as ``entitlement.would_deny`` and the call is still allowed;
infrastructure errors (no billing-account mapping, no public keys) log ``entitlement.infra_error`` and allow.
``enforce`` refuses both. Flipping to enforce is High (operator go). A request without the header asks next-admin's
issuer (``_issued_permit``); the answer is still verified here against the public keys and this request's binding.

An inactive or unknown tenant is refused in both modes (identity, not entitlement: unchanged from Phase 1).
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from contextvars import ContextVar
from types import MappingProxyType
from typing import Any, Callable, Mapping, Protocol

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from ai_lego.platform.entitlement.permit import PermitError, verify_permit
from ai_lego.platform.net.entitlement_issuer import request_permit


class IdentityStore(Protocol):
    """What this gate reads from ``ai_lego.platform.identity.store.IdentityStore``. Not imported: the AI gateway imports
    this module, and the CLI AI path must not reach the case repositories (test_block_foundation AiPathTests)."""

    def get_tenant(self, tenant_id: str) -> dict[str, Any] | None: ...

    def record_entitlement_check(self, tenant_id: str, capability_id: str, granted: bool) -> None: ...

PRODUCT_KEY = "cognitive"
PERMIT_HEADER = "X-AwareWave-Permit"
# Set per request by the API's PermitHeaderMiddleware; a check outside a request sees None (= no permit).
current_permit: ContextVar[str | None] = ContextVar("awarewave_permit", default=None)
_log = logging.getLogger("ai_lego.entitlement")


def entitlement_mode(env: Mapping[str, str] | None = None) -> str:
    """Only the exact string "enforce" enforces; unset or any typo stays shadow (same rule as can.ts)."""
    return "enforce" if (os.environ if env is None else env).get("ENTITLEMENT_MODE") == "enforce" else "shadow"


class EntitlementRequired(PermissionError):
    status = 403

    def __init__(self, code: str) -> None:
        super().__init__(f"entitlement_required:{code}")
        self.code = code


_MINT = object()


class Grant:
    """Minted only by ``check_entitlement``; ``AIGateway`` takes one before any external (paid) model call."""

    __slots__ = ("allowed", "shadow", "reason", "feature_key", "subject", "actor", "limits", "max_spend", "source", "entitlement_id")

    def __init__(self, mint: object, *, allowed: bool, shadow: bool, reason: str | None, feature_key: str, subject: str | None, actor: str,
                 limits: dict[str, Any] | None = None, max_spend: float | None = None, source: str | None = None, entitlement_id: str | None = None) -> None:
        if mint is not _MINT:
            raise EntitlementRequired("forged_grant")
        values = {"allowed": allowed, "shadow": shadow, "reason": reason, "feature_key": feature_key, "subject": subject, "actor": actor,
                  "limits": MappingProxyType(dict(limits or {})), "max_spend": max_spend, "source": source, "entitlement_id": entitlement_id}
        for name, value in values.items():
            object.__setattr__(self, name, value)

    def __setattr__(self, name: str, value: Any) -> None:
        # Read-only after minting: `grant.allowed = True` must not get a refused grant past assert_grant.
        raise AttributeError(f"Grant is read-only ({name})")

    __delattr__ = __setattr__


def assert_grant(grant: Any) -> None:
    if not isinstance(grant, Grant):
        raise EntitlementRequired("missing_grant")
    if not grant.allowed:
        raise EntitlementRequired(grant.reason or "denied")


def _pem(text: str, label: str) -> bytes:
    body = text.replace("\\n", "\n").strip()
    return (body if "BEGIN" in body else f"-----BEGIN {label}-----\n{body}\n-----END {label}-----").encode("ascii")


def _public_keys(env: Mapping[str, str]) -> dict[str, Ed25519PublicKey]:
    """``ENTITLEMENT_PUBLIC_KEYS`` = "kid:PEM;kid2:PEM" -- the layout next-admin lib/entitlements/runtime.ts reads."""
    raw = env.get("ENTITLEMENT_PUBLIC_KEYS")
    if not raw:
        raise RuntimeError("entitlement_public_keys_missing")
    keys: dict[str, Ed25519PublicKey] = {}
    for entry in filter(None, (e.strip() for e in raw.split(";"))):
        kid, sep, body = entry.partition(":")
        if not sep or not kid:
            raise RuntimeError("entitlement_public_keys_malformed")
        key = serialization.load_pem_public_key(_pem(body, "PUBLIC KEY"))
        if not isinstance(key, Ed25519PublicKey):
            raise RuntimeError("entitlement_public_keys_malformed")
        keys[kid] = key
    return keys


def _billing_account(tenant_id: str, env: Mapping[str, str]) -> str:
    """``ENTITLEMENT_BILLING_ACCOUNTS`` = "tenant_id=organization_id;..." (next-admin organizations root id). No mapping
    = infrastructure error, not a refusal: the mapping's home (a tenant column) is an enforce prerequisite."""
    for entry in filter(None, (e.strip() for e in (env.get("ENTITLEMENT_BILLING_ACCOUNTS") or "").split(";"))):
        tenant, sep, org = entry.partition("=")
        if sep and tenant.strip() == tenant_id and org.strip():
            return org.strip()
    raise RuntimeError("billing_account_unmapped")


def _event(event: str, tenant_id: str, feature_key: str, actor: str, **payload: Any) -> None:
    _log.warning("[entitlement] %s %s", event, json.dumps({"tenant_id": tenant_id, "feature_key": feature_key, "actor": actor, **payload}, ensure_ascii=False, default=str))


def check_entitlement(store: IdentityStore, tenant_id: str, feature_key: str, actor: str, *, permit: str | None = None,
                      env: Mapping[str, str] | None = None, now: int | None = None) -> Grant:
    """``can(tenant's billing account, feature_key, actor)``. Every check is audited (entitlement_audit, granted = what
    the caller got). ``permit`` defaults to the request's ``X-AwareWave-Permit`` header."""
    environ = os.environ if env is None else env
    tenant = store.get_tenant(tenant_id)
    if tenant is None or tenant["status"] != "active":
        grant = Grant(_MINT, allowed=False, shadow=False, reason="tenant_inactive", feature_key=feature_key, subject=None, actor=actor)
    else:
        grant = _decide(tenant_id, feature_key, actor, current_permit.get() if permit is None else permit, environ, now)
    store.record_entitlement_check(tenant_id, feature_key, grant.allowed)
    return grant


def _decide(tenant_id: str, feature_key: str, actor: str, token: str | None, env: Mapping[str, str], now: int | None) -> Grant:
    enforce = entitlement_mode(env) == "enforce"
    reason: str | None = None
    issued = False
    try:
        org = _billing_account(tenant_id, env)
        keys = _public_keys(env)
        if not token:
            token, reason = _issued_permit(org, feature_key, actor, env)
            issued = token is not None
    except Exception as error:  # noqa: BLE001 -- any config/key/issuer failure is the same infrastructure verdict
        if enforce:
            return Grant(_MINT, allowed=False, shadow=False, reason="infrastructure_error", feature_key=feature_key, subject=None, actor=actor)
        _event("entitlement.infra_error", tenant_id, feature_key, actor, reason="infrastructure_error", error=str(error)[:200])
        return Grant(_MINT, allowed=True, shadow=True, reason="infrastructure_error", feature_key=feature_key, subject=None, actor=actor)
    binding = {"tenant": org, "product_key": PRODUCT_KEY, "feature_key": feature_key, "actor": actor, "on_behalf_of": org}
    if token:
        try:
            payload = verify_permit(token, keys, binding, now)
        except PermitError as error:
            reason = f"invalid_permit:{error}"
        else:
            if issued:   # kept only once it verified for this exact binding
                with _PERMITS_LOCK:
                    _PERMITS[(org, feature_key, actor)] = (token, float(payload["expires_at"]))
            return Grant(_MINT, allowed=True, shadow=False, reason=None, feature_key=feature_key, subject=org, actor=actor, limits=payload["limits"],
                         max_spend=payload["max_spend"], source=payload["source"], entitlement_id=payload["entitlement_id"])
    reason = reason or "no_permit"
    if enforce:
        return Grant(_MINT, allowed=False, shadow=False, reason=reason, feature_key=feature_key, subject=org, actor=actor)
    _event("entitlement.would_deny", tenant_id, feature_key, actor, subject=org, reason=reason)
    return Grant(_MINT, allowed=True, shadow=True, reason=reason, feature_key=feature_key, subject=org, actor=actor)


# The control plane's answer, kept until shortly before the permit expires (permits live <= 600 s). Only allowed
# answers are kept: a purchase must take effect on the next click, not after a cache window.
_PERMITS: dict[tuple[str, str, str], tuple[str, float]] = {}
_PERMITS_LOCK = threading.Lock()
_PERMIT_MARGIN_SECONDS = 30
issuer_request: Callable[..., dict[str, Any]] = request_permit   # tests replace this


def _issued_permit(org: str, feature_key: str, actor: str, env: Mapping[str, str]) -> tuple[str | None, str | None]:
    """(permit, None) or (None, refusal reason) from next-admin POST /api/internal/entitlements/permit/cognitive
    (``ENTITLEMENT_ISSUER_URL`` + ``ENTITLEMENT_ISSUER_TOKEN`` = next-admin's ENTITLEMENT_ISSUER_TOKEN_COGNITIVE). Raises
    on anything that is not an answer (unconfigured, network, 5xx): an infrastructure error, never a refusal."""
    key = (org, feature_key, actor)
    with _PERMITS_LOCK:
        cached = _PERMITS.get(key)
        if cached and cached[1] - _PERMIT_MARGIN_SECONDS > time.time():
            return cached[0], None
    base, bearer = (env.get("ENTITLEMENT_ISSUER_URL") or "").rstrip("/"), env.get("ENTITLEMENT_ISSUER_TOKEN") or ""
    if not base or not bearer:
        raise RuntimeError("entitlement_issuer_unconfigured")
    answer = issuer_request(base, bearer, PRODUCT_KEY, org, feature_key, actor)
    if answer.get("allowed") is True and isinstance(answer.get("permit"), str):
        return answer["permit"], None   # verified (and only then kept) by _decide
    if answer.get("allowed") is False and isinstance(answer.get("reason"), str):
        return None, answer["reason"]
    raise RuntimeError("entitlement_issuer_malformed_answer")
