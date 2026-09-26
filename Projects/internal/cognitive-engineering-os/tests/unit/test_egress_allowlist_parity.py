"""The runtime egress allowlist (docker-compose.yml) never exceeds the policy (network-egress.yaml EGRESS-EC99-2).

Two places hold the same list (RESEARCH_LINES_MASTER_PLAN §3.3 Egress allowlist, K1); this test is what keeps them one fact.
"""

from __future__ import annotations

import unittest

import yaml

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.platform.net.egress import EGRESS_ALLOWLIST_ENV, egress_allowlist


def _compose_allowlist() -> frozenset[str]:
    compose = yaml.safe_load((PRODUCT_ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    entries = compose["services"]["cognitive-os-api"]["environment"]
    values = dict(entry.split("=", 1) for entry in entries if isinstance(entry, str) and "=" in entry)
    return egress_allowlist({EGRESS_ALLOWLIST_ENV: values[EGRESS_ALLOWLIST_ENV]})


def _policy_allowlist() -> frozenset[str]:
    policy = yaml.safe_load((resolve_spec_root() / "policies" / "ai-execution" / "network-egress.yaml").read_text(encoding="utf-8"))
    rules = [rule for rule in policy["seed_content"]["rules"] if rule["rule_id"] == "EGRESS-EC99-2"]
    return frozenset(host.lower() for host in rules[0]["allowlist"])


class EgressAllowlistParityTests(unittest.TestCase):
    def test_every_runtime_host_is_in_the_policy(self):
        runtime = _compose_allowlist()
        self.assertTrue(runtime, "compose allowlist parsed empty -- the guard would guard nothing")
        self.assertLessEqual(runtime, _policy_allowlist())

    def test_the_collection_service_host_is_allowed_in_both_places(self):
        self.assertIn("app.aware-wave.com", _compose_allowlist())
        self.assertIn("app.aware-wave.com", _policy_allowlist())


if __name__ == "__main__":
    unittest.main()
