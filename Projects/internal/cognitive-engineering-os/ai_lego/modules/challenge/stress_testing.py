"""``challenge.stress_testing`` -- tenth and FINAL Method Atlas slice from the ``challenge`` family (F12), after
``red_team``, ``blue_team``, ``independent_judge``.

Atlas gives this method exactly ONE citation, the F12 tool table row (L652, verbatim): 用途「極端但合理情境」
(extreme BUT PLAUSIBLE scenarios -- the "但合理" qualifier is the entire point, distinguishing this from an
unbounded worst-case fantasy) ／使用方式「extreme scenarios→run→breaking points」／效益「測 robustness」. No
dedicated §11.x section exists (confirmed by direct read of the surrounding table, L640-652), and no §22.3
Method-specific Gate row exists either (confirmed by direct read of that table, L4144-4155).

**Near-name collision, checked and confirmed distinct** -- the exact class ``devops_sre.stress_test.contract
.yaml``'s own description (L24-41) already disclosed and disambiguated FIRST, naming this method's own machine_id
before it existed: ``devops_sre.stress_test`` (F19) is an ENGINEERING load test -- escalating REAL, MEASURED
request load against a running system until it observably breaks. THIS method (``challenge.stress_testing``, F12)
is a COGNITIVE red-team method -- running a PLAN or DECISION through extreme-but-plausible QUALITATIVE scenarios
to test its own robustness, sibling to Red Team/Pre-mortem in this same challenge family. Neither typed object
references the other; ``StressTestScenarioSet`` (this method's own output) is deliberately NOT named
``StressTestRecord`` (that name already belongs to ``devops_sre.stress_test``'s own typed object) specifically to
avoid recreating the collision by name as well as by concept.

THE real invariant this method exists to enforce (module docstring, not just a schema comment): every scenario's
``extreme_value`` must fall STRICTLY outside its own ``normal_range`` -- ``< min`` or ``> max``, with the boundary
itself still counted as "normal" (a value AT the edge of normal operation is not yet extreme). A "stress test"
scenario whose own extreme_value sits inside the documented normal operating range is not stressing anything; it
is normal operation wearing an "extreme" label, defeating Atlas's own "極端" qualifier at the exact point this
method exists to enforce it.

Numeric checks follow this corpus's own established ``_is_number_excluding_bool`` discipline
(``ai_lego/modules/stakeholders/game_theory.py``): Python's ``bool`` is an ``int`` subclass, so a bare
``isinstance(value, (int, float))`` would silently accept ``True``/``False`` as normal_range/extreme_value 1/0 --
excluded explicitly. ``int`` is unconditionally finite (Python ints are arbitrary-precision, never inf/nan) and is
NOT passed through ``math.isfinite`` -- that same module's own second critic pass (2026-09-11) found a huge
``int`` (e.g. ``10**400``) makes ``math.isfinite`` itself raise ``OverflowError`` on the implicit float conversion;
only ``float`` needs the NaN/+-inf check, applied identically here.

Grepped the full ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "stress test"/"stress_testing"/"StressTest" before writing any of this method's own
files: only ``devops_sre.stress_test``'s own distinct method and its own disclosure found -- no duplicate.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.stress_testing"
RECORD_ID_PREFIX = "STSS-"
VALID_OUTCOMES = frozenset({"WITHIN_TOLERANCE", "DEGRADED", "BROKEN"})

_SCENARIO_KEYS = frozenset({"id", "description", "normal_range", "extreme_value", "outcome"})
_NORMAL_RANGE_KEYS = frozenset({"min", "max"})
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "proposal_ref", "scenarios", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_number_excluding_bool(value: Any) -> bool:
    """A normal_range.min/max or extreme_value must be a real, finite number. Python's ``bool`` is an ``int``
    subclass, so a bare ``isinstance(value, (int, float))`` would silently accept ``True``/``False`` as 1/0 --
    excluded explicitly, same trap every prior numeric-input module in this corpus must guard against. ``int`` is
    unconditionally finite (Python ints are arbitrary-precision, never inf/nan) and is NOT passed through
    ``math.isfinite`` -- a huge ``int`` (e.g. ``10**400``) makes ``math.isfinite`` itself raise ``OverflowError``
    on the implicit float conversion, the exact crash-instead-of-fail-closed gap
    ``stakeholders.game_theory``'s own second critic pass (2026-09-11) found and fixed; applied here from the
    start rather than found later. Only ``float`` needs the NaN/+-inf check -- that is the one case where "not
    finite" is even representable."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _validate_scenarios(scenarios: Any) -> None:
    """Re-derivable from raw input alone (never trusts a stored flag) -- used identically by the builder AND the
    independent gate below, so a hand-tampered record that bypassed the builder entirely is caught exactly as a
    builder-refused one would have been. Raises on the FIRST structural defect found; never returns a partial or
    best-effort result -- fail-closed, same discipline every sibling ``_validate_*`` helper in this corpus uses."""
    if not isinstance(scenarios, list) or not scenarios:
        raise InvariantViolation(f"STRESSTESTING_INVALID_SCENARIOS: scenarios must be a non-empty list (method contract precondition: at least one scenario), got {_shallow_describe(scenarios)}")

    ids: list[str] = []
    for index, scenario in enumerate(scenarios):
        if not isinstance(scenario, dict) or set(scenario.keys()) - _SCENARIO_KEYS or not _SCENARIO_KEYS <= scenario.keys():
            raise InvariantViolation(f"STRESSTESTING_INVALID_SCENARIO: scenarios[{index}] must be a dict with exactly keys {sorted(_SCENARIO_KEYS)}, got {_shallow_describe(scenario)}")

        scenario_id = scenario.get("id")
        description = scenario.get("description")
        normal_range = scenario.get("normal_range")
        extreme_value = scenario.get("extreme_value")
        outcome = scenario.get("outcome")

        if not _is_nonempty_str(scenario_id):
            raise InvariantViolation(f"STRESSTESTING_INVALID_SCENARIO_ID: scenarios[{index}] id must be a non-empty string, got {scenario_id!r}")
        if not _is_nonempty_str(description):
            raise InvariantViolation(f"STRESSTESTING_INVALID_SCENARIO_DESCRIPTION: scenarios[{index}] description must be a non-empty string, got {description!r}")

        if not isinstance(normal_range, dict) or set(normal_range.keys()) - _NORMAL_RANGE_KEYS or not _NORMAL_RANGE_KEYS <= normal_range.keys():
            raise InvariantViolation(f"STRESSTESTING_INVALID_NORMAL_RANGE: scenarios[{index}] normal_range must be a dict with exactly keys {sorted(_NORMAL_RANGE_KEYS)}, got {_shallow_describe(normal_range)}")
        range_min, range_max = normal_range.get("min"), normal_range.get("max")
        if not _is_number_excluding_bool(range_min) or not _is_number_excluding_bool(range_max):
            raise InvariantViolation(f"STRESSTESTING_INVALID_NORMAL_RANGE: scenarios[{index}] normal_range.min and normal_range.max must each be a real number (bool excluded), got min={range_min!r}, max={range_max!r}")
        if range_min > range_max:
            raise InvariantViolation(f"STRESSTESTING_INVERTED_NORMAL_RANGE: scenarios[{index}] normal_range.min ({range_min!r}) must be <= normal_range.max ({range_max!r}) -- an inverted range is malformed, not a legal scenario")

        if not _is_number_excluding_bool(extreme_value):
            raise InvariantViolation(f"STRESSTESTING_INVALID_EXTREME_VALUE: scenarios[{index}] extreme_value must be a real number (bool excluded), got {extreme_value!r}")
        if range_min <= extreme_value <= range_max:
            raise InvariantViolation(
                f"STRESSTESTING_EXTREME_VALUE_NOT_EXTREME: scenarios[{index}] extreme_value {extreme_value!r} falls inside (or on the boundary of) "
                f"normal_range [{range_min!r}, {range_max!r}] -- this is not stress-testing anything, just normal operation mislabeled "
                f"(Atlas L652's own '極端' qualifier, THE real invariant this method exists to enforce)"
            )

        if not isinstance(outcome, str) or outcome not in VALID_OUTCOMES:
            raise InvariantViolation(f"STRESSTESTING_INVALID_OUTCOME: scenarios[{index}] outcome must be one of {sorted(VALID_OUTCOMES)}, got {outcome!r} -- a scenario defined but never run/scored is an incomplete stress test")

        ids.append(scenario_id)

    duplicates = {sid for sid in ids if ids.count(sid) > 1}
    if duplicates:
        raise InvariantViolation(f"STRESSTESTING_DUPLICATE_SCENARIO_ID: scenario id(s) {sorted(duplicates)} appear more than once")


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_stress_test_scenario_set(
    record_id: str,
    proposal_ref: str,
    scenarios: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/stress-test-scenario-set.schema.yaml``.

    Enforces all real invariants fail-closed, in order: id/version/proposal_ref/provenance shape, then every
    scenario (well-formed, normal_range not inverted, extreme_value a real number STRICTLY outside normal_range,
    outcome a member of the closed set, no duplicate scenario id). A scenario whose own extreme_value is not
    actually extreme is refused before any record is constructed -- never silently stored as a "stress test" that
    never stressed anything.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"STRESSTESTING_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"STRESSTESTING_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(proposal_ref):
        raise InvariantViolation(f"STRESSTESTING_INVALID_PROPOSAL_REF: proposal_ref must be a non-empty string, got {proposal_ref!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"STRESSTESTING_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    _validate_scenarios(scenarios)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "proposal_ref": proposal_ref,
        # Rebuild each scenario (and its nested normal_range) element-by-element, not just list(...) on the
        # outer list -- a shallow copy would still share the caller's own nested dicts, so
        # `scenarios[0]["extreme_value"] = 5` after construction would silently rewrite a gate-passed record.
        # The exact aliasing gap a critic pass found in stakeholders.game_theory.py (2026-09-11) and every other
        # builder in that batch already avoided; applied here from the start.
        "scenarios": [
            {
                "id": scenario["id"],
                "description": scenario["description"],
                "normal_range": dict(scenario["normal_range"]),
                "extreme_value": scenario["extreme_value"],
                "outcome": scenario["outcome"],
            }
            for scenario in scenarios
        ],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_stress_test_scenario_set -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_stress_testing_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_stress_test_scenario_set``, so a hand-tampered record that bypassed the builder
    entirely (e.g. an extreme_value edited back inside normal_range after construction) is caught here exactly as
    a builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("stress_testing_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("stress_testing_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("stress_testing_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("proposal_ref")):
        return _result("stress_testing_content_integrity", False, [{"reason": "proposal_ref missing or empty"}], validator, timestamp)

    # Record-level key-set check (same discipline stakeholders.game_theory's own content-integrity gate
    # establishes, post-critic-fix): an added/removed top-level key must be caught here too, not only by JSON
    # Schema. unknown vs missing are NOT the same set -- generated_by_method carries a schema-level `default`,
    # never required from a caller/validator.
    unknown_keys = set(record.keys()) - _STORED_CONTENT_KEYS
    missing_keys = (_STORED_CONTENT_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "stress_testing_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    try:
        _validate_scenarios(record.get("scenarios"))
        problems: list[str] = []
    except InvariantViolation as error:
        problems = [str(error)]

    return _result("stress_testing_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_stress_testing_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets that
    flag to ``false`` (see module docstring and stakeholders.game_theory's own identical "only emit gates for
    what is actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_stress_testing_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
