"""``insight.jtbd`` -- F06 human/customer insight family, OPENING member (F06 had zero built methods before
this batch -- grep-confirmed no ``ai_lego/modules/insight/`` directory existed at batch start; 1 of 9 concurrent
agents opening F02/F03/F04/F06/F08 members in this same parallel batch).

Atlas cites this method TWICE: F06 tool table row (L461: "JTBD｜理解使用者真正要完成的工作｜Situation→Motivation→
Job→Desired outcome→Workaround｜避免 feature-first｜最適合新產品") and dedicated §11.12 (L1463-1485), which gives
the method's own literal 3-clause template::

    When [situation],
    I want to [motivation/job],
    so I can [desired outcome].

plus an explicit standalone rule (§11.12, verbatim): "必須搭配 Local Evidence -- 不能假設不同文化的 motivation
相同" (must pair with Local Evidence -- motivation cannot be assumed identical across cultures). Grep-confirmed
these are the only 2 real citations for this method case-insensitively across the whole Atlas file (every other
"jtbd" hit is a DIFFERENT method's own best-pairing/recipe column naming JTBD as its upstream companion, e.g.
framing.how_might_we's "JTBD → HMW" chain, strategy.stp's "JTBD / Survey → STP" chain -- neither of those methods
is edited or imported from here).

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a stored
flag):

1. **3-clause completeness** (``JTBD_EMPTY_SITUATION`` / ``JTBD_EMPTY_MOTIVATION`` / ``JTBD_EMPTY_DESIRED_OUTCOME``):
   ``situation``, ``motivation``, and ``desired_outcome`` must each be a non-empty string -- §11.12's own
   template has exactly 3 required clauses ("When [situation], I want to [motivation/job], so I can [desired
   outcome]."); a statement missing any one of them is not actually a JTBD statement.

2. **Local Evidence is mandatory, never optional** (``JTBD_EMPTY_LOCAL_EVIDENCE``): ``local_evidence`` must be a
   non-empty string. This is §11.12's own EXPLICIT standalone rule, disclosed as a HARD requirement -- unlike
   most Tier 1 methods in this corpus, this is not an inferred caution, it is the method's own textually-cited
   mandatory pairing.

``workaround`` is NULLABLE (the table row's own 5th, least-certain element, L461's "→Workaround") but, IF
present, must be a non-empty string -- same "empty string is not a legal disclosure" discipline every other
content field in this record uses (an empty-string workaround would misrepresent "no data entered" as
"genuinely disclosed, empty workaround").

Record-level-only provenance (NOT per-field) -- a deliberate BATCH-WIDE decision for this whole F06 build
(matching ``decomposition.functional_decomposition``'s own record-level placement), made specifically to avoid
the per-item/record-level ambiguity that hit both the F02 and F03 batches (see their own WORKLOG entries). A
JtbdStatement's 5 content fields describe ONE coherent claim about one job, not a list of independently-sourced
items each needing its own epistemic stamp.

``quality.evidence_labeling_required`` is ``false`` on the method contract, NOT because §11.12's own caution is
ignored, but because that flag's own schema definition (``method.schema.yaml``) scopes it to claims originating
from an ``EvidenceSet`` INPUT -- this method takes no such input (``inputs.required: []``). §11.12's real
caution is instead enforced STRUCTURALLY: ``local_evidence`` is a required, non-nullable field (invariant #2
above), not a conditional per-claim label.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "jtbd"/"jobs_to_be_done"/
"JtbdStatement" before writing any of this method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.jtbd"
RECORD_ID_PREFIX = "JTBD-"

_INPUT_KEYS = frozenset({"situation", "motivation", "desired_outcome", "workaround", "local_evidence", "provenance"})
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "situation", "motivation", "desired_outcome", "workaround", "local_evidence", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_null_or_nonempty_str(value: Any) -> bool:
    """``workaround``'s own shape: either None (no workaround identified -- legitimate) or a non-empty string
    (an empty string is refused, same discipline every other content field in this record uses)."""
    return value is None or _is_nonempty_str(value)


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``bcg_matrix``/
    ``functional_decomposition``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_jtbd_statement(
    record_id: str,
    situation: str,
    motivation: str,
    desired_outcome: str,
    local_evidence: str,
    provenance: dict[str, Any],
    *,
    workaround: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/jtbd-statement.schema.yaml``.

    Enforces both real invariants fail-closed, in order: id/version/provenance shape, then the 3-clause
    completeness invariant (situation/motivation/desired_outcome each non-empty), then local_evidence's own
    mandatory-non-empty invariant, then workaround's null-or-non-empty shape. A JTBD statement failing any one
    of these is refused at construction, never silently stored with a blank clause.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"JTBD_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"JTBD_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"JTBD_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not _is_nonempty_str(situation):
        raise InvariantViolation(f"JTBD_EMPTY_SITUATION: situation must be a non-empty string (§11.12's own 'When [situation]' clause), got {situation!r}")
    if not _is_nonempty_str(motivation):
        raise InvariantViolation(f"JTBD_EMPTY_MOTIVATION: motivation must be a non-empty string (§11.12's own 'I want to [motivation/job]' clause), got {motivation!r}")
    if not _is_nonempty_str(desired_outcome):
        raise InvariantViolation(f"JTBD_EMPTY_DESIRED_OUTCOME: desired_outcome must be a non-empty string (§11.12's own 'so I can [desired outcome]' clause), got {desired_outcome!r}")
    if not _is_nonempty_str(local_evidence):
        raise InvariantViolation(
            f"JTBD_EMPTY_LOCAL_EVIDENCE: local_evidence must be a non-empty string -- §11.12's own explicit "
            f"standalone rule ('必須搭配 Local Evidence -- 不能假設不同文化的 motivation 相同') is NEVER optional, "
            f"got {local_evidence!r}"
        )
    if not _is_null_or_nonempty_str(workaround):
        raise InvariantViolation(f"JTBD_INVALID_WORKAROUND: workaround must be None or a non-empty string, got {workaround!r}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "situation": situation,
        "motivation": motivation,
        "desired_outcome": desired_outcome,
        "workaround": workaround,
        "local_evidence": local_evidence,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input. Never call
# generate_jtbd_statement -- a hand-tampered record that bypassed the builder entirely must be caught exactly
# as a builder-refused one would have been.
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


def evaluate_jtbd_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_jtbd_statement``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Checks id/version shape, the 3-clause
    completeness invariant, local_evidence's own mandatory-non-empty invariant, and workaround's null-or-
    non-empty shape, all independently. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("jtbd_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("jtbd_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("jtbd_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    problems: list[str] = []
    if not _is_nonempty_str(record.get("situation")):
        problems.append("situation missing or empty")
    if not _is_nonempty_str(record.get("motivation")):
        problems.append("motivation missing or empty")
    if not _is_nonempty_str(record.get("desired_outcome")):
        problems.append("desired_outcome missing or empty")
    if not _is_nonempty_str(record.get("local_evidence")):
        problems.append("local_evidence missing or empty (§11.12's own mandatory pairing rule)")
    if not _is_null_or_nonempty_str(record.get("workaround")):
        problems.append("workaround present but not null and not a non-empty string")

    return _result("jtbd_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_jtbd_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring and strategy.bcg_matrix.contract.yaml's own identical "only
    emit gates for what is actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_jtbd_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
