"""Rebuild public TEST-ONLY vectors using RFC 8032 test seeds, RFC 8785 and Ed25519.

Run from any directory: python <this-file>. The TypeScript suite re-signs every
accepted payload byte-for-byte; Python independently verifies the same tokens.
"""
from __future__ import annotations

import base64
import copy
import json
from pathlib import Path

import rfc8785
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def generate() -> dict:
    # Published RFC 8032 section 7.1 seeds. Never use these keys outside tests.
    seeds = {
        "test-old": "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
        "test-new": "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
    }
    private = {kid: Ed25519PrivateKey.from_private_bytes(bytes.fromhex(seed)) for kid, seed in seeds.items()}
    keys = {kid: {"seed_hex": seeds[kid], "public_key_pem": key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode("ascii")}
        for kid, key in private.items()}
    binding = dict(tenant="tenant-test", product_key="social", feature_key="social.dispatch",
                   actor="staff:test", on_behalf_of="tenant-test")
    payload = dict(**binding, format_version=1, source="contract", entitlement_id="entitlement-test",
                   source_ref="contract-test", limits={"posts": 23, "nested": {"😀": "first", "\ue000": "second"},
                       "numbers": [-0.0, 1e-7, 1e-6, 1e20, 1e21, 1e30, 333333333.33333329, 5e-324],
                       "text": "繁體中文\n\"\\" + chr(1)}, max_spend=None,
                   issued_at=1800000000, expires_at=1800000600, kid="test-old")
    vectors: list[dict] = []

    def signed(p: dict, kid: str = "test-old", body: bytes | None = None) -> str:
        raw = rfc8785.dumps(p) if body is None else body
        return f"{encode(raw)}.{encode(private[kid].sign(raw))}"

    def add(name: str, p: dict, allowed: bool, *, now: int = 1800000020,
            expected: dict | None = None, token: str | None = None, signer: str = "test-old") -> None:
        vector = dict(name=name, token=token or signed(p, signer), now=now,
                      expected=expected or binding, allowed=allowed)
        if allowed:
            vector["payload"] = p
            vector["canonical_utf8"] = rfc8785.dumps(p).decode("utf-8")
        vectors.append(vector)

    add("valid-contract-jcs", payload, True)
    add("valid-rotated-key-comp", dict(payload, source="comp", kid="test-new"), True, signer="test-new")
    add("valid-credits-no-entitlement", dict(payload, source="credits", entitlement_id=None, max_spend=2.5), True)
    add("expired-boundary", payload, False, now=payload["expires_at"])
    add("future", payload, False, now=payload["issued_at"] - 1)
    add("unknown-kid", dict(payload, kid="test-missing"), False)
    add("forged-key", payload, False, signer="test-new")
    add("changed-one-byte", payload, False, token=signed(payload).replace(
        encode(rfc8785.dumps(payload)), encode(rfc8785.dumps(dict(payload, source_ref="contract-tesu")))))
    add("unknown-version", dict(payload, format_version=2), False)
    add("ttl-over-600", dict(payload, expires_at=payload["issued_at"] + 601), False)
    add("zero-ttl", dict(payload, expires_at=payload["issued_at"]), False)
    add("fractional-time", dict(payload, issued_at=1800000000.5), False)
    add("boolean-time", dict(payload, issued_at=True), False)
    add("mismatched-tenant", dict(payload, on_behalf_of="another-tenant"), False)
    add("missing-entitlement", dict(payload, entitlement_id=None), False)
    add("contract-credit-cap", dict(payload, max_spend=1), False)
    add("credit-entitlement", dict(payload, source="credits", max_spend=1), False)
    add("zero-credit-cap", dict(payload, source="credits", entitlement_id=None, max_spend=0), False)
    add("boolean-credit-cap", dict(payload, source="credits", entitlement_id=None, max_spend=True), False)
    add("unknown-field", dict(payload, unrelated=True), False)
    add("noncanonical-whitespace", payload, False, token=signed(payload, body=json.dumps(payload, ensure_ascii=False).encode()))
    add("duplicate-field", payload, False, token=signed(payload, body=rfc8785.dumps(payload).replace(
        b'"format_version":1', b'"format_version":1,"format_version":1')))
    token = signed(payload)
    body, sig = token.split(".")
    add("padded-base64", payload, False, token=body + "=." + sig)
    add("short-signature", payload, False, token=body + "." + encode(bytes(63)))
    for field in binding:
        expected = copy.copy(binding)
        expected[field] += "-different"
        add("binding-" + field, payload, False, expected=expected)
    return dict(format="awarewave-permit-v1-test-vectors", test_only=True, keys=keys, vectors=vectors)


if __name__ == "__main__":
    output = Path(__file__).with_name("vectors.json")
    output.write_text(json.dumps(generate(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {output.name}")
