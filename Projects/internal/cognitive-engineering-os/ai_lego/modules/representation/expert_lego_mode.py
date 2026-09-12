"""``representation.expert_lego_mode`` -- F24 representation/cognitive-preference/collaboration family
(Atlas L972, §11.57 L2513-2538).

Atlas's own table row (L972, verbatim): "Expert LEGO Mode | 專家自由拖拉方法 |
typed blocks→compatibility→compile | 高控制、可重用" (experts freely drag
methods together, from typed blocks through compatibility checking to
compile, giving high control and reusability). Dedicated §11.57 (L2513-2538)
gives a worked chain (JTBD→Interview→Assumption Mapping→Scenario→Monte
Carlo→Red Team→MCDA) and names the compiler's own mandatory checks: Type
check, Precondition check, Policy check, Jurisdiction check, Cost estimate,
Risk estimate, Required gate injection -- closing with the explicit rule
"因此是「自由組裝」，不是「自由破壞」" (this is therefore "free assembly," not
"free destruction").

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes -- this
one directly mirroring ``jurisdiction.market_admission_control``'s own
just-landed fail-closed pattern:

1. **Chain shape** (``ELEGO_INVALID_CHAIN`` / ``ELEGO_TOO_FEW_STEPS`` /
   ``ELEGO_DUPLICATE_STEP_ID``) -- ``chain[]`` has at least 2 well-shaped
   typed blocks, each with a unique ``step_id``.
2. **Check completeness** (``ELEGO_MISSING_CHECK`` / ``ELEGO_UNKNOWN_CHECK``
   / ``ELEGO_DUPLICATE_CHECK``) -- ``checks[]`` must declare EXACTLY the 7
   Atlas §11.57 check names, each exactly once.
3. **Derived compile status, THE real invariant this method exists to
   enforce** (``ELEGO_COMPILE_STATUS_INCONSISTENT``) -- ``compile_status``
   is NEVER a builder parameter (the caller cannot assert ``COMPILED``
   directly -- there is no such parameter); it is always mechanically
   computed as COMPILED iff every check status is PASS, else REJECTED. This
   is §11.57's own "因此是「自由組裝」，不是「自由破壞」" rule made
   structural.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"expert lego"/"expert_lego"/"ExpertLegoChain" before writing any of this
method's own files: zero pre-existing implementation or schema-title
overlap.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.expert_lego_mode"
RECORD_ID_PREFIX = "ELEGO-"
_METHOD_ID_PATTERN = re.compile(r"^[a-z_]+\.[a-z_]+$")  # cognitive/method.schema.yaml's own ADR-005b grammar

CHECK_NAMES = (
    "type_check",
    "precondition_check",
    "policy_check",
    "jurisdiction_check",
    "cost_estimate",
    "risk_estimate",
    "required_gate_injection",
)
_CHECK_NAME_SET = frozenset(CHECK_NAMES)
_CHECK_STATUSES = frozenset({"PASS", "FAIL"})
_CHAIN_STEP_KEYS = frozenset({"step_id", "method_id"})
_CHECK_KEYS = frozenset({"check", "status", "note"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _chain_step_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped chain[] entry" -- shape only, NOT step_id uniqueness,
    which needs the sibling entries and is checked once in ``generate_expert_lego_chain``/the gate (same
    division of labor ``foresight.cross_impact_analysis``'s ``event()``/``generate_cross_impact_analysis``
    split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _CHAIN_STEP_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _CHAIN_STEP_KEYS <= value.keys():
        return f"missing key(s) {sorted(_CHAIN_STEP_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("step_id")):
        return f"step_id must be a non-empty string, got {value.get('step_id')!r}"
    method_id = value.get("method_id")
    if not isinstance(method_id, str) or not _METHOD_ID_PATTERN.match(method_id):
        return f"method_id must match {_METHOD_ID_PATTERN.pattern!r}, got {method_id!r}"
    return None


def chain_block(step_id: str, method_id: str) -> dict[str, Any]:
    """One item of ``typed-objects/expert-lego-chain.schema.yaml#/properties/chain``."""
    record = {"step_id": step_id, "method_id": method_id}
    problem = _chain_step_problem(record)
    if problem is not None:
        raise InvariantViolation(f"ELEGO_INVALID_CHAIN_STEP: {problem}")
    return record


def _check_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped checks[] entry" -- shape only, NOT the exactly-7-checks
    set completeness check, which needs the sibling entries and is checked once in
    ``generate_expert_lego_chain``/the gate (same division of labor ``jurisdiction.market_admission_control``'s
    ``stage_result()``/``generate_market_admission`` split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _CHECK_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _CHECK_KEYS <= value.keys():
        return f"missing key(s) {sorted(_CHECK_KEYS - value.keys(), key=repr)}"
    if value.get("check") not in _CHECK_NAME_SET:
        return f"check must be one of {sorted(_CHECK_NAME_SET)}, got {value.get('check')!r}"
    if value.get("status") not in _CHECK_STATUSES:
        return f"status must be one of {sorted(_CHECK_STATUSES)}, got {value.get('status')!r}"
    if not _is_nonempty_str(value.get("note")):
        return f"note must be a non-empty string, got {value.get('note')!r}"
    return None


def check_result(check: str, status: str, note: str) -> dict[str, Any]:
    """One item of ``typed-objects/expert-lego-chain.schema.yaml#/properties/checks``."""
    record = {"check": check, "status": status, "note": note}
    problem = _check_problem(record)
    if problem is not None:
        raise InvariantViolation(f"ELEGO_INVALID_CHECK: {problem}")
    return record


def _derive_compile_status(checks: list[dict[str, Any]]) -> str:
    """THE real invariant. Atlas §11.57's own 'free assembly, not free destruction' rule, made mechanical:
    COMPILED iff every check is PASS. Never a caller-supplied value -- see module docstring. Assumes ``checks``
    has already been verified to declare exactly the 7 required names (callers check completeness first)."""
    all_pass = all(c.get("status") == "PASS" for c in checks)
    return "COMPILED" if all_pass else "REJECTED"


def generate_expert_lego_chain(
    record_id: str,
    chain: list[dict[str, Any]],
    checks: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/expert-lego-chain.schema.yaml``.

    Rebuilds every ``chain[]``/``checks[]`` entry via ``chain_block()``/``check_result()`` (never trusting the
    caller's raw dicts), then enforces the method contract's own real invariants fail-closed, in order:
    id/version/provenance shape, at least 2 unique-step_id chain blocks, exactly the 7 Atlas §11.57 check
    names each exactly once -- and, the invariant this method exists to enforce, DERIVES ``compile_status``
    from the rebuilt checks (this function has NO parameter for the caller to assert it directly). No caller
    input can ever force ``COMPILED`` past a FAIL, missing, unknown, or duplicate check.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ELEGO_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ELEGO_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("ELEGO_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(chain, list):
        raise InvariantViolation(f"ELEGO_INVALID_CHAIN: chain must be a list, got {type(chain).__name__}")
    rebuilt_chain: list[dict[str, Any]] = []
    for i, s in enumerate(chain):
        if not isinstance(s, dict):
            raise InvariantViolation(f"ELEGO_INVALID_CHAIN: chain[{i}] must be a dict, got {s!r}")
        try:
            rebuilt_chain.append(chain_block(s.get("step_id"), s.get("method_id")))
        except InvariantViolation as error:
            raise InvariantViolation(f"ELEGO_INVALID_CHAIN: chain[{i}]: {error}") from error
    if len(rebuilt_chain) < 2:
        raise InvariantViolation(f"ELEGO_TOO_FEW_STEPS: at least 2 chain steps are required, got {len(rebuilt_chain)} -- a chain of 1 block has nothing to check compatibility against")
    step_ids = [s["step_id"] for s in rebuilt_chain]
    if len(step_ids) != len(set(step_ids)):
        duplicate = sorted({s for s in step_ids if step_ids.count(s) > 1})
        raise InvariantViolation(f"ELEGO_DUPLICATE_STEP_ID: step_id(s) {duplicate} declared more than once")

    if not isinstance(checks, list):
        raise InvariantViolation(f"ELEGO_INVALID_CHECKS: checks must be a list, got {type(checks).__name__}")
    rebuilt_checks: list[dict[str, Any]] = []
    for i, c in enumerate(checks):
        if not isinstance(c, dict):
            raise InvariantViolation(f"ELEGO_INVALID_CHECKS: checks[{i}] must be a dict, got {c!r}")
        try:
            rebuilt_checks.append(check_result(c.get("check"), c.get("status"), c.get("note")))
        except InvariantViolation as error:
            raise InvariantViolation(f"ELEGO_INVALID_CHECKS: checks[{i}]: {error}") from error

    check_names = [c["check"] for c in rebuilt_checks]
    check_name_set = set(check_names)
    if len(check_names) != len(check_name_set):
        duplicate = sorted({c for c in check_names if check_names.count(c) > 1})
        raise InvariantViolation(f"ELEGO_DUPLICATE_CHECK: check(s) {duplicate} declared more than once")
    missing = sorted(_CHECK_NAME_SET - check_name_set)
    if missing:
        raise InvariantViolation(f"ELEGO_MISSING_CHECK: check(s) {missing} are required by Atlas §11.57's own 7-check compiler pipeline but not present")
    extra = sorted(check_name_set - _CHECK_NAME_SET)
    if extra:
        raise InvariantViolation(f"ELEGO_UNKNOWN_CHECK: check(s) {extra} are not part of Atlas §11.57's 7-check compiler pipeline")

    compile_status = _derive_compile_status(rebuilt_checks)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "chain": rebuilt_chain,
        "checks": rebuilt_checks,
        "compile_status": compile_status,
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


def evaluate_check_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the exactly-7-checks invariant directly from raw fields using the SAME ``_check_problem``
    predicate the builder uses -- without this the gate could pass a hand-tampered record missing a check or
    carrying a duplicate. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("check_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    checks = record.get("checks")
    problems: list[str] = []
    if isinstance(checks, list):
        malformed = [f"checks[{i}]: {problem}" for i, problem in ((i, _check_problem(c)) for i, c in enumerate(checks)) if problem]
        problems.extend(malformed)
        well_shaped = [c for c in checks if _check_problem(c) is None]
        check_names = [c["check"] for c in well_shaped]
        check_name_set = set(check_names)
        if not malformed:
            if len(check_names) != len(check_name_set):
                problems.append(f"duplicate check in checks[]: {check_names!r}")
            missing = sorted(_CHECK_NAME_SET - check_name_set)
            if missing:
                problems.append(f"missing check(s): {missing}")
            extra = sorted(check_name_set - _CHECK_NAME_SET)
            if extra:
                problems.append(f"unknown check(s): {extra}")
    else:
        problems.append("checks must be a list")
    passed = not problems
    return _result("check_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_compile_status_consistency_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §11.57's own 'free assembly, not free destruction' rule directly from raw fields --
    recomputes the expected compile_status from checks and compares against the record's own claimed status.
    Fails closed on malformed entries rather than crashing, and does NOT trust that the builder's own
    recomputation already ran (a hand-tampered compile_status bypasses the builder entirely)."""
    if not isinstance(record, dict):
        return _result("compile_status_consistency", False, [{"reason": "record is not a dict"}], validator, timestamp)
    checks = record.get("checks")
    claimed = record.get("compile_status")
    problems: list[str] = []

    if not isinstance(checks, list) or any(_check_problem(c) is not None for c in checks):
        problems.append("checks is missing or contains malformed entries")
    elif {c["check"] for c in checks} != _CHECK_NAME_SET or len(checks) != len(_CHECK_NAME_SET):
        problems.append("checks does not declare exactly the 7 required check names")
    if claimed not in {"COMPILED", "REJECTED"}:
        problems.append(f"compile_status must be COMPILED or REJECTED, got {claimed!r}")

    if not problems:
        expected = _derive_compile_status(checks)
        if claimed != expected:
            problems.append(f"compile_status={claimed!r} but recomputation gives {expected!r}")

    passed = not problems
    return _result("compile_status_consistency", passed, [{"problems": problems}], validator, timestamp)


def evaluate_expert_lego_chain_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_check_completeness_gate(record, validator, timestamp),
        evaluate_compile_status_consistency_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
