"""The same bytes TypeScript signs and verifies, including adversarial vectors."""
from __future__ import annotations

import base64
import json
from pathlib import Path
import unittest

import rfc8785
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ai_lego.platform.entitlement.permit import PermitError, verify_permit


def _fixture() -> dict:
    for parent in Path(__file__).resolve().parents:
        path = parent / "lobster-factory/packages/contracts/fixtures/permit-v1/vectors.json"
        if path.is_file():
            # The fixture payload number domain matches JSON.parse in JavaScript.
            return json.loads(path.read_text(encoding="utf-8"), parse_int=float)
    raise AssertionError("shared permit-v1 vectors missing from repository")


FIXTURE = _fixture()
PUBLIC_KEYS = {kid: key["public_key_pem"] for kid, key in FIXTURE["keys"].items()}


def _assert_shared_vector(vector: dict) -> None:
    if not vector["allowed"]:
        with unittest.TestCase().assertRaises(PermitError):
            verify_permit(vector["token"], PUBLIC_KEYS, vector["expected"], vector["now"])
        return
    payload = verify_permit(vector["token"], PUBLIC_KEYS, vector["expected"], vector["now"])
    assert payload == vector["payload"]
    canonical = rfc8785.dumps(payload)
    assert canonical.decode("utf-8") == vector["canonical_utf8"]
    key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(FIXTURE["keys"][payload["kid"]]["seed_hex"]))
    encode = lambda b: base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")
    assert f"{encode(canonical)}.{encode(key.sign(canonical))}" == vector["token"]


class TestPermitVectors(unittest.TestCase):
    def test_public_test_keys_only(self) -> None:
        self.assertIs(FIXTURE["test_only"], True)

    def test_retiring_old_key_rejects_old_permit(self) -> None:
        vector = FIXTURE["vectors"][0]
        with self.assertRaisesRegex(PermitError, "unknown_kid"):
            verify_permit(vector["token"], {"test-new": PUBLIC_KEYS["test-new"]}, vector["expected"], vector["now"])


# The shipping image gate uses unittest; the card uses pytest. Both must collect every vector.
def _case(vector: dict):
    def test(self: TestPermitVectors) -> None:
        _assert_shared_vector(vector)
    return test


for _vector in FIXTURE["vectors"]:
    setattr(TestPermitVectors, "test_" + _vector["name"].replace("-", "_"), _case(_vector))
