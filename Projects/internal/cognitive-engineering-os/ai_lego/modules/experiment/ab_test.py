"""``experiment.ab_test`` -- 3rd F15 `experiment` family member (Atlas L734-748), opened alongside
``experiment.fake_door``/``experiment.smoke_test`` in the same batch (other F15 members built by
concurrent sibling agents, not in this module).

Atlas F15 table row (L746, verbatim): "A/B Test | 隨機比較版本 | hypothesis->metric->power->
randomize->analyze | 較可靠因果證據" (randomized version comparison; hypothesis -> metric -> power ->
randomize -> analyze; more reliable causal evidence). Dedicated section Sec12.30 (L2924-2941) gives
the full 8-stage pipeline (Hypothesis -> Primary Metric -> Guardrails -> Sample/Power ->
Randomization -> Run -> Analyze -> Decision) plus an explicit warning: "避免 peeking、multiple
testing、sample ratio mismatch" (avoid peeking, multiple testing, sample ratio mismatch).

**Scope boundary (disclosed here, same restraint precedent ``causal.rct.py`` already establishes for
a related but distinct method): this method captures the pre-registration STRUCTURE of a study, it
does not run an RNG or a real statistical hypothesis test.** All content fields
(hypothesis/primary_metric/guardrail_metrics/decision) are DISCLOSURE-ONLY; the record's own real
invariants are the pre-registration STRUCTURE, not the statistical correctness of the analysis.

Three real invariants, each enforced at TWO independent layers (construction-time builder AND an
independent gate re-deriving from raw fields), same belt-and-suspenders discipline every prior slice
in this corpus establishes:

1. **Pre-registration** (``ABTEST_NOT_PREREGISTERED``) -- ``registered_at`` must be a real, parseable
   ISO-8601 timestamp STRICTLY EARLIER than ``analyzed_at``. Atlas §12.30's own explicit warning names
   "peeking" as an anti-pattern; a hypothesis/metric/sample-size locked only AFTER (or at the same
   instant as) the analysis is not pre-registered, it is a post-hoc rationalization of the interim
   results.
2. **Positive sample size** (``ABTEST_INVALID_SAMPLE_SIZE``) -- ``sample_size_per_arm`` must be a
   positive integer. Atlas §12.30's own "Sample/Power" pipeline stage requires a REAL declared size,
   not an implicit "however many happened to show up".
3. **Primary metric isolation** (``ABTEST_PRIMARY_METRIC_IS_A_GUARDRAIL``) -- ``primary_metric`` must
   be genuinely distinct (NFKC-normalized, case/whitespace-insensitive, same normalization idiom
   ``causal.rct``'s own treatment/control distinctness check establishes) from every
   ``guardrail_metrics[]`` entry. The metric that decides the outcome cannot also be listed as a mere
   guardrail -- that ambiguity is exactly the kind of "multiple testing on the decisive metric" Atlas
   §12.30's own warning names.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "a/b test"/"a_b_test"/
"ab_test"/"split test"/"split_test" before writing any of this method's own files: only hits were
``causal.rct.contract.yaml``'s own disclosed distinction from this row and an unrelated example
scenario string in ``run_three_c_slice.py`` -- zero pre-existing implementation overlap.
"""

from __future__ import annotations

import copy
import unicodedata
from datetime import datetime
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.core.support import parse_timestamp
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.ab_test"
RECORD_ID_PREFIX = "ABTEST-"
_DECISIONS = frozenset({"SHIP", "DO_NOT_SHIP", "INCONCLUSIVE"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_positive_int(value: Any) -> bool:
    """``bool`` excluded -- Python's ``bool`` is an ``int`` subclass, the same documented trap
    ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` guards against."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key, NFKC-normalized first -- same helper shape
    ``causal.rct``'s own ``_normalize`` (itself modeled on ``framing.how_might_we``) already
    establishes, reused here for a different pair of fields."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _safe_parse_timestamp(value: Any) -> datetime | None:
    """Fail-closed wrapper around ``ai_lego.core.support.parse_timestamp``: construction call sites
    hand it already-shape-checked strings, but a GATE re-derives from raw, potentially hand-tampered
    fields with no such guarantee. Returns ``None`` (never a valid timestamp) on any parse failure or
    non-string input -- same idiom ``learning.ooda``'s own ``_safe_parse_timestamp`` establishes."""
    if not isinstance(value, str):
        return None
    try:
        return parse_timestamp(value)
    except (TypeError, ValueError):
        return None


def _guardrail_metrics_shape_is_valid(value: Any) -> bool:
    return isinstance(value, list) and all(_is_nonempty_str(m) for m in value)


def _preregistration_problem(registered_at: Any, analyzed_at: Any) -> str | None:
    """The single definition of invariant #1. Shared by the builder and the gate so neither can drift
    from the other."""
    registered = _safe_parse_timestamp(registered_at)
    if registered is None:
        return f"registered_at must be a parseable ISO-8601 timestamp, got {registered_at!r}"
    analyzed = _safe_parse_timestamp(analyzed_at)
    if analyzed is None:
        return f"analyzed_at must be a parseable ISO-8601 timestamp, got {analyzed_at!r}"
    if not registered < analyzed:
        return f"registered_at ({registered.isoformat()}) must be strictly earlier than analyzed_at ({analyzed.isoformat()})"
    return None


def _sample_size_problem(sample_size_per_arm: Any) -> str | None:
    """The single definition of invariant #2. Shared by the builder and the gate so neither can drift
    from the other."""
    if not _is_positive_int(sample_size_per_arm):
        return f"sample_size_per_arm must be a positive int (bool excluded), got {sample_size_per_arm!r}"
    return None


def _primary_metric_isolation_problem(primary_metric: Any, guardrail_metrics: Any) -> str | None:
    """The single definition of invariant #3. Shared by the builder and the gate so neither can drift
    from the other. Precondition: ``primary_metric`` already passed a non-empty-string check and
    ``guardrail_metrics`` already passed ``_guardrail_metrics_shape_is_valid`` -- the gate re-checks
    both itself before calling this, same precondition discipline ``root_cause.fault_tree``'s own
    ``_gate_mode_is_consistent`` documents."""
    normalized_primary = _normalize(primary_metric)
    colliding = sorted({g for g in guardrail_metrics if _normalize(g) == normalized_primary})
    if colliding:
        return f"primary_metric {primary_metric!r} (NFKC/case/whitespace-insensitive) equals guardrail_metrics entry(ies) {colliding} -- the decisive metric cannot also be a guardrail"
    return None


def generate_ab_test_experiment(
    record_id: str,
    hypothesis: str,
    primary_metric: str,
    guardrail_metrics: list[str],
    sample_size_per_arm: int,
    randomization_unit: str,
    registered_at: str,
    analyzed_at: str,
    decision: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/ab-test-record.schema.yaml``. Enforces all three real invariants
    fail-closed, in order: id/version shape, field completeness, positive sample size, pre-
    registration ordering, primary-metric isolation, decision vocabulary, then provenance -- BEFORE
    returning."""
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ABTEST_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ABTEST_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not _is_nonempty_str(hypothesis):
        raise InvariantViolation(f"ABTEST_EMPTY_HYPOTHESIS: hypothesis must be a non-empty string, got {hypothesis!r}")
    if not _is_nonempty_str(primary_metric):
        raise InvariantViolation(f"ABTEST_EMPTY_PRIMARY_METRIC: primary_metric must be a non-empty string, got {primary_metric!r}")
    if not _guardrail_metrics_shape_is_valid(guardrail_metrics):
        raise InvariantViolation(f"ABTEST_INVALID_GUARDRAIL_METRICS: guardrail_metrics must be a list of non-empty strings, got {guardrail_metrics!r}")
    if not _is_nonempty_str(randomization_unit):
        raise InvariantViolation(f"ABTEST_EMPTY_RANDOMIZATION_UNIT: randomization_unit must be a non-empty string, got {randomization_unit!r}")
    if decision not in _DECISIONS:
        raise InvariantViolation(f"ABTEST_INVALID_DECISION: decision must be one of {sorted(_DECISIONS)}, got {decision!r}")

    sample_size_problem = _sample_size_problem(sample_size_per_arm)
    if sample_size_problem is not None:
        raise InvariantViolation(f"ABTEST_INVALID_SAMPLE_SIZE: {sample_size_problem}")

    preregistration_problem = _preregistration_problem(registered_at, analyzed_at)
    if preregistration_problem is not None:
        raise InvariantViolation(
            f"ABTEST_NOT_PREREGISTERED: {preregistration_problem} -- Atlas §12.30's own warning names 'peeking' as "
            "an anti-pattern; hypothesis/primary_metric/sample_size_per_arm must be locked BEFORE analysis"
        )

    isolation_problem = _primary_metric_isolation_problem(primary_metric, guardrail_metrics)
    if isolation_problem is not None:
        raise InvariantViolation(f"ABTEST_PRIMARY_METRIC_IS_A_GUARDRAIL: {isolation_problem}")

    if not provenance_is_valid(provenance):
        raise InvariantViolation("ABTEST_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "hypothesis": hypothesis,
        "primary_metric": primary_metric,
        "guardrail_metrics": list(guardrail_metrics),
        "sample_size_per_arm": sample_size_per_arm,
        "randomization_unit": randomization_unit,
        "registered_at": registered_at,
        "analyzed_at": analyzed_at,
        "decision": decision,
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_preregistration_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariants #1 and #2 directly from raw fields, using the SAME
    ``_preregistration_problem``/``_sample_size_problem`` predicates the builder uses -- without this
    the gate could pass records the builder refuses. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("preregistration", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems = [p for p in (_sample_size_problem(record.get("sample_size_per_arm")), _preregistration_problem(record.get("registered_at"), record.get("analyzed_at"))) if p]
    return _result("preregistration", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_primary_metric_isolation_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #3 directly from raw fields. Precondition: does NOT assume the
    preregistration gate already passed -- re-validates ``primary_metric``/``guardrail_metrics`` shape
    itself before comparing, same defense-in-depth discipline every gate in this package uses. Fails
    closed on non-dict input or malformed supporting fields."""
    if not isinstance(record, dict):
        return _result("primary_metric_isolation", False, [{"reason": "record is not a dict"}], validator, timestamp)
    primary_metric = record.get("primary_metric")
    guardrail_metrics = record.get("guardrail_metrics")
    if not _is_nonempty_str(primary_metric):
        return _result("primary_metric_isolation", False, [{"reason": f"primary_metric invalid: {primary_metric!r}"}], validator, timestamp)
    if not _guardrail_metrics_shape_is_valid(guardrail_metrics):
        return _result("primary_metric_isolation", False, [{"reason": f"guardrail_metrics invalid: {guardrail_metrics!r}"}], validator, timestamp)
    problem = _primary_metric_isolation_problem(primary_metric, guardrail_metrics)
    return _result("primary_metric_isolation", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_ab_test_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_preregistration_gate(record, validator, timestamp),
        evaluate_primary_metric_isolation_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
