"""``challenge.fmea`` -- eighth built member of the ``challenge`` family (F12), Failure Mode and Effects Analysis.

Atlas §11.26 (L1775-1801) dedicated section, own literal pipeline (L1783-1791)::

    Function -> Failure Mode -> Effect -> Cause -> Existing Control -> Severity -> Occurrence -> Detection ->
    Action Priority

THE real invariant this method exists to enforce is Atlas's own explicit warning (L1799-1800, verbatim):
"不要只依賴 RPN；高 Severity 即使機率低仍可能需強制控制" (do not rely on RPN alone; a high Severity may require
mandatory control even at low probability). Turned from advisory text into a structural rule, same discipline
``stakeholders.game_theory``'s own §12.19 payoff-completeness mechanization already established for this corpus:
a ``severity >= _SEVERITY_MANDATORY_THRESHOLD`` (9, disclosed compilation choice -- top 2 of the 1-10 scale, see
methods/contracts/challenge.fmea.contract.yaml OQ-FMEA-1) failure mode ALWAYS resolves to
``action_priority = "MANDATORY_CONTROL_REQUIRED"``, regardless of how low ``occurrence``/``detection`` (and
therefore ``rpn``) are. Otherwise ``action_priority`` is derived from an ``rpn`` tier table this module also
compiles and discloses (``rpn>=200`` HIGH, ``rpn>=50`` MEDIUM, else LOW).

Both ``rpn`` and ``action_priority`` are GENUINE_COMPUTE fields: neither ``generate_fmea_analysis`` nor a
per-failure-mode input spec dict accepts them as caller-supplied values (verified in
``tests/unit/test_fmea.py`` via ``inspect.signature`` on the builder, and via the exact-key-set check on each
failure-mode spec below) -- they are always derived from severity/occurrence/detection, never trusted from the
caller.

Severity/occurrence/detection are the same kind of 1-10 integer-scale fields ``stakeholders.game_theory``'s own
``_is_number_excluding_bool`` pattern warns about (Python's ``bool`` is an ``int`` subclass --
``isinstance(True, int) is True`` -- a documented real bug class already found and fixed in this repo's F03 and
F07 methods): ``_is_valid_score`` below explicitly rejects ``bool`` before accepting ``int``, and rejects any
``int`` outside ``[1, 10]``. Unlike a payoff (which may be any real number), an FMEA score is always a discrete
1-10 rank by definition -- ``float`` is refused outright, not accepted-and-finiteness-checked.

Grepped the full ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "fmea" before writing any of this method's own files: zero pre-existing
implementation, zero contract-backlog entry (only Atlas's own text, method-inventory.yaml's pending placeholder,
and ADR-002/ADR-007's own unrelated borrowed-FMEA prose in policy docs).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.fmea"
RECORD_ID_PREFIX = "FMEA-"

# Atlas L1799-1800's own qualitative warning, made numeric (disclosed compilation choice, methods/contracts/
# challenge.fmea.contract.yaml OQ-FMEA-1): top 2 of the 1-10 severity scale forces mandatory control regardless
# of rpn.
_SEVERITY_MANDATORY_THRESHOLD = 9
# RPN tier cut points (disclosed compilation choice, same OQ-FMEA-1) -- only consulted when the severity
# override above does NOT apply.
_RPN_HIGH_THRESHOLD = 200
_RPN_MEDIUM_THRESHOLD = 50

_FAILURE_MODE_INPUT_KEYS = frozenset({"id", "function", "failure_mode", "effect", "cause", "existing_control", "severity", "occurrence", "detection"})
_FAILURE_MODE_STORED_KEYS = _FAILURE_MODE_INPUT_KEYS | {"rpn", "action_priority"}
_STORED_RECORD_KEYS = frozenset({"id", "version", "generated_by_method", "subject_ref", "failure_modes", "provenance"})
_TEXT_FIELDS = ("function", "failure_mode", "effect", "cause")


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_score(value: Any) -> bool:
    """A severity/occurrence/detection score must be a genuine integer on the standard FMEA 1-10 scale. Python's
    ``bool`` is an ``int`` subclass, so a bare ``isinstance(value, int)`` would silently accept ``True``/``False``
    as scores 1/0 -- excluded explicitly, same trap ``stakeholders.game_theory``'s own ``_is_number_excluding_bool``
    already documents for this corpus. Unlike a payoff, a score is never a float -- 5.5 has no defined meaning on
    a discrete 1-10 rank scale, so ``float`` is refused outright rather than accepted-and-finiteness-checked."""
    if isinstance(value, bool):
        return False
    return isinstance(value, int) and 1 <= value <= 10


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline ``stakeholders.game_theory``/``jtbd``/``bcg_matrix`` already
    establish in this corpus."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def compute_rpn(severity: int, occurrence: int, detection: int) -> int:
    """GENUINE_COMPUTE: the Risk Priority Number, Atlas's own named metric (§11.26). Range 1-1000 when all three
    factors are valid 1-10 scores. Never accepted as an input -- always derived here."""
    return severity * occurrence * detection


def compute_action_priority(severity: int, rpn: int) -> str:
    """GENUINE_COMPUTE: mechanizes Atlas's own explicit warning (L1799-1800, verbatim) "不要只依賴 RPN；高
    Severity 即使機率低仍可能需強制控制" as a hard structural rule, not advisory text. A ``severity >=
    _SEVERITY_MANDATORY_THRESHOLD`` finding ALWAYS resolves to ``MANDATORY_CONTROL_REQUIRED`` -- checked FIRST,
    before the ``rpn`` tier table is even consulted, so a high-severity/low-rpn finding (e.g. severity=10,
    occurrence=1, detection=1, rpn=10 -- which the tier table alone would call LOW) still cannot slip through as
    a routine, non-mandatory item. This ordering is the literal encoding of Atlas's own warning: the whole point
    is that RPN alone is NOT sufficient."""
    if severity >= _SEVERITY_MANDATORY_THRESHOLD:
        return "MANDATORY_CONTROL_REQUIRED"
    if rpn >= _RPN_HIGH_THRESHOLD:
        return "HIGH"
    if rpn >= _RPN_MEDIUM_THRESHOLD:
        return "MEDIUM"
    return "LOW"


def _build_failure_mode(spec: Any, index: int) -> dict[str, Any]:
    """Validates one caller-supplied failure-mode spec (exactly ``_FAILURE_MODE_INPUT_KEYS`` -- ``rpn``/
    ``action_priority`` are refused here if present, the same "additionalProperties"-style exact-key-set check
    ``stakeholders.game_theory``'s own ``_validate_players``/``_validate_strategies``/``_validate_payoffs``
    already use) and returns the fully-built stored dict with ``rpn``/``action_priority`` computed. Raises
    ``InvariantViolation`` fail-closed on any structural defect; never returns a partial/best-effort result."""
    if not isinstance(spec, dict) or set(spec.keys()) - _FAILURE_MODE_INPUT_KEYS or not _FAILURE_MODE_INPUT_KEYS <= spec.keys():
        raise InvariantViolation(
            f"FMEA_INVALID_FAILURE_MODE: failure_modes[{index}] must be a dict with exactly keys {sorted(_FAILURE_MODE_INPUT_KEYS)} "
            f"(rpn/action_priority are GENUINE_COMPUTE, never caller-supplied -- Atlas §11.26 L1799-1800), got {_shallow_describe(spec)}"
        )
    if not _is_nonempty_str(spec.get("id")):
        raise InvariantViolation(f"FMEA_INVALID_FAILURE_MODE: failure_modes[{index}].id must be a non-empty string, got {spec.get('id')!r}")
    for key in _TEXT_FIELDS:
        if not _is_nonempty_str(spec.get(key)):
            raise InvariantViolation(f"FMEA_INVALID_FAILURE_MODE: failure_modes[{index}].{key} must be a non-empty string, got {spec.get(key)!r}")
    existing_control = spec.get("existing_control")
    if not isinstance(existing_control, str):
        raise InvariantViolation(
            f"FMEA_INVALID_FAILURE_MODE: failure_modes[{index}].existing_control must be a string (may be empty -- "
            f"'no control exists yet' is itself a valid, common, important finding), got {existing_control!r}"
        )
    severity, occurrence, detection = spec.get("severity"), spec.get("occurrence"), spec.get("detection")
    for key, value in (("severity", severity), ("occurrence", occurrence), ("detection", detection)):
        if not _is_valid_score(value):
            raise InvariantViolation(f"FMEA_INVALID_SCORE: failure_modes[{index}].{key} must be an integer 1-10 (bool excluded), got {value!r}")

    rpn = compute_rpn(severity, occurrence, detection)
    action_priority = compute_action_priority(severity, rpn)
    return {
        "id": spec["id"],
        "function": spec["function"],
        "failure_mode": spec["failure_mode"],
        "effect": spec["effect"],
        "cause": spec["cause"],
        "existing_control": existing_control,
        "severity": severity,
        "occurrence": occurrence,
        "detection": detection,
        "rpn": rpn,
        "action_priority": action_priority,
    }


def _validate_failure_modes(failure_modes: Any) -> list[dict[str, Any]]:
    """Returns the fully-built list of stored failure-mode dicts, or raises. Never returns a partial/best-effort
    result -- fail-closed, mirroring ``stakeholders.game_theory``'s own ``_validate_players``/etc. shape."""
    if not isinstance(failure_modes, list) or not failure_modes:
        raise InvariantViolation(f"FMEA_NO_FAILURE_MODES: failure_modes must be a non-empty list (methods/contracts/challenge.fmea.contract.yaml precondition: at least one), got {_shallow_describe(failure_modes)}")
    built = [_build_failure_mode(spec, index) for index, spec in enumerate(failure_modes)]
    ids = [fm["id"] for fm in built]
    duplicates = sorted({fm_id for fm_id in ids if ids.count(fm_id) > 1})
    if duplicates:
        raise InvariantViolation(f"FMEA_DUPLICATE_FAILURE_MODE_ID: failure mode id(s) {duplicates} appear more than once")
    return built


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_fmea_analysis(
    record_id: str,
    subject_ref: str,
    failure_modes: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/fmea-analysis.schema.yaml``.

    Deliberately has NO ``rpn``/``action_priority`` parameter -- both are GENUINE_COMPUTE, derived per failure
    mode by ``_build_failure_mode`` and never accepted from a caller (verified by ``tests/unit/test_fmea.py`` via
    ``inspect.signature``). Enforces all real invariants fail-closed, in order: id/version/provenance shape, then
    ``subject_ref``, then ``failure_modes`` (well-formed specs, valid 1-10 scores, unique ids, each mandatory-
    control-overridden or rpn-tiered by ``compute_action_priority``).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FMEA_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FMEA_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"FMEA_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    if not _is_nonempty_str(subject_ref):
        raise InvariantViolation(f"FMEA_INVALID_SUBJECT_REF: subject_ref must be a non-empty string, got {subject_ref!r}")

    built_failure_modes = _validate_failure_modes(failure_modes)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject_ref": subject_ref,
        # _build_failure_mode already returns a freshly-constructed dict per element (never the caller's own
        # dict object) -- no additional dict(...) copy needed here to avoid aliasing, same non-aliasing
        # guarantee stakeholders.game_theory's own generate_game_theory_model provides via an explicit
        # dict(...)-per-element copy (that module's own critic-found gap, avoided here by construction).
        "failure_modes": built_failure_modes,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_fmea_analysis -- a hand-tampered record (e.g. a spliced-in wrong rpn/action_priority) that bypassed
# the builder entirely must be caught exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Record-level only (methods/contracts/challenge.fmea.contract.yaml's own disclosed placement, matching
    stakeholders.game_theory's precedent) -- no per-failure-mode provenance to check. Fails closed on non-dict
    input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_fmea_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_fmea_analysis``, so a hand-tampered record that bypassed the builder entirely (e.g.
    a spliced-in wrong ``rpn`` or an ``action_priority`` that ignores the severity>=9 override) is caught here
    exactly as a builder-refused one would have been. THIS is where Atlas's own "不要只依賴 RPN" warning is
    re-verified independently of construction-time trust: every failure mode's ``rpn``/``action_priority`` is
    recomputed from its own stored severity/occurrence/detection and compared to the stored value. Fails closed
    on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("fmea_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("fmea_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("fmea_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject_ref")):
        return _result("fmea_content_integrity", False, [{"reason": "subject_ref missing, empty, or not a string"}], validator, timestamp)

    unknown_keys = set(record.keys()) - _STORED_RECORD_KEYS
    missing_keys = (_STORED_RECORD_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "fmea_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    failure_modes = record.get("failure_modes")
    problems: list[str] = []
    if not isinstance(failure_modes, list) or not failure_modes:
        problems.append("failure_modes missing, not a list, or empty")
        return _result("fmea_content_integrity", False, [{"problems": problems}], validator, timestamp)

    ids: list[str] = []
    for index, fm in enumerate(failure_modes):
        if not isinstance(fm, dict) or set(fm.keys()) - _FAILURE_MODE_STORED_KEYS or not _FAILURE_MODE_STORED_KEYS <= fm.keys():
            problems.append(f"failure_modes[{index}] key set mismatch or not a dict: {_shallow_describe(fm)}")
            continue
        ids.append(fm.get("id") if isinstance(fm.get("id"), str) else f"<non-str id at index {index}>")
        if not _is_nonempty_str(fm.get("id")):
            problems.append(f"failure_modes[{index}].id missing or empty")
        for key in _TEXT_FIELDS:
            if not _is_nonempty_str(fm.get(key)):
                problems.append(f"failure_modes[{index}].{key} missing or empty")
        if not isinstance(fm.get("existing_control"), str):
            problems.append(f"failure_modes[{index}].existing_control missing or not a string")
        severity, occurrence, detection = fm.get("severity"), fm.get("occurrence"), fm.get("detection")
        for key, value in (("severity", severity), ("occurrence", occurrence), ("detection", detection)):
            if not _is_valid_score(value):
                problems.append(f"failure_modes[{index}].{key} is not a valid 1-10 integer score (bool excluded): {value!r}")
        if not (_is_valid_score(severity) and _is_valid_score(occurrence) and _is_valid_score(detection)):
            continue  # cannot safely recompute rpn/action_priority from an invalid score
        expected_rpn = compute_rpn(severity, occurrence, detection)
        if fm.get("rpn") != expected_rpn:
            problems.append(f"failure_modes[{index}].rpn={fm.get('rpn')!r} does not match recomputed severity*occurrence*detection={expected_rpn}")
        expected_action_priority = compute_action_priority(severity, expected_rpn)
        if fm.get("action_priority") != expected_action_priority:
            problems.append(
                f"failure_modes[{index}].action_priority={fm.get('action_priority')!r} does not match recomputed {expected_action_priority!r} "
                f"(Atlas §11.26 L1799-1800: severity>={_SEVERITY_MANDATORY_THRESHOLD} must force MANDATORY_CONTROL_REQUIRED regardless of rpn)"
            )

    duplicates = sorted({fm_id for fm_id in ids if ids.count(fm_id) > 1})
    if duplicates:
        problems.append(f"duplicate failure mode id(s): {duplicates}")

    return _result("fmea_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_fmea_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_fmea_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
