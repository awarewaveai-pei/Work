"""Tests for ``ai_lego.platform.entitlement.check.check_entitlement`` -- the Python ``can()`` adapter (ADR 017 §4)."""

from __future__ import annotations

import base64
import time
import unittest
import uuid

import rfc8785
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from unittest import mock

from ai_lego.platform.entitlement import check
from ai_lego.platform.entitlement.check import PRODUCT_KEY, Grant, check_entitlement, current_permit, entitlement_mode
from ai_lego.platform.identity.store import IdentityStore
from tests.pg import PgTestCase

ORG = "11111111-1111-4111-8111-111111111111"
ACTOR = "cognitive:person-1"
FEATURE = "experiment.mvp"
KEY = Ed25519PrivateKey.generate()
PUBLIC_PEM = KEY.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode("ascii")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _permit(org: str = ORG, feature: str = FEATURE, actor: str = ACTOR, **override) -> str:
    now = int(time.time())
    payload = {"format_version": 1, "tenant": org, "product_key": PRODUCT_KEY, "feature_key": feature, "source": "contract", "entitlement_id": "ent-1",
               "source_ref": None, "limits": {"runs": 5}, "max_spend": None, "actor": actor, "on_behalf_of": org, "issued_at": now - 1, "expires_at": now + 300, "kid": "k1"}
    payload.update(override)
    body = rfc8785.dumps(payload)
    return f"{_b64(body)}.{_b64(KEY.sign(body))}"


class CheckEntitlementTests(PgTestCase):
    REGION = "local-dev"

    def setUp(self):
        self.store = IdentityStore(self.databases)
        self.tenant = self._make_tenant()
        self.env = {"ENTITLEMENT_PUBLIC_KEYS": f"k1:{PUBLIC_PEM}".replace("\n", "\\n"), "ENTITLEMENT_BILLING_ACCOUNTS": f"other=x;{self.tenant}={ORG}",
                    "ENTITLEMENT_ISSUER_URL": "https://app.example.test", "ENTITLEMENT_ISSUER_TOKEN": "issuer-token"}
        check._PERMITS.clear()
        self.issuer = mock.Mock(return_value={"allowed": False, "reason": "no_entitlement"})
        patcher = mock.patch.object(check, "issuer_request", self.issuer)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _make_tenant(self, status: str = "active") -> str:
        tenant_id = str(uuid.uuid4())
        self.store.create_tenant(
            tenant_id=tenant_id,
            legal_name="Test Tenant",
            home_jurisdiction="jurisdiction-pack.tw.v1",
            data_residency_region="local-dev",
            encryption_root_key_ref="test-kek-ref",
        )
        if status != "active":
            with self.databases.for_tenant(tenant_id) as conn:
                conn.execute("UPDATE tenant SET status = %s WHERE tenant_id = %s", (status, tenant_id))
        return tenant_id

    def _check(self, mode: str | None = None, tenant: str | None = None, **kwargs) -> Grant:
        env = {**self.env, **({"ENTITLEMENT_MODE": mode} if mode else {})}
        return check_entitlement(self.store, tenant or self.tenant, FEATURE, ACTOR, env=env, **kwargs)

    def test_an_unset_entitlement_mode_is_shadow_only_the_exact_word_enforce_enforces(self):
        for value, mode in ((None, "shadow"), ("", "shadow"), ("Enforce", "shadow"), ("enforce ", "shadow"), ("shadow", "shadow"), ("enforce", "enforce")):
            self.assertEqual(entitlement_mode({} if value is None else {"ENTITLEMENT_MODE": value}), mode, value)

    def test_a_valid_permit_for_the_billing_account_allows_with_its_limits(self):
        grant = self._check("enforce", permit=_permit())
        self.assertEqual((grant.allowed, grant.shadow, grant.subject, grant.actor, grant.limits, grant.entitlement_id), (True, False, ORG, ACTOR, {"runs": 5}, "ent-1"))

    def test_the_request_header_permit_is_read_from_the_context(self):
        token = current_permit.set(_permit())
        try:
            self.assertTrue(self._check("enforce").allowed)
        finally:
            current_permit.reset(token)
        self.assertEqual(self._check("enforce").reason, "no_entitlement")

    def test_the_api_middleware_hands_the_header_to_a_sync_endpoint(self):
        """Sync routes run in a worker thread: the context variable must cross into it, and not leak to the next request."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from ai_lego.apps.api.main import PermitHeaderMiddleware

        app = FastAPI()
        app.add_middleware(PermitHeaderMiddleware)
        app.get("/seen")(lambda: {"permit": current_permit.get()})
        client = TestClient(app)
        self.assertEqual(client.get("/seen", headers={"X-AwareWave-Permit": "abc.def"}).json(), {"permit": "abc.def"})
        self.assertEqual(client.get("/seen").json(), {"permit": None})

    def test_a_refusing_verdict_still_allows_the_call_in_shadow_and_enforce_refuses_it(self):
        with self.assertLogs("ai_lego.entitlement", "WARNING") as logged:
            shadow = self._check()
        self.assertEqual((shadow.allowed, shadow.shadow, shadow.reason), (True, True, "no_entitlement"))
        self.assertIn("entitlement.would_deny", logged.output[0])
        enforce = self._check("enforce")
        self.assertEqual((enforce.allowed, enforce.reason), (False, "no_entitlement"))

    def test_without_a_header_the_issuer_is_asked_and_its_permit_is_verified_and_kept_until_it_expires(self):
        self.issuer.return_value = {"allowed": True, "permit": _permit()}
        self.assertTrue(self._check("enforce").allowed)
        self.assertTrue(self._check("enforce").allowed)
        self.issuer.assert_called_once()
        self.assertEqual(self.issuer.call_args.args, ("https://app.example.test", "issuer-token", "cognitive", ORG, FEATURE, ACTOR))

    def test_the_issuer_seam_posts_the_binding_with_the_bearer(self):
        from ai_lego.platform.net.entitlement_issuer import request_permit

        fetch = mock.Mock(return_value={"allowed": False, "reason": "no_entitlement"})
        self.assertEqual(request_permit("https://app.example.test/", "t", "cognitive", ORG, FEATURE, ACTOR, fetch=fetch)["reason"], "no_entitlement")
        self.assertEqual(fetch.call_args.args[0], "https://app.example.test/api/internal/entitlements/permit/cognitive")
        self.assertEqual((fetch.call_args.kwargs["method"], fetch.call_args.kwargs["headers"], fetch.call_args.kwargs["body"]),
                         ("POST", {"Authorization": "Bearer t"}, {"organization_id": ORG, "feature_key": FEATURE, "actor": ACTOR}))

    def test_an_issued_permit_for_someone_else_is_refused_and_not_kept(self):
        self.issuer.return_value = {"allowed": True, "permit": _permit(actor="cognitive:someone-else")}
        for _ in range(2):
            self.assertTrue(self._check("enforce").reason.startswith("invalid_permit:"))
        self.assertEqual(self.issuer.call_count, 2)

    def test_an_unreachable_or_unconfigured_issuer_is_an_infrastructure_error(self):
        self.issuer.side_effect = RuntimeError("ENTITLEMENT_ISSUER_UNAVAILABLE: 503")
        self.assertEqual(self._check("enforce").reason, "infrastructure_error")
        with self.assertLogs("ai_lego.entitlement", "WARNING"):
            self.assertTrue(self._check().allowed)
        self.env.pop("ENTITLEMENT_ISSUER_TOKEN")
        self.issuer.side_effect = None
        self.assertEqual(self._check("enforce").reason, "infrastructure_error")

    def test_a_permit_for_another_account_feature_or_actor_is_refused(self):
        for permit in (_permit(org="22222222-2222-4222-8222-222222222222"), _permit(feature="other.feature"), _permit(actor="cognitive:someone-else"),
                       _permit(product_key="social"), _permit(expires_at=int(time.time()) - 1, issued_at=int(time.time()) - 60)):
            grant = self._check("enforce", permit=permit)
            self.assertFalse(grant.allowed)
            self.assertTrue(grant.reason.startswith("invalid_permit:"), grant.reason)

    def test_a_missing_mapping_or_key_still_allows_the_call_in_shadow_and_enforce_refuses_the_same_case(self):
        for broken in ({"ENTITLEMENT_BILLING_ACCOUNTS": ""}, {"ENTITLEMENT_PUBLIC_KEYS": ""}, {"ENTITLEMENT_PUBLIC_KEYS": "k1:not a key"}):
            self.env.update(broken)
            with self.assertLogs("ai_lego.entitlement", "WARNING") as logged:
                shadow = self._check(permit=_permit())
            self.assertEqual((shadow.allowed, shadow.shadow, shadow.reason), (True, True, "infrastructure_error"))
            self.assertIn("entitlement.infra_error", logged.output[0])
            self.assertEqual((self._check("enforce", permit=_permit()).allowed), False)
            self.setUp()

    def test_a_grant_cannot_be_edited_into_an_allowed_one(self):
        denied = self._check("enforce")
        for edit in (lambda: setattr(denied, "allowed", True), lambda: delattr(denied, "reason"), lambda: denied.limits.__setitem__("runs", 9)):
            with self.assertRaises((AttributeError, TypeError)):
                edit()
        self.assertFalse(denied.allowed)

    def test_an_inactive_or_unknown_tenant_is_refused_in_both_modes(self):
        for tenant in (str(uuid.uuid4()), self._make_tenant("suspended"), self._make_tenant("deleted")):
            for mode in (None, "enforce"):
                grant = self._check(mode, tenant=tenant, permit=_permit())
                self.assertEqual((grant.allowed, grant.reason), (False, "tenant_inactive"))

    def test_every_check_is_audited_with_what_the_caller_got(self):
        denied_tenant_id = str(uuid.uuid4())
        self._check()
        self._check(tenant=denied_tenant_id)
        with self.databases.transaction(self.REGION) as conn:
            rows = conn.execute("SELECT tenant_id, granted FROM entitlement_audit WHERE tenant_id IN (%s, %s) ORDER BY id", (self.tenant, denied_tenant_id)).fetchall()
        self.assertEqual([r["granted"] for r in rows], [1, 0])


if __name__ == "__main__":
    unittest.main()
