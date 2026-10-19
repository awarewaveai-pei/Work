"""ADR 017 v1 permit verification. Keys and authenticated request binding come from the control plane.

This intentionally does not use core.support.canonical_json: UTF-16 sorting and ECMAScript
number serialization are required to verify bytes signed by JavaScript.
"""
from __future__ import annotations

import base64
import json
import math
import re
import time
from typing import Any, Mapping

import rfc8785
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


class PermitError(ValueError):
    pass


_FIELDS = frozenset(("format_version", "tenant", "product_key", "feature_key", "source", "entitlement_id", "source_ref", "limits", "max_spend", "actor", "on_behalf_of", "issued_at", "expires_at", "kid"))
_BINDINGS = ("tenant", "product_key", "feature_key", "actor", "on_behalf_of")


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value)


def _number(value: Any) -> bool:
    return type(value) in (int, float) and math.isfinite(value)


def _integer(value: Any) -> bool:
    return _number(value) and value == int(value) and abs(value) <= 9007199254740991


def _decode(value: str) -> bytes:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise PermitError("invalid_token")
    raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    if base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") != value:
        raise PermitError("invalid_token")
    return raw


def verify_permit(token: str, public_keys: Mapping[str, str | Ed25519PublicKey], expected: Mapping[str, str], now: int | None = None) -> dict[str, Any]:
    """Return a validated payload or raise PermitError; all five expected binding fields are mandatory."""
    try:
        if not isinstance(token, str) or len(token) > 65536 or token.count(".") != 1:
            raise PermitError("invalid_token")
        body, signature = (_decode(part) for part in token.split("."))
        if len(signature) != 64:
            raise PermitError("invalid_token")
        # Parse integers as binary64 too: RFC 8785's number domain is ECMAScript, including 1e21.
        payload = json.loads(body.decode("utf-8"), parse_int=float)
        if not isinstance(payload, dict) or set(payload) != _FIELDS:
            raise PermitError("invalid_payload")
        if type(payload["format_version"]) not in (int, float) or payload["format_version"] != 1:
            raise PermitError("unknown_version")
        if not all(_text(payload[k]) for k in (*_BINDINGS, "kid")) or payload["tenant"] != payload["on_behalf_of"]:
            raise PermitError("tenant_binding")
        if payload["source"] not in ("contract", "comp", "credits") or not isinstance(payload["limits"], dict):
            raise PermitError("invalid_payload")
        if payload["source_ref"] is not None and not _text(payload["source_ref"]):
            raise PermitError("invalid_payload")
        if payload["source"] == "credits":
            if payload["entitlement_id"] is not None or not _number(payload["max_spend"]) or payload["max_spend"] <= 0:
                raise PermitError("invalid_credit_grant")
        elif not _text(payload["entitlement_id"]) or payload["max_spend"] is not None:
            raise PermitError("invalid_contract_grant")
        issued, expires = payload["issued_at"], payload["expires_at"]
        if not _integer(issued) or not _integer(expires) or issued < 0 or not 0 < expires - issued <= 600:
            raise PermitError("invalid_lifetime")
        if rfc8785.dumps(payload) != body:
            raise PermitError("non_canonical_payload")
        key = public_keys.get(payload["kid"])
        if key is None:
            raise PermitError("unknown_kid")
        if isinstance(key, str):
            key = serialization.load_pem_public_key(key.encode("ascii"))
        if not isinstance(key, Ed25519PublicKey):
            raise PermitError("invalid_public_key")
        key.verify(signature, body)
        at = int(time.time()) if now is None else now
        if not _integer(at) or issued > at or expires <= at:
            raise PermitError("expired_or_future")
        if any(not _text(expected.get(k)) or payload[k] != expected[k] for k in _BINDINGS):
            raise PermitError("binding_mismatch")
        return payload
    except PermitError:
        raise
    except (ValueError, TypeError, UnicodeError, OverflowError, InvalidSignature, rfc8785.CanonicalizationError) as exc:
        raise PermitError("invalid_permit") from exc
