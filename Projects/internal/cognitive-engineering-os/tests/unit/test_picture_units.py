"""Picture units (ai_lego/modules/research/picture_units.py): each tool lists the units its picture draws, with the
manifest ids readings use; a record its picture cannot draw lists none."""

from __future__ import annotations

import json
import unittest

from ai_lego.modules.research.interpret_method_record import build_prompt_manifest
from ai_lego.modules.research.picture_units import picture_units

FISHBONE = {"problem_summary": "分享從 6 人掉到 2 人", "hypotheses": [
    {"id": "H1", "statement": "帶領者先講意義", "category": "人"}, {"id": "H2", "statement": "", "category": "人"},
    {"id": "H3", "statement": "線上場關鏡頭", "category": "環境"}, {"id": "H4", "statement": "分享時間不夠", "category": "人"},
    {"id": "H5", "statement": "沒有分類的原因"}]}
WHYS = {"target_hypothesis_id": "H1", "why_chain": [
    {"step": 2, "question": "為什麼先講？", "answer": "流程表這樣寫"}, {"step": 1, "question": "為什麼變少？", "answer": "帶領者先講"}]}
PARETO = {"metric_name": "沒開口的原因", "causes": [{"hypothesis_id": "H1", "statement": "帶領者先講"}], "ranking": [
    {"hypothesis_id": "H1", "metric_value": 17, "share_of_total_percent": 60.7, "cumulative_share_percent": 60.7},
    {"hypothesis_id": "H2", "metric_value": 11, "share_of_total_percent": 39.3, "cumulative_share_percent": 100}]}
PROBLEM = {"content": {"current_state": "第 6 次只有 2 位分享", "expected_state": "每次至少 5 位", "gap": "少 3 位"}}


class PictureUnits(unittest.TestCase):
    def test_each_tool_lists_the_units_its_picture_draws(self):
        cases = {
            "root_cause.fishbone": (FISHBONE, [("人", ["r/hypotheses/0", "r/hypotheses/3"], 2), ("環境", ["r/hypotheses/2"], 1), ("未分類", ["r/hypotheses/4"], 1)]),
            "root_cause.five_whys": (WHYS, [("為什麼變少？", ["r/why_chain/1"], 1), ("為什麼先講？", ["r/why_chain/0"], 1)]),
            "root_cause.pareto": (PARETO, [("帶領者先講", ["r/ranking/0"], 1), ("H2", ["r/ranking/1"], 1)]),
            "framing.problem_statement": (PROBLEM, [("現況", ["r/content/current_state"], 1), ("期望", ["r/content/expected_state"], 1), ("差距", ["r/content/gap"], 1)]),
        }
        for method_id, (record, want) in cases.items():
            units = picture_units(method_id, record)
            self.assertEqual([(u["label"], u["members"], u["own_statements"]) for u in units], want, method_id)
            ids = {item["id"] for item in build_prompt_manifest(record)}
            for unit in units:   # readings cite the unit's path, so it must be a manifest id the gates accept
                self.assertEqual(unit["path"], unit["members"][0])
                self.assertTrue(set(unit["members"]) <= ids, (method_id, unit))

    def test_no_units_without_a_drawable_record_or_a_registered_picture(self):
        self.assertEqual(picture_units("root_cause.fishbone", {"hypotheses": "x"}), [])
        self.assertEqual(picture_units("root_cause.five_whys", {"why_chain": WHYS["why_chain"]}), [])   # no target: chainOf draws nothing
        self.assertEqual(picture_units("root_cause.pareto", {"ranking": [{**PARETO["ranking"][0], "metric_value": 0}]}), [])
        self.assertEqual(picture_units("root_cause.pareto", {"ranking": [PARETO["ranking"][0], {"hypothesis_id": "H2"}]}), [])
        self.assertEqual(picture_units("framing.problem_statement", {"content": {"current_state": "x"}}), [])
        self.assertEqual(picture_units("systems.iceberg_model", {"events": ["x"]}), [])   # its units are its form fields
        self.assertEqual(picture_units("root_cause.fishbone", FISHBONE, language="en")[-1]["label"], "Uncategorized")

    def test_a_blank_question_or_id_still_names_its_unit(self):
        # Codex 2026-10-15 F1/F2: the record schemas allow "" here; an empty label failed the interpretation schema
        blank_why = {"target_hypothesis_id": "H1", "why_chain": [{"step": 1, "question": " ", "answer": ""}]}
        blank_bar = {"ranking": [{**PARETO["ranking"][0], "hypothesis_id": ""}]}
        self.assertEqual([u["label"] for u in picture_units("root_cause.five_whys", blank_why)], ["第 1 項"])
        self.assertEqual([u["label"] for u in picture_units("root_cause.pareto", blank_bar)], ["第 1 項"])

    def test_readings_sit_on_their_unit_one_per_unit(self):
        from ai_lego.modules.research.picture_units import place_readings
        units = picture_units("root_cause.fishbone", FISHBONE)
        interpretation = {"picture_units": units, "units": [{"path": "r/hypotheses/3", "meaning": "a"}, {"path": "r/hypotheses/0", "meaning": "b"}, {"path": "r/problem_summary", "meaning": "c"}]}
        removed, repaired = place_readings(interpretation)
        self.assertEqual([(r["path"], r["meaning"]) for r in interpretation["units"]], [("r/hypotheses/0", "a"), ("r/problem_summary", "c")])
        self.assertEqual(len(removed["units"]), 1)   # Codex F3: the second reading of 人 is said, not dropped silently
        self.assertEqual(len(repaired["units"]), 1)


class PictureUnitsInTheInterpretation(unittest.TestCase):
    """The prompt lists the units for the model, and the server stores them with the interpretation (never the model's)."""

    def run_fishbone(self, answer: dict):
        from ai_lego import resolve_spec_root
        from ai_lego.core.contracts.schema_contracts import SchemaContracts
        from ai_lego.modules.research.interpret_method_record import run_interpretation
        from tests.unit.test_interpret_method_record import FakeProvider
        provider = FakeProvider([json.dumps(answer)])
        result = run_interpretation(method_id="root_cause.fishbone", contract={"family": "root_cause", "purpose": ["explain"], "recommended_next": []}, display={}, record=FISHBONE, sources=[],
                                    provider=provider, spec_root=resolve_spec_root(), schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids=set(), interpretation_id="INTERP-UNITS-001")
        return provider, result

    def test_listed_in_the_prompt_and_stored_by_the_server(self):
        answer = {"findings": [{"id": "F1", "title": "人", "text": "帶領者先講意義。", "citations": ["r/hypotheses/0/statement"], "confidence": {"level": "mid", "reason": "一條假設"}}],
                  "visual": {"kind": "table", "bindings": {"rows": "r/hypotheses", "columns": "r/hypotheses/0"}}, "next_methods": [], "next_steps": [], "recommendations": [], "gaps": [],
                  "picture_units": [{"path": "r/x", "label": "made up", "members": ["r/x"], "own_statements": 9}]}   # the model's own list is never kept
        provider, result = self.run_fishbone(answer)
        prompt = provider.requests[0][1]
        self.assertIn("PICTURE UNITS (what this tool", prompt)
        self.assertIn("[r/hypotheses/0] 人 (covers r/hypotheses/0, r/hypotheses/3)", prompt)
        self.assertIsNotNone(result["interpretation"], result.get("error"))
        self.assertEqual(result["interpretation"]["picture_units"], picture_units("root_cause.fishbone", FISHBONE))

    def test_a_tool_without_picture_units_stores_none(self):
        from tests.unit.test_interpret_method_record import CONTRACT, RECORD, FakeProvider, valid_response
        from ai_lego import resolve_spec_root
        from ai_lego.core.contracts.schema_contracts import SchemaContracts
        from ai_lego.modules.research.interpret_method_record import run_interpretation
        provider = FakeProvider([valid_response()])
        result = run_interpretation(method_id="systems.iceberg_model", contract=CONTRACT, display={}, record=RECORD, sources=[], provider=provider, spec_root=resolve_spec_root(),
                                    schema_contracts=SchemaContracts(resolve_spec_root()), active_method_ids={"systems.leverage_point_analysis"}, interpretation_id="INTERP-UNITS-002")
        self.assertNotIn("PICTURE UNITS (what this tool", provider.requests[0][1])
        self.assertNotIn("picture_units", result["interpretation"])


if __name__ == "__main__":
    unittest.main()
