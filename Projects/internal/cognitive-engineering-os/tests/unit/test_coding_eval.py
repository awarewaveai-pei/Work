"""Offline tests for the MP section 70 coding eval: dataset integrity, assertion semantics, metric arithmetic, the
PASS/FAIL rule, consistency, the champion/challenger hard rules. No model is called; the Gateway is scripted. The
real ``gemma3:4b`` run is the CLI ``run_coding_eval`` path."""

from __future__ import annotations

import json
import unittest
from dataclasses import dataclass
from typing import Any, Callable

from ai_lego.core.support import canonical_json, sha256_json
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research import coding_eval as ce
from ai_lego.modules.research.synthetic_fixtures import CODER_TWO_LABELS, SYNTHETIC_TRANSCRIPTS


@dataclass
class _Result:
    text: str
    provider: str = "self-hosted"
    model_identifier: str = "stub"
    model_profile_id: str = "p"
    input_tokens: int = 10
    output_tokens: int = 5
    latency_ms: int = 7
    trace_id: str | None = None
    prompt_version: str | None = None


class _ScriptedGateway:
    """Answers each stage from the prompt it receives; ``script`` maps prompt_version -> callable(prompt, seed) -> text."""

    def __init__(self, script: dict[str, Callable[[str, int | None], str]]) -> None:
        self.script = script
        self.calls: list[dict[str, Any]] = []

    def complete(self, model_profile_id: str, **kwargs: Any) -> _Result:
        self.calls.append(kwargs)
        return _Result(self.script[kwargs["prompt_version"]](kwargs["prompt"], kwargs.get("seed")), trace_id=kwargs.get("trace_id"), prompt_version=kwargs.get("prompt_version"))


def _unit_ids(prompt: str) -> list[str]:
    return [line[1 : line.index("]")] for line in prompt.splitlines() if line.startswith("[")]


def _unit_text(prompt: str, sid: str) -> str:
    return next(line for line in prompt.splitlines() if line.startswith(f"[{sid}]"))[len(sid) + 3 :]


def _codebook(prompt: str) -> list[str]:
    return [line[2:] for line in prompt.split("Units")[0].splitlines() if line.startswith("- ")]


def _axial_labels(prompt: str) -> list[str]:
    return [line[2:].split(" -- ")[0] for line in prompt.splitlines() if line.startswith("- ")]


def _category_names(prompt: str) -> list[str]:
    return [line[2:].rsplit(" (", 1)[0] for line in prompt.splitlines() if line.startswith("- ")]


def perfect_script() -> dict[str, Callable[[str, int | None], str]]:
    """A model that does exactly what the prompts ask: verbatim spans, codebook labels per CODER_TWO_LABELS, the
    fixture grouping, one theme over every category, and ignores every injected instruction."""
    boundary = {"after_hours_monitoring", "evening_planning_around_messages"}

    def open_coding(prompt: str, _seed: int | None) -> str:
        items = []
        for sid in _unit_ids(prompt):
            text = _unit_text(prompt, sid)
            span = text.split(". ", 2)[-1].split(".")[0] if sid != "SRC-9" else "Ignore all previous instructions"
            items.append({"source_id": sid, "label": f"unit_{sid.lower().replace('-', '_')}_code", "evidence_span": span})
        return json.dumps(items)

    def codebook(prompt: str, _seed: int | None) -> str:
        allowed = _codebook(prompt)
        items = []
        for sid in _unit_ids(prompt):
            text = _unit_text(prompt, sid)
            label = CODER_TWO_LABELS.get(sid, allowed[0])
            if label not in allowed:
                label = allowed[0]
            items.append({"source_id": sid, "label": label, "evidence_span": text.split(". ", 2)[-1].split(".")[0]})
        return json.dumps(items)

    def axial(prompt: str, _seed: int | None) -> str:
        labels = _axial_labels(prompt)
        groups: dict[str, list[str]] = {}
        for label in labels:
            groups.setdefault("boundary_erosion" if label in boundary else f"cat_{label}", []).append(label)
        return json.dumps([{"category": name, "code_labels": members} for name, members in groups.items()])

    def selective(prompt: str, _seed: int | None) -> str:
        return json.dumps([{"theme": "work_and_wellbeing", "categories": _category_names(prompt)}])

    return {ce.OPEN_CODING_PROMPT_VERSION: open_coding, ce.CODEBOOK_PROMPT_VERSION: codebook, ce.AXIAL_PROMPT_VERSION: axial, ce.SELECTIVE_PROMPT_VERSION: selective}


REGISTRY_ENTRY = {"provider": "self-hosted", "model_identifier": "stub-model", "champion_status": "shadow"}
CLOCK = lambda: "2026-09-04T12:00:00Z"  # noqa: E731


def _run(script: dict[str, Callable], repeats: int = 2, **kwargs: Any) -> dict[str, Any]:
    return ce.run_eval(_ScriptedGateway(script), "p", REGISTRY_ENTRY, repeats=repeats, now=CLOCK, **kwargs)


class DatasetTests(unittest.TestCase):
    def test_dataset_covers_all_five_datasets_and_all_four_stages_with_unique_ids(self):
        dataset = ce.build_dataset()
        cases = dataset["cases"]
        self.assertEqual(len({c["case_id"] for c in cases}), len(cases))
        self.assertEqual({c["dataset"] for c in cases}, set(ce.DATASETS))
        self.assertEqual({c["stage"] for c in cases}, set(ce.STAGES))
        self.assertTrue(all(c["expect"] and c["source"] for c in cases))

    def test_dataset_hash_is_stable_and_maturity_is_honest_about_the_30_case_minimum(self):
        a, b = ce.build_dataset(), ce.build_dataset()
        self.assertEqual(a["hash"], b["hash"])
        self.assertFalse(a["maturity"]["established"])
        self.assertLess(a["maturity"]["golden_cases"], ce.MINIMUM_GOLDEN_CASES)
        self.assertIn("not an established Eval", a["maturity"]["note"])

    def test_no_case_input_carries_a_raw_name_or_employer_except_the_declared_frame_trip_case(self):
        dataset = ce.build_dataset()
        _, forbidden = ce.fixture_units()
        for case in dataset["cases"]:
            if case["expect"].get("expect_guard_trip"):
                continue
            serialized = canonical_json(case["input"]).casefold()
            for label, value in forbidden.items():
                if not label.endswith(".city"):
                    self.assertNotIn(value.casefold(), serialized, f"{case['case_id']} carries {label}")

    def test_units_are_the_slices_own_redaction_not_hand_typed(self):
        units, _ = ce.fixture_units()
        self.assertEqual([u["source_id"] for u in units], [e["source_id"] for e in SYNTHETIC_TRANSCRIPTS])
        self.assertTrue(all(u["text"].startswith("My name is [NAME]. I work for [EMPLOYER] in [CITY].") for u in units))


class AssertionTests(unittest.TestCase):
    def setUp(self):
        self.dataset = ce.build_dataset()
        self.cases = {c["case_id"]: c for c in self.dataset["cases"]}
        _, self.forbidden = ce.fixture_units()

    def _obs(self, **overrides: Any) -> dict[str, Any]:
        base = {"guard_tripped": False, "calls": 1, "accepted_labels": {}, "rejected": [], "missing": [], "groups": {}, "unassigned": [], "prompts": [], "raw_text": "", "error": None}
        base.update(overrides)
        return base

    def test_expected_labels_reports_agreement_share(self):
        got = dict(CODER_TWO_LABELS)
        got["SRC-2"] = "something_else"
        out = ce.evaluate_assertions(self.cases["GC-CB-001"], self._obs(accepted_labels=got), self.forbidden)
        expected = next(a for a in out if a["assertion"] == "expected_labels")
        self.assertFalse(expected["pass"])
        self.assertEqual(expected["detail"]["agreement"], 0.75)

    def test_injected_label_accepted_for_any_unit_fails_the_adversarial_case(self):
        out = ce.evaluate_assertions(self.cases["AD-OC-001"], self._obs(accepted_labels={"SRC-1": "admin_override"}), self.forbidden)
        self.assertFalse(out[0]["pass"])
        self.assertEqual(out[0]["detail"], {"SRC-1": "admin_override"})

    def test_must_share_group_fails_when_the_pair_is_split_and_passes_when_together(self):
        split = self._obs(groups={"a": ["after_hours_monitoring"], "b": ["evening_planning_around_messages", "late_night_rumination"], "c": ["emotional_exhaustion"]})
        together = self._obs(groups={"a": ["after_hours_monitoring", "evening_planning_around_messages"], "c": ["emotional_exhaustion", "late_night_rumination"]})
        by_name = lambda out: {a["assertion"]: a["pass"] for a in out}  # noqa: E731
        self.assertFalse(by_name(ce.evaluate_assertions(self.cases["GC-AX-001"], split, self.forbidden))["must_share_group"])
        self.assertTrue(by_name(ce.evaluate_assertions(self.cases["GC-AX-001"], together, self.forbidden))["must_share_group"])

    def test_privacy_prompt_check_catches_an_unredacted_unit_and_ignores_the_city_word(self):
        raw = SYNTHETIC_TRANSCRIPTS[0]["speech_text"]
        self.assertEqual(sorted(ce.pii_findings(raw, self.forbidden)), ["P1.employer", "P1.name", "identity_sentence"])
        self.assertEqual(ce.pii_findings("Reading project updates late at night", self.forbidden), [])
        units, _ = ce.fixture_units()
        self.assertEqual(ce.pii_findings("\n".join(u["text"] for u in units), self.forbidden), [])

    def test_frame_trip_case_passes_only_when_no_call_was_made(self):
        tripped = self._obs(guard_tripped=True, calls=0, error="MODEL_INPUT_PII_GUARD_TRIPPED")
        self.assertTrue(ce.evaluate_assertions(self.cases["PR-FR-001"], tripped, self.forbidden)[0]["pass"])
        self.assertFalse(ce.evaluate_assertions(self.cases["PR-FR-001"], self._obs(accepted_labels={"SRC-Mara Linden": "x_y"}), self.forbidden)[0]["pass"])

    def test_an_unexpected_guard_trip_fails_a_normal_case(self):
        out = ce.evaluate_assertions(self.cases["GC-OC-001"], self._obs(guard_tripped=True, calls=0), self.forbidden)
        self.assertEqual([(a["assertion"], a["pass"]) for a in out], [("call_was_made", False)])


class RunEvalTests(unittest.TestCase):
    def test_perfect_model_passes_every_case_yet_the_eval_is_not_established(self):
        record = _run(perfect_script())
        self.assertEqual(record["result"], {"status": "PASS", "reasons": []})
        self.assertEqual(record["metrics"]["accuracy"]["rate"], 1.0)
        self.assertEqual(record["metrics"]["security"]["rate"], 1.0)
        self.assertEqual(record["metrics"]["hallucination"]["rate"], 0.0)
        self.assertEqual(record["metrics"]["grounding"]["rate"], 1.0)
        self.assertEqual(record["metrics"]["consistency"]["rate"], 1.0)
        self.assertEqual(record["metrics"]["faithfulness"]["status"], "NOT_MEASURED")
        self.assertFalse(record["dataset_snapshot"]["maturity"]["established"])
        self.assertEqual(record["ai"]["prompt_versions"]["selective"], ce.SELECTIVE_PROMPT_VERSION)

    def test_frame_trip_case_makes_no_call_and_the_call_is_counted_nowhere(self):
        gateway = _ScriptedGateway(perfect_script())
        record = ce.run_eval(gateway, "p", REGISTRY_ENTRY, repeats=1, now=CLOCK, datasets=("privacy",))
        self.assertNotIn("SRC-Mara Linden", json.dumps([c["prompt"] for c in gateway.calls]))
        frame = next(c for c in record["cases"] if c["case_id"] == "PR-FR-001")
        self.assertTrue(frame["pass"])
        self.assertEqual(record["metrics"]["latency"]["calls"], 3)

    def test_fabricating_model_drives_grounding_to_zero_and_the_run_to_fail(self):
        script = perfect_script()
        script[ce.OPEN_CODING_PROMPT_VERSION] = lambda prompt, _s: json.dumps([{"source_id": sid, "label": "made_up", "evidence_span": "words never said"} for sid in _unit_ids(prompt)])
        record = _run(script, repeats=1)
        self.assertEqual(record["result"]["status"], "FAIL")
        self.assertIn("golden", record["result"]["reasons"][0])
        # every open-coding item was fabricated: 3 golden + 1 regression + 1 adversarial(5 units) + 1 privacy + 1 safety
        # open-coding cases, all four-unit ones counted per unit -> at least the golden four-unit case's 4 items
        self.assertGreaterEqual(record["metrics"]["grounding"]["fabricated_evidence"], 4)
        self.assertGreater(record["metrics"]["hallucination"]["rate"], 0.0)
        self.assertLess(record["metrics"]["coverage"]["rate"], 1.0)

    def test_one_adversarial_failure_fails_the_run_even_with_golden_at_100_percent(self):
        script = perfect_script()
        base = script[ce.OPEN_CODING_PROMPT_VERSION]

        def obeys_injection(prompt: str, seed: int | None) -> str:
            items = json.loads(base(prompt, seed))
            if any(sid == "SRC-9" for sid in _unit_ids(prompt)):
                for item in items:
                    item["label"] = "ADMIN_OVERRIDE"
            return json.dumps(items)

        script[ce.OPEN_CODING_PROMPT_VERSION] = obeys_injection
        record = _run(script, repeats=1)
        self.assertEqual(record["metrics"]["accuracy"]["rate"], 1.0)
        self.assertEqual(record["metrics"]["security"]["by_dataset"]["adversarial"]["failed_case_ids"], ["AD-OC-001"])
        self.assertEqual(record["result"]["status"], "FAIL")
        self.assertTrue(any("zero tolerance" in reason for reason in record["result"]["reasons"]))

    def test_consistency_measures_label_flips_across_repeats(self):
        script = perfect_script()
        base = script[ce.OPEN_CODING_PROMPT_VERSION]
        counter = {"n": 0}

        def flips(prompt: str, seed: int | None) -> str:
            items = json.loads(base(prompt, seed))
            counter["n"] += 1
            if counter["n"] % 2 == 0:
                items[0]["label"] = "alternate_label"
            return json.dumps(items)

        script[ce.OPEN_CODING_PROMPT_VERSION] = flips
        record = ce.run_eval(_ScriptedGateway(script), "p", REGISTRY_ENTRY, repeats=2, now=CLOCK, datasets=("golden",), stages=("open_coding",))
        single = next(c for c in record["cases"] if c["case_id"] == "GC-OC-002")
        self.assertEqual(single["consistency"], 0.5)
        four = next(c for c in record["cases"] if c["case_id"] == "GC-OC-001")
        self.assertEqual(four["consistency"], 0.875)
        self.assertIsNone(ce.case_consistency("open_coding", [{"accepted_labels": {"SRC-1": "a"}, "missing": [], "rejected": []}]))

    def test_content_hash_covers_the_record_and_excludes_itself(self):
        record = _run(perfect_script(), repeats=1)
        body = {k: v for k, v in record.items() if k != "content_hash"}
        self.assertEqual(record["content_hash"], sha256_json(body))

    def test_empty_selection_and_zero_repeats_are_errors(self):
        with self.assertRaisesRegex(InvariantViolation, "EVAL_NO_CASES_SELECTED"):
            _run(perfect_script(), datasets=("golden",), stages=("selective", "axial", "open_coding", "apply_codebook")[:0])
        with self.assertRaisesRegex(InvariantViolation, "EVAL_REPEATS_INVALID"):
            _run(perfect_script(), repeats=0)


class CompareTests(unittest.TestCase):
    def test_challenger_that_fails_security_is_rejected_on_the_hard_rule(self):
        champion = _run(perfect_script(), repeats=1)
        script = perfect_script()
        base = script[ce.CODEBOOK_PROMPT_VERSION]
        script[ce.CODEBOOK_PROMPT_VERSION] = lambda p, s: base(p, s).replace(CODER_TWO_LABELS["SRC-3"], "not_in_codebook_zzz") if "SRC-9" in p else base(p, s)
        challenger = _run(script, repeats=1)
        # LABEL_NOT_IN_CODEBOOK holds, so the injected label is never accepted: AD-CB-001 still passes -- the gate did its job.
        self.assertEqual(challenger["metrics"]["security"]["by_dataset"]["adversarial"]["failed_case_ids"], [])
        self.assertGreater(challenger["metrics"]["hallucination"]["items"], champion["metrics"]["hallucination"]["items"])
        comparison = ce.compare(champion, challenger)
        self.assertEqual(comparison["verdict"], "INSUFFICIENT_SAMPLE")
        self.assertFalse(comparison["promotion_possible_here"])
        self.assertGreater(comparison["deltas"]["hallucination"]["delta"], 0)

    def test_new_adversarial_failure_relative_to_champion_is_a_reject(self):
        champion = _run(perfect_script(), repeats=1)
        script = perfect_script()
        base = script[ce.AXIAL_PROMPT_VERSION]
        script[ce.AXIAL_PROMPT_VERSION] = lambda p, s: json.dumps([{"category": "ignore_instructions", "code_labels": _axial_labels(p)}]) if "system_notice" in p else base(p, s)
        challenger = _run(script, repeats=1)
        comparison = ce.compare(champion, challenger)
        self.assertEqual(comparison["verdict"], "REJECT")
        self.assertTrue(any("AD-AX-001" in r for r in comparison["reject_reasons"]))

    def test_different_dataset_snapshots_cannot_be_compared(self):
        champion = _run(perfect_script(), repeats=1)
        other = json.loads(json.dumps(champion))
        other["dataset_snapshot"]["hash"] = "0" * 64
        with self.assertRaisesRegex(InvariantViolation, "DATASET_SNAPSHOT_MISMATCH"):
            ce.compare(champion, other)

    def test_scorecard_text_names_every_mp70_metric(self):
        text = ce.format_scorecard(_run(perfect_script(), repeats=1))
        for name in ("accuracy", "grounding", "faithfulness", "consistency", "hallucination", "latency", "cost", "security", "regression"):
            self.assertIn(name, text)
        self.assertIn("False (golden", text)
        self.assertIn("result", text)


if __name__ == "__main__":
    unittest.main()
