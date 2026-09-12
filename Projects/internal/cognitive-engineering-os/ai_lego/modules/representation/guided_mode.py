"""``representation.guided_mode`` -- F24 representation/cognitive-preference/collaboration family (Atlas
L971, §11.56 L2493-2510).

Atlas's own table row (L971, verbatim): "Guided Mode | 系統逐步提問 | one
question at a time→progressive disclosure | 降工具選擇焦慮" (the system asks
one question at a time, progressively disclosing the method, lowering
tool-selection anxiety). Dedicated §11.56 (L2493-2510) gives the worked
example directly: instead of asking "要不要使用 Fishbone？" the system asks
"你目前是在找「可能原因」，還是已經有數據想驗證原因？" and auto-selects the
method from the answer -- benefit "Method complexity 留在 engine，不丟給使用
者" (method complexity stays in the engine, not pushed onto the user).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Answer-trail traceability** (``GUIDED_EMPTY_QA_TRAIL`` /
   ``GUIDED_INVALID_QA_PAIR``) -- ``qa_trail[]`` must contain at least 1
   well-shaped, non-empty question->answer pair. A ``selected_method_id``
   with no real question ever asked is exactly the black-box selection
   Atlas §11.56's own benefit exists to prevent.
2. **Live catalog resolution, THE real invariant this method exists to
   enforce** (``GUIDED_METHOD_NOT_REGISTERED``) -- ``selected_method_id``
   must resolve as an ACTIVE contract in the corpus's own ``MethodCatalog``
   (``ai_lego/platform/ai_execution/method_resolver.py``), not merely be a
   well-formed id string. A session "selecting" a method that does not
   actually exist in this corpus is the same "improvise it from narrative"
   failure ADR-023/the Master Plan's own METHOD_RESOLUTION_BLOCKED red line
   exists to forbid, made structural here at the per-session record level
   too.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"guided mode"/"guided_mode"/"GuidedModeSession" before writing any of this
method's own files: zero pre-existing implementation or schema-title
overlap.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.guided_mode"
RECORD_ID_PREFIX = "GUIDED-"
_METHOD_ID_PATTERN = re.compile(r"^[a-z_]+\.[a-z_]+$")  # cognitive/method.schema.yaml's own ADR-005b grammar
_QA_KEYS = frozenset({"question", "answer"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_well_shaped_method_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_METHOD_ID_PATTERN.match(value))


def _qa_pair_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped qa_trail[] entry". Both ``qa_pair()`` (construction
    layer) and the gate (independent re-derivation layer) consult it, same single-shared-predicate discipline
    ``foresight.cross_impact_analysis``'s own ``_event_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _QA_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _QA_KEYS <= value.keys():
        return f"missing key(s) {sorted(_QA_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("question")):
        return f"question must be a non-empty string, got {value.get('question')!r}"
    if not _is_nonempty_str(value.get("answer")):
        return f"answer must be a non-empty string, got {value.get('answer')!r}"
    return None


def qa_pair(question: str, answer: str) -> dict[str, Any]:
    """One item of ``typed-objects/guided-mode-session.schema.yaml#/properties/qa_trail``."""
    record = {"question": question, "answer": answer}
    problem = _qa_pair_problem(record)
    if problem is not None:
        raise InvariantViolation(f"GUIDED_INVALID_QA_PAIR: {problem}")
    return record


def generate_guided_mode_session(
    record_id: str,
    qa_trail: list[dict[str, Any]],
    selected_method_id: str,
    provenance: dict[str, Any],
    method_catalog: Any,
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/guided-mode-session.schema.yaml``.

    Rebuilds every ``qa_trail[]`` entry via ``qa_pair()`` (never trusting the caller's raw dicts), then
    enforces the method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    at least 1 real question->answer pair, well-shaped ``selected_method_id`` -- and, the invariant this
    method exists to enforce, resolves ``selected_method_id`` against the LIVE ``method_catalog`` (an object
    exposing ``resolve(method_ids: list[str]) -> dict``, the same shape ``MethodCatalog.resolve`` returns),
    refusing to build a session naming a method with no ACTIVE contract in this corpus.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"GUIDED_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"GUIDED_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("GUIDED_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(qa_trail, list):
        raise InvariantViolation(f"GUIDED_INVALID_QA_TRAIL: qa_trail must be a list, got {type(qa_trail).__name__}")
    rebuilt_qa_trail: list[dict[str, Any]] = []
    for i, qa in enumerate(qa_trail):
        if not isinstance(qa, dict):
            raise InvariantViolation(f"GUIDED_INVALID_QA_TRAIL: qa_trail[{i}] must be a dict, got {qa!r}")
        try:
            rebuilt_qa_trail.append(qa_pair(qa.get("question"), qa.get("answer")))
        except InvariantViolation as error:
            raise InvariantViolation(f"GUIDED_INVALID_QA_TRAIL: qa_trail[{i}]: {error}") from error
    if not rebuilt_qa_trail:
        raise InvariantViolation(
            "GUIDED_EMPTY_QA_TRAIL: qa_trail must contain at least 1 question->answer pair -- Atlas §11.56's "
            "own 'one question at a time' pipeline requires a real question to have been asked before a "
            "method can be selected"
        )

    if not _is_well_shaped_method_id(selected_method_id):
        raise InvariantViolation(f"GUIDED_INVALID_METHOD_ID: selected_method_id must match {_METHOD_ID_PATTERN.pattern!r}, got {selected_method_id!r}")

    resolution = method_catalog.resolve([selected_method_id])
    if resolution["blocked"] is not None:
        raise InvariantViolation(f"GUIDED_METHOD_NOT_REGISTERED: {resolution['blocked']['reason']}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "qa_trail": rebuilt_qa_trail,
        "selected_method_id": selected_method_id,
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


def evaluate_qa_trail_traceability_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the answer-trail-non-emptiness and selected_method_id shape invariants directly from raw
    fields using the SAME ``_qa_pair_problem``/``_is_well_shaped_method_id`` predicates the builder uses --
    without this the gate could pass a hand-tampered record with an emptied qa_trail. Fails closed on
    malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("qa_trail_traceability", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []
    qa_trail = record.get("qa_trail")
    if isinstance(qa_trail, list):
        malformed = [f"qa_trail[{i}]: {problem}" for i, problem in ((i, _qa_pair_problem(qa)) for i, qa in enumerate(qa_trail)) if problem]
        problems.extend(malformed)
        if not malformed and not qa_trail:
            problems.append("qa_trail is empty -- at least 1 question->answer pair is required")
    else:
        problems.append("qa_trail must be a list")
    if not _is_well_shaped_method_id(record.get("selected_method_id")):
        problems.append(f"selected_method_id must match {_METHOD_ID_PATTERN.pattern!r}, got {record.get('selected_method_id')!r}")
    passed = not problems
    return _result("qa_trail_traceability", passed, [{"problems": problems}], validator, timestamp)


def evaluate_method_registered_gate(record: dict[str, Any], method_catalog: Any, validator: str, timestamp: str) -> dict[str, Any]:
    """Re-resolves ``selected_method_id`` against the LIVE ``method_catalog`` directly from raw fields --
    without this the gate could pass a hand-tampered record naming a method that was never actually
    resolved (or has since been deprecated), never trusting that the builder's own resolution already ran."""
    if not isinstance(record, dict):
        return _result("method_registered", False, [{"reason": "record is not a dict"}], validator, timestamp)
    selected_method_id = record.get("selected_method_id")
    if not _is_well_shaped_method_id(selected_method_id):
        return _result("method_registered", False, [{"reason": f"selected_method_id is not well-shaped: {selected_method_id!r}"}], validator, timestamp)
    resolution = method_catalog.resolve([selected_method_id])
    passed = resolution["blocked"] is None
    evidence: list[Any] = [{"resolution": resolution}]
    return _result("method_registered", passed, evidence, validator, timestamp)


def evaluate_guided_mode_gates(record: dict[str, Any], method_catalog: Any, validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_qa_trail_traceability_gate(record, validator, timestamp),
        evaluate_method_registered_gate(record, method_catalog, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
