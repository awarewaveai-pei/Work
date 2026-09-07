"""``learning.build_measure_learn`` -- F17 learning family member, built alongside `learning.pdca`/
`learning.ooda` this batch. Atlas F17 table row (L803): "Build–Measure–Learn | 產品探索 | build smallest
test→measure→learn | 減少先建後驗證" -- no dedicated Atlas section exists beyond it (grep-confirmed: Atlas
L2989-3025 read directly, §12.34 PDCA / §12.35 OODA / §12.36 Decision Journal run back-to-back with no
section for this row in between).

**Due-diligence finding (real determination, not assumed): not a duplicate of any F15 "Experiment &
Validation" tool.** Grepped `ai_lego/modules/` and `methods/contracts/` for MVP/prototype/A-B/experiment as
machine_ids or schema titles before writing a line of this module: zero F15-grounded method has been built
anywhere in this codebase (no `experiment`/`validation` module family exists at all). The only "experiment"
hits are `devops_sre.chaos_engineering.generate_chaos_experiment` (a chaos-engineering fault-injection
record, an unrelated domain despite the shared English word) and a hypothetical `validation.experiment`
machine_id used as a plain example name inside `root_cause.fishbone`'s own docstring comment (never built).
Proceeding on Atlas's own F17 L803 citation alone, as this session's brief allows when no F15 sibling exists
to compare against. Conceptually, F15's own row set (Prototype/MVP/PoC/Technical Spike/...) each describe the
MECHANICS of running ONE experiment; this method is F17's own CYCLE framing -- build→measure→learn as a
learning-family iteration record, not a specific experiment technique.

**Structural distinction from `learning.pdca`, the other cyclic-shaped sibling in this same family,
deliberate and citation-grounded**: PDCA's own arrow formula (Atlas L2994, "Plan → Do → Check → Act → ...")
carries an explicit trailing repeat arrow -- PDCA is modeled as `cycles[]`, an N-cycle array with a
cross-cycle learning-continuity invariant. This row's own formula (L803, "build smallest test→measure→learn")
has NO trailing repeat notation. This module therefore models ONE iteration per record (a single
build/measure/learn triple), not a repeating array -- inventing a cycles[]-style loop container here would be
presenting an unrequested/uncited feature as grounded (OQ-BUILDMEASURELEARN-2 records this as a disclosed,
deliberate scope limit, not a silent gap).

TWO real, independently-enforced invariants (construction AND gate, same "raise before any downstream write"
/ "re-derive, don't trust" two-layer discipline every prior module in this package uses; gate re-derivation
follows `root_cause.fault_tree`'s own stricter isinstance-first/safe-``.get()`` style):

1. **Connectedness** (this session's own brief, directly from Atlas's own three-stage arrow): a Learn stage
   citing nothing measured is just opinion, and a Measure stage not tied to what was actually built is
   unverifiable. Two structural cross-references, both re-derived at the gate, bundled under one gate_id
   (same "several distinct structural reasons, one gate_id" pattern `fault_tree.evaluate_fault_tree_integrity_gate`
   already establishes for its own two reference checks):
   (a) ``BUILDMEASURELEARN_MEASURE_BUILD_REF_UNRESOLVED`` -- ``measure.build_ref`` must equal
       ``build.artifact_id``.
   (b) ``BUILDMEASURELEARN_LEARN_CITES_NOTHING_MEASURED`` -- ``learn.metric_refs`` must be non-empty, and
       every id in it must resolve to a real ``measure.metrics[].id``.
2. **Disclosed minimalism** (``BUILDMEASURELEARN_UNDISCLOSED_CUTS``): grounded directly in Atlas's own
   literal word "smallest" (L803, "build SMALLEST test") -- ``build.cut_scope`` must be a non-empty list.
   The build stage must name what was deliberately left out to stay minimal; an undisclosed "smallest" test
   cannot be told apart from an accidentally-incomplete one. Deliberately NOT invented beyond the literal
   word: no sub-schema for a cut item's own reason/impact, just a plain string list (see contract
   compilation_decisions).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.build_measure_learn"
RECORD_ID_PREFIX = "BML-"
ARTIFACT_ID_PREFIX = "ARTIFACT-"
METRIC_ID_PREFIX = "METRIC-"

_KNOWN_METRIC_KEYS = frozenset({"id", "name", "value", "unit", "provenance"})
_KNOWN_BUILD_KEYS = frozenset({"description", "artifact_id", "cut_scope", "provenance"})
_KNOWN_MEASURE_KEYS = frozenset({"description", "build_ref", "metrics", "provenance"})
_KNOWN_LEARN_KEYS = frozenset({"conclusion", "metric_refs", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``root_cause.fault_tree``'s own ``_shallow_describe`` uses (a bare recursive repr over
    caller-supplied input of unknown size is itself a small denial-of-service surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_finite_number(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline ``kill_criteria._is_finite_number``/``fault_tree._is_valid_probability``
    use: ``value=True`` must not silently pass an ``isinstance(value, (int, float))`` check as if it were 1,
    and ``value=inf``/``nan`` are not valid RFC 8259 JSON and would make no sense as a measured metric
    regardless of a bare type check. Unlike kill_criteria's threshold, a metric is not range-bound -- Atlas
    gives no worked numeric convention for this row (unlike kill_criteria's own closed dimension set)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


# --------------------------------------------------------------------------
# Shape validators -- structural correctness only. The two headline invariants (connectedness,
# disclosed minimalism) are separate predicates below, each with its own error code, same "a failure always
# names the specific bug class" discipline `root_cause.fault_tree._gate_shape_is_valid` documents.
# --------------------------------------------------------------------------


def _metric_shape_is_valid(item: Any) -> bool:
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_METRIC_KEYS:
        return False
    if not _is_nonempty_str(item["id"]) or not item["id"].startswith(METRIC_ID_PREFIX):
        return False
    if not _is_nonempty_str(item["name"]):
        return False
    if not _is_finite_number(item["value"]):
        return False
    if not _is_nonempty_str(item["unit"]):
        return False
    return isinstance(item["provenance"], dict)


def _build_shape_is_valid(build: Any) -> bool:
    """Shape only -- does NOT check ``cut_scope`` non-emptiness (that is invariant #2, its own error code,
    checked separately below)."""
    if not isinstance(build, dict) or set(build.keys()) != _KNOWN_BUILD_KEYS:
        return False
    if not _is_nonempty_str(build["description"]):
        return False
    if not _is_nonempty_str(build["artifact_id"]) or not build["artifact_id"].startswith(ARTIFACT_ID_PREFIX):
        return False
    cut_scope = build["cut_scope"]
    if not isinstance(cut_scope, list) or not all(_is_nonempty_str(c) for c in cut_scope):
        return False
    return isinstance(build["provenance"], dict)


def _measure_shape_is_valid(measure: Any) -> bool:
    if not isinstance(measure, dict) or set(measure.keys()) != _KNOWN_MEASURE_KEYS:
        return False
    if not _is_nonempty_str(measure["description"]):
        return False
    if not _is_nonempty_str(measure["build_ref"]) or not measure["build_ref"].startswith(ARTIFACT_ID_PREFIX):
        return False
    metrics = measure["metrics"]
    if not isinstance(metrics, list) or not metrics or not all(_metric_shape_is_valid(m) for m in metrics):
        return False
    return isinstance(measure["provenance"], dict)


def _learn_shape_is_valid(learn: Any) -> bool:
    """Shape only -- does NOT check ``metric_refs`` non-emptiness/resolution (that is invariant #1b, its own
    error code, checked separately below)."""
    if not isinstance(learn, dict) or set(learn.keys()) != _KNOWN_LEARN_KEYS:
        return False
    if not _is_nonempty_str(learn["conclusion"]):
        return False
    metric_refs = learn["metric_refs"]
    if not isinstance(metric_refs, list) or not all(_is_nonempty_str(r) and r.startswith(METRIC_ID_PREFIX) for r in metric_refs):
        return False
    return isinstance(learn["provenance"], dict)


def _duplicate_metric_ids(metrics: list[dict[str, Any]]) -> list[str]:
    """Precondition: every entry already passed ``_metric_shape_is_valid``."""
    ids = [m["id"] for m in metrics]
    return sorted({i for i in ids if ids.count(i) > 1})


# --------------------------------------------------------------------------
# Invariant #2 (disclosed minimalism): one predicate, two callers (construction raise + independent gate).
# --------------------------------------------------------------------------


def _cut_scope_is_disclosed(build: dict[str, Any]) -> bool:
    """Precondition: ``build`` already passed ``_build_shape_is_valid`` (so ``cut_scope`` is a list of
    well-formed strings if non-empty)."""
    cut_scope = build.get("cut_scope")
    return isinstance(cut_scope, list) and len(cut_scope) >= 1


# --------------------------------------------------------------------------
# Invariant #1 (connectedness): two sub-checks, bundled under one conceptual invariant per this session's
# own brief, each with its own error code so a failure always names the specific bug class.
# --------------------------------------------------------------------------


def _measure_references_build(build: dict[str, Any], measure: dict[str, Any]) -> bool:
    """Precondition: both already passed their own shape checks."""
    return measure.get("build_ref") == build.get("artifact_id")


def _learn_metric_ref_violations(measure: dict[str, Any], learn: dict[str, Any]) -> list[str]:
    """Precondition: both already passed their own shape checks. Returns every problem found -- empty list
    means learn.metric_refs is non-empty and every id resolves to a real measure.metrics[].id."""
    metric_refs = learn.get("metric_refs") or []
    if not metric_refs:
        return ["learn.metric_refs is empty -- a Learn stage citing nothing measured is opinion, not data-grounded learning"]
    known_ids = {m["id"] for m in measure.get("metrics", []) if isinstance(m, dict) and "id" in m}
    unresolved = sorted({r for r in metric_refs if r not in known_ids})
    if unresolved:
        return [f"learn.metric_refs references unknown metric id(s) {unresolved}, not in measure.metrics"]
    return []


# --------------------------------------------------------------------------
# Convenience constructors -- eager non-empty/prefix validation, same discipline decision_journal's
# option()/evidence_item() and pdca's stage_*() use. NOT the invariant boundary:
# generate_build_measure_learn_record validates whatever dict it is handed regardless of how it was built --
# in particular, these constructors deliberately do NOT enforce cut_scope/metric_refs non-emptiness or the
# cross-reference invariants, so mutation tests can build an invalid record through them and prove the real
# boundary (the generator + the gates) is what actually enforces the two invariants, not merely convenience.
# --------------------------------------------------------------------------


def metric(metric_id: str, name: str, value: float, unit: str, provenance: dict[str, Any]) -> dict[str, Any]:
    if not _is_nonempty_str(metric_id) or not metric_id.startswith(METRIC_ID_PREFIX):
        raise InvariantViolation(f"BUILDMEASURELEARN_INVALID_METRIC_ID: id must be a non-empty string beginning with {METRIC_ID_PREFIX!r}, got {metric_id!r}")
    if not _is_nonempty_str(name):
        raise InvariantViolation(f"BUILDMEASURELEARN_EMPTY_METRIC_NAME: metric {metric_id!r} has empty name")
    if not _is_finite_number(value):
        raise InvariantViolation(f"BUILDMEASURELEARN_INVALID_METRIC_VALUE: metric {metric_id!r} value must be a finite, non-boolean number, got {value!r}")
    if not _is_nonempty_str(unit):
        raise InvariantViolation(f"BUILDMEASURELEARN_EMPTY_METRIC_UNIT: metric {metric_id!r} has no unit -- a bare number is not comparable")
    return {"id": metric_id, "name": name, "value": value, "unit": unit, "provenance": provenance}


def build_stage(description: str, artifact_id: str, cut_scope: list[str], provenance: dict[str, Any]) -> dict[str, Any]:
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"BUILDMEASURELEARN_EMPTY_BUILD_DESCRIPTION: build description must be non-empty, got {description!r}")
    if not _is_nonempty_str(artifact_id) or not artifact_id.startswith(ARTIFACT_ID_PREFIX):
        raise InvariantViolation(f"BUILDMEASURELEARN_INVALID_ARTIFACT_ID: artifact_id must be a non-empty string beginning with {ARTIFACT_ID_PREFIX!r}, got {artifact_id!r}")
    return {"description": description, "artifact_id": artifact_id, "cut_scope": list(cut_scope), "provenance": provenance}


def measure_stage(description: str, build_ref: str, metrics: list[dict[str, Any]], provenance: dict[str, Any]) -> dict[str, Any]:
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"BUILDMEASURELEARN_EMPTY_MEASURE_DESCRIPTION: measure description must be non-empty, got {description!r}")
    if not _is_nonempty_str(build_ref) or not build_ref.startswith(ARTIFACT_ID_PREFIX):
        raise InvariantViolation(f"BUILDMEASURELEARN_INVALID_BUILD_REF: build_ref must be a non-empty string beginning with {ARTIFACT_ID_PREFIX!r}, got {build_ref!r}")
    return {"description": description, "build_ref": build_ref, "metrics": [dict(m) for m in metrics], "provenance": provenance}


def learn_stage(conclusion: str, metric_refs: list[str], provenance: dict[str, Any]) -> dict[str, Any]:
    if not _is_nonempty_str(conclusion):
        raise InvariantViolation(f"BUILDMEASURELEARN_EMPTY_CONCLUSION: learn conclusion must be non-empty, got {conclusion!r}")
    return {"conclusion": conclusion, "metric_refs": list(metric_refs), "provenance": provenance}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_build_measure_learn_record(
    record_id: str,
    product_under_exploration: str,
    build: dict[str, Any],
    measure: dict[str, Any],
    learn: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/build-measure-learn-cycle.schema.yaml``. Enforces fail-closed, in order:
    field shape -> build/measure/learn shape -> duplicate metric ids -> invariant #2 (disclosed minimalism)
    -> invariant #1 (connectedness). REBUILDS every nested list/dict it owns; ``provenance`` is stored by
    reference, the same family-wide convention every prior module in this package already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BUILDMEASURELEARN_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(product_under_exploration):
        raise InvariantViolation(f"BUILDMEASURELEARN_EMPTY_RECORD_FIELD: product_under_exploration must be a non-empty string, got {product_under_exploration!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BUILDMEASURELEARN_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"BUILDMEASURELEARN_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not _build_shape_is_valid(build):
        raise InvariantViolation(
            f"BUILDMEASURELEARN_INVALID_BUILD: build must be a dict with exactly {sorted(_KNOWN_BUILD_KEYS)} "
            f"(description/artifact_id non-empty strings, artifact_id prefixed {ARTIFACT_ID_PREFIX!r}, "
            f"cut_scope a list of non-empty strings, provenance a dict), got {_shallow_describe(build)}"
        )
    if not _measure_shape_is_valid(measure):
        raise InvariantViolation(
            f"BUILDMEASURELEARN_INVALID_MEASURE: measure must be a dict with exactly {sorted(_KNOWN_MEASURE_KEYS)} "
            f"(description non-empty, build_ref prefixed {ARTIFACT_ID_PREFIX!r}, metrics a non-empty list of "
            f"well-shaped entries, provenance a dict), got {_shallow_describe(measure)}"
        )
    if not _learn_shape_is_valid(learn):
        raise InvariantViolation(
            f"BUILDMEASURELEARN_INVALID_LEARN: learn must be a dict with exactly {sorted(_KNOWN_LEARN_KEYS)} "
            f"(conclusion non-empty, metric_refs a list of strings prefixed {METRIC_ID_PREFIX!r}, provenance a dict), "
            f"got {_shallow_describe(learn)}"
        )

    duplicates = _duplicate_metric_ids(measure["metrics"])
    if duplicates:
        raise InvariantViolation(f"BUILDMEASURELEARN_DUPLICATE_METRIC_ID: id(s) {duplicates} used more than once in measure.metrics -- every metric id must be unique")

    if not _cut_scope_is_disclosed(build):
        raise InvariantViolation(
            "BUILDMEASURELEARN_UNDISCLOSED_CUTS: build.cut_scope is empty -- Atlas's own literal word "
            "'smallest' (L803) requires the build stage to name what was deliberately left out to stay minimal"
        )

    if not _measure_references_build(build, measure):
        raise InvariantViolation(
            f"BUILDMEASURELEARN_MEASURE_BUILD_REF_UNRESOLVED: measure.build_ref={measure['build_ref']!r} "
            f"does not equal build.artifact_id={build['artifact_id']!r}"
        )
    ref_violations = _learn_metric_ref_violations(measure, learn)
    if ref_violations:
        raise InvariantViolation(f"BUILDMEASURELEARN_LEARN_CITES_NOTHING_MEASURED: {'; '.join(ref_violations)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "product_under_exploration": product_under_exploration,
        "build": {"description": build["description"], "artifact_id": build["artifact_id"], "cut_scope": list(build["cut_scope"]), "provenance": build["provenance"]},
        "measure": {"description": measure["description"], "build_ref": measure["build_ref"], "metrics": [dict(m) for m in measure["metrics"]], "provenance": measure["provenance"]},
        "learn": {"conclusion": learn["conclusion"], "metric_refs": list(learn["metric_refs"]), "provenance": learn["provenance"]},
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Bonus helper -- real compute over an ALREADY-VALID record, not one of the declared structural invariants
# (same scope split `pdca.resolve_carried_forward_action_items` / `fault_tree.evaluate_top_event` use).
# --------------------------------------------------------------------------


def resolve_learned_metrics(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Resolves ``learn.metric_refs`` against ``measure.metrics``, returning the full metric dicts (not just
    ids), in ``metric_refs``'s own order. Defensive on a hand-tampered record: silently omits any id that no
    longer resolves rather than raising, same discipline ``pdca.resolve_carried_forward_action_items``
    establishes for its own cross-reference resolution."""
    metrics_by_id = {m["id"]: m for m in record["measure"]["metrics"] if isinstance(m, dict) and "id" in m}
    return [metrics_by_id[r] for r in record["learn"]["metric_refs"] if r in metrics_by_id]


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- record's own provenance + build/measure/learn stage
    provenance + every metric's own provenance. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    overall_valid = provenance_is_valid(record.get("provenance"))

    build = record.get("build") if isinstance(record.get("build"), dict) else {}
    measure = record.get("measure") if isinstance(record.get("measure"), dict) else {}
    learn = record.get("learn") if isinstance(record.get("learn"), dict) else {}

    build_valid = provenance_is_valid(build.get("provenance")) if build else False
    measure_valid = provenance_is_valid(measure.get("provenance")) if measure else False
    learn_valid = provenance_is_valid(learn.get("provenance")) if learn else False

    metrics = measure.get("metrics") if isinstance(measure.get("metrics"), list) else []
    invalid_metric_ids = [m.get("id") for m in metrics if isinstance(m, dict) and not provenance_is_valid(m.get("provenance"))]
    malformed_metric_indices = [i for i, m in enumerate(metrics) if not isinstance(m, dict)]

    passed = overall_valid and build_valid and measure_valid and learn_valid and not invalid_metric_ids and not malformed_metric_indices
    return _result(
        "provenance_required",
        passed,
        [{
            "overall_provenance_valid": overall_valid,
            "build_provenance_valid": build_valid,
            "measure_provenance_valid": measure_valid,
            "learn_provenance_valid": learn_valid,
            "invalid_metric_provenance_ids": invalid_metric_ids,
            "malformed_metric_indices": malformed_metric_indices,
        }],
        validator,
        timestamp,
    )


def evaluate_connectedness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently from the record's own raw fields -- does not trust that
    ``generate_build_measure_learn_record``'s own construction-time check already ran (a hand-tampered
    record must still be caught). Bundles both reference checks under one gate_id, same "several distinct
    structural reasons, one gate_id" pattern ``fault_tree.evaluate_fault_tree_integrity_gate`` already
    establishes. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("connectedness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    build = record.get("build")
    measure = record.get("measure")
    learn = record.get("learn")
    if not _build_shape_is_valid(build) or not _measure_shape_is_valid(measure) or not _learn_shape_is_valid(learn):
        return _result("connectedness", False, [{"reason": "build/measure/learn malformed -- cannot evaluate connectedness"}], validator, timestamp)

    build_ref_resolved = _measure_references_build(build, measure)
    ref_violations = _learn_metric_ref_violations(measure, learn)
    passed = build_ref_resolved and not ref_violations
    return _result(
        "connectedness",
        passed,
        [{
            "measure_build_ref_resolved": build_ref_resolved,
            "measure_build_ref": measure.get("build_ref"),
            "build_artifact_id": build.get("artifact_id"),
            "learn_metric_ref_violations": ref_violations,
        }],
        validator,
        timestamp,
    )


def evaluate_disclosed_minimalism_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, re-derived independently: ``build.cut_scope`` must be a non-empty list. Fails closed on
    malformed input."""
    if not isinstance(record, dict):
        return _result("disclosed_minimalism", False, [{"reason": "record is not a dict"}], validator, timestamp)
    build = record.get("build")
    if not isinstance(build, dict):
        return _result("disclosed_minimalism", False, [{"reason": "build missing or not a dict"}], validator, timestamp)
    cut_scope = build.get("cut_scope")
    passed = isinstance(cut_scope, list) and len(cut_scope) >= 1 and all(_is_nonempty_str(c) for c in cut_scope)
    return _result("disclosed_minimalism", passed, [{"cut_scope": cut_scope if isinstance(cut_scope, list) else _shallow_describe(cut_scope)}], validator, timestamp)


def evaluate_build_measure_learn_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_connectedness_gate(record, validator, timestamp),
        evaluate_disclosed_minimalism_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
