"""``business-plan-full-v1`` -- the complete Master Plan §43 chain (17 nodes), run end to end through the API.

Proves the two new cross-step dataflows: NPV's cash flows/discount rate come FROM outputs.financial_assumptions,
and the proposal artifact lists the ids of every record it was composed from.
"""

from __future__ import annotations

import unittest
import uuid

from ai_lego.apps.cli.run_financial_assumptions_slice import fixture_args as finassum_args
from ai_lego.apps.cli.run_market_analysis_slice import fixture_args as market_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.strategy.proposal_artifact import proposal_artifact_adapter
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore
from tests.unit.test_api_main import ApiTestCase, business_planning_review_source

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
EV = make_provenance("EVIDENCE", "HUMAN_APPROVED")


def full_source() -> dict:
    source = business_planning_review_source()
    for key in ("tco", "unit_economics", "break_even"):
        source.pop(key, None)
    mk, fa = market_args()[0], finassum_args()[0]
    source["market"] = {"record_id": mk[0], "market_definition": mk[1], "sizing": mk[2], "segments": mk[3], "provenance": EV}
    source["competitors"] = {
        "analysis_id": "3C-API-001",
        "findings": [
            {"finding_id": "F1", "dimension": "CUSTOMER", "statement": "助人工作者要可帶回職場的工具", "provenance": EV},
            {"finding_id": "F2", "dimension": "COMPETITOR", "statement": "既有課程偏理論、無作品產出", "provenance": EV},
            {"finding_id": "F3", "dimension": "COMPANY", "statement": "我們有 8 年帶團體經驗與作品庫", "provenance": EV},
        ],
        "fit_summary": "以作品導向的實作課切入助人工作者進修市場",
    }
    source["financial_assumptions"] = {"record_id": fa[0], "subject_ref": fa[1], "currency": fa[2], "discount_rate": fa[3], "horizon_years": fa[4], "assumptions": fa[5], "cash_flow_projection": fa[6], "provenance": EV}
    source["npv"] = {"record_id": "NPV-API-FULL-001", "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED")}
    source["kpi"] = {
        "record_id": "OKR-API-FULL-001",
        "objective": "2027 上半年建立穩定的助人工作者進修班",
        "key_results": [
            {"id": "KR1", "description": "開 4 梯", "target": "4 梯", "owner": "operator", "provenance": P},
            {"id": "KR2", "description": "每梯 ≥ 10 人", "target": "10", "owner": "operator", "provenance": P},
        ],
        "review_cadence": "每月",
        "provenance": P,
    }
    source["execution_plan"] = {
        "record_id": "OROAD-API-FULL-001",
        "themes": [{"theme_id": "TH1", "name": "課程"}],
        "outcomes": [{"outcome_id": "OC1", "theme_id": "TH1", "description": "第一梯滿班"}],
        "bets": [{"bet_id": "B1", "outcome_id": "OC1", "description": "先做 2 場免費體驗", "evidence": ["過去體驗轉換率 30%"]}],
        "next_review": "2026-12-01",
        "provenance": P,
    }
    return source


class BusinessPlanFullRecipeTests(ApiTestCase):
    def test_full_chain_runs_and_npv_binds_from_financial_assumptions(self):
        self._login()
        response = self.client.post("/recipes/business-plan-full-v1/run", json={"source": full_source(), "run_id": "api-business-full-test"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS", payload.get("workflow", {}).get("steps"))
        steps = payload["workflow"]["steps"]
        self.assertEqual(len(steps), 17)
        self.assertEqual(steps[-1]["ref"], "artifact.generate_proposal")
        outputs = payload["workflow"]["context"]["outputs"]
        npv = outputs["net_present_value_analysis"]
        fin = outputs["financial_assumptions"]
        self.assertEqual(npv["discount_rate"], fin["discount_rate"])
        self.assertEqual([cf["amount"] for cf in npv["cash_flows"]], [cf["amount"] for cf in fin["cash_flow_projection"]])
        artifact = outputs["proposal"]["artifact"]
        self.assertEqual(artifact["artifact_type"], "BusinessProposalArtifact")
        content = artifact["content"]
        self.assertNotIn("None", content)
        self.assertIn(outputs["problem_statement"]["content"]["gap"], content)
        self.assertIn(f"discount rate {fin['discount_rate']}", content)
        self.assertIn("KR1: 開 4 梯 -> 4 梯", content)
        self.assertIn(f"NPV ({npv['id']}): {npv['npv']}", content)
        self.assertEqual(artifact["sources"]["npv"], npv["id"])
        self.assertEqual(artifact["sources"]["market_analysis"], outputs["market_analysis"]["id"])

        # OQ-PROPOSAL-1 (answered 2026-09-17): the artifact is ALSO CAS-persisted, not only returned inline.
        reference = artifact["cas_reference"]
        self.assertEqual(reference["artifact_type"], "BusinessProposalArtifact")
        self.assertEqual(reference["tenant_id"], self.tenant["tenant_id"])
        read_back = self.client.post("/artifacts/read", json={"reference": reference})
        self.assertEqual(read_back.status_code, 200, read_back.text)
        self.assertEqual(read_back.json(), {k: v for k, v in artifact.items() if k != "cas_reference"})

    def test_artifact_read_is_tenant_isolated_and_rejects_a_tampered_reference(self):
        """A reference from another tenant, or one whose content_sha256 no longer matches, is refused (404) --
        never silently substituted with a different tenant's or a stale artifact."""
        self._login()
        response = self.client.post("/recipes/business-plan-full-v1/run", json={"source": full_source(), "run_id": "api-business-full-cas-isolation"})
        self.assertEqual(response.status_code, 200, response.text)
        reference = response.json()["workflow"]["context"]["outputs"]["proposal"]["artifact"]["cas_reference"]

        other_store = IdentityStore(self.db_path)
        other_tenant = other_store.create_tenant(tenant_id=str(uuid.uuid4()), legal_name="Other", home_jurisdiction="jurisdiction-pack.tw.v1", data_residency_region="local-dev", encryption_root_key_ref="other-kek")
        other_store.create_workspace(str(uuid.uuid4()), other_tenant["tenant_id"], "Default")
        other_store.create_identity(str(uuid.uuid4()), other_tenant["tenant_id"], "other@example.com", "Other", "correct-horse-battery")
        other_login = self.client.post("/auth/login", json={"tenant_id": other_tenant["tenant_id"], "email": "other@example.com", "password": "correct-horse-battery"})
        self.assertEqual(other_login.status_code, 200, other_login.text)
        cross_tenant_read = self.client.post("/artifacts/read", json={"reference": reference})
        self.assertEqual(cross_tenant_read.status_code, 404, cross_tenant_read.text)

        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "user@example.com", "password": "correct-horse-battery"})
        tampered = dict(reference, content_sha256="0" * 64)
        tampered_read = self.client.post("/artifacts/read", json={"reference": tampered})
        self.assertEqual(tampered_read.status_code, 404, tampered_read.text)

    def test_proposal_adapter_fails_closed_on_a_missing_upstream_record(self):
        with self.assertRaisesRegex(InvariantViolation, "PROPOSAL_FIELD_MISSING"):
            proposal_artifact_adapter({k: {"id": k} for k in ("problem_statement", "market_analysis", "swot", "strategy_options", "financial_assumptions", "npv", "risk_register", "okr", "roadmap")}, {})
        with self.assertRaisesRegex(InvariantViolation, "PROPOSAL_INPUT_REQUIRED: npv"):
            proposal_artifact_adapter({k: {} for k in ("problem_statement", "market_analysis", "swot", "strategy_options", "financial_assumptions", "risk_register", "okr", "roadmap")}, {})


if __name__ == "__main__":
    unittest.main()
