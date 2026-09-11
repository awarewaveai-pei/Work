"""``divergent.random_stimulus`` -- F03 divergent ideation family (Atlas L375-388), 1st built member.
The family itself is entirely unbuilt before this entry (grep-confirmed: no `ai_lego/modules/divergent/`
package existed anywhere in this repo before this batch). See
``ai_lego/modules/strategy/bcg_matrix.py`` for the open-ended non-empty-list convention template, and
``ai_lego/modules/strategy/business_model_canvas.py`` for the single-legal-value structural-enforcement
template this module reuses (neither edited).

Atlas cites this method ONCE: the F03 tool table row (L386: "Random Stimulus｜打破慣性｜隨機詞/圖→強制找
關聯｜產生遠距聯想｜需後續可行性篩選"). Grep-confirmed the only real hit case-insensitively across the
whole Atlas file -- no dedicated section, same thinnest-citation class ``strategy.bcg_matrix``/
``strategy.ansoff`` already establish.

**Real invariants** (grounded in Atlas L386, each enforced BOTH at construction, raise BEFORE any record
is built, AND independently re-derived by a gate that never trusts a stored value -- same two-layer
discipline every sibling module in this package already establishes):

1. ``entries`` is a non-empty list (open-ended, no fixed count -- Atlas's own method column describes
   repeated random-stimulus draws, an unbounded count per session, same shape class
   ``strategy.bcg_matrix``'s own ``portfolio_items`` already establishes).
2. Every entry carries non-empty ``stimulus``, ``forced_connection``, and ``resulting_idea`` -- Atlas's
   own benefit ("產生遠距聯想") presumes each stimulus was actually worked through to a resulting idea,
   not just listed.
3. Every entry's ``feasibility_status`` is ALWAYS exactly ``FEASIBILITY_STATUS``
   ("NOT_YET_SCREENED") -- structurally guaranteed by parameter elimination (this invariant cannot be
   violated via the builder; the independent gate re-checks it anyway, so a hand-tampered raw dict that
   bypassed the builder entirely, e.g. claiming ``FEASIBLE``, is still caught). Grounded directly in
   Atlas's own caution: "需後續可行性篩選" (needs a SUBSEQUENT feasibility screening) -- the screening is
   explicitly a step this method never performs itself, so its own output can never legitimately carry a
   screened verdict.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-
insensitively for "random_stimulus"/"RandomStimulus" before writing any of this method's own files: zero
pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.random_stimulus"
RECORD_ID_PREFIX = "RANDOMSTIM-"

FEASIBILITY_STATUS = "NOT_YET_SCREENED"
# Atlas L386's own stated caution ("需後續可行性篩選"), made structural (see module docstring, invariant
# 3). NOT a caller-settable parameter of generate_random_stimulus_session -- every entry this builder
# produces carries exactly this value, no code path allows any other.

_ENTRY_INPUT_KEYS = frozenset({"stimulus", "forced_connection", "resulting_idea"})
_ENTRY_STORED_KEYS = _ENTRY_INPUT_KEYS | frozenset({"feasibility_status"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _entry_core_fields_are_valid(entry: dict[str, Any]) -> bool:
    """Shared predicate: the fields every entry carries regardless of input-vs-stored shape -- non-empty
    stimulus/forced_connection/resulting_idea. Called by BOTH the input and stored shape predicates
    below; does NOT itself check key-set shape or ``feasibility_status``."""
    return (
        _is_nonempty_str(entry.get("stimulus"))
        and _is_nonempty_str(entry.get("forced_connection"))
        and _is_nonempty_str(entry.get("resulting_idea"))
    )


def _entry_input_entry_is_valid(entry: Any) -> bool:
    """CALLER-SUPPLIED entry -- exactly the input keys (NO ``feasibility_status``, that field is always
    stamped by the builder, never accepted), core fields valid. Called only by the builder."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ENTRY_INPUT_KEYS:
        return False
    return _entry_core_fields_are_valid(entry)


def _entry_stored_entry_is_valid(entry: Any) -> bool:
    """STORED (already-built) entry -- exactly the stored keys, core fields valid, AND
    ``feasibility_status`` must equal the single legal value. Called only by the gate (re-derives, never
    trusts the stored value)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ENTRY_STORED_KEYS:
        return False
    if not _entry_core_fields_are_valid(entry):
        return False
    return entry.get("feasibility_status") == FEASIBILITY_STATUS


def stimulus_entry(stimulus: str, forced_connection: str, resulting_idea: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_random_stimulus_session``'s own ``entries`` parameter. Convenience
    constructor only -- emits ONLY the input keys (deliberately NO ``feasibility_status`` parameter: see
    module docstring's structural-elimination discipline); does NOT itself enforce non-emptiness of the
    overall list (``generate_random_stimulus_session`` validates whatever list of dicts it is handed,
    same convention ``strategy.bcg_matrix``'s own ``portfolio_item`` already establishes)."""
    if not _is_nonempty_str(stimulus):
        raise InvariantViolation(f"RANDOMSTIM_EMPTY_STIMULUS: stimulus must be a non-empty string, got {stimulus!r}")
    if not _is_nonempty_str(forced_connection):
        raise InvariantViolation(f"RANDOMSTIM_EMPTY_FORCED_CONNECTION: forced_connection must be a non-empty string, got {forced_connection!r}")
    if not _is_nonempty_str(resulting_idea):
        raise InvariantViolation(f"RANDOMSTIM_EMPTY_RESULTING_IDEA: resulting_idea must be a non-empty string, got {resulting_idea!r}")
    return {"stimulus": stimulus, "forced_connection": forced_connection, "resulting_idea": resulting_idea}


def generate_random_stimulus_session(
    session_id: str,
    entries: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/random-stimulus-session.schema.yaml``.

    Enforces real invariants 1+2 fail-closed, same family-wide "raise-before-construction" discipline
    every sibling module in this package already establishes. Invariant 3 (``feasibility_status``) is
    enforced by NOT accepting it as a parameter at all -- see module docstring.
    """
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RANDOMSTIM_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RANDOMSTIM_INVALID_VERSION: version must be a string, got {version!r}")

    if not isinstance(entries, list) or not entries:
        raise InvariantViolation(
            f"RANDOMSTIM_EMPTY_ENTRIES: entries must be a non-empty list (a session with zero stimuli has not actually done Random Stimulus -- "
            f"Atlas L386's own method '隨機詞/圖→強制找關聯'), got {entries!r}"
        )
    if not all(_entry_input_entry_is_valid(entry) for entry in entries):
        raise InvariantViolation(
            f"RANDOMSTIM_INVALID_ENTRY: every entry must have exactly the keys {sorted(_ENTRY_INPUT_KEYS)} (feasibility_status is stamped by the "
            f"builder, never accepted), with non-empty stimulus/forced_connection/resulting_idea, got {entries!r}"
        )

    rebuilt_entries = [
        {
            "stimulus": entry["stimulus"],
            "forced_connection": entry["forced_connection"],
            "resulting_idea": entry["resulting_idea"],
            "feasibility_status": FEASIBILITY_STATUS,
        }
        for entry in entries
    ]

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "entries": rebuilt_entries,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the overall record carries a schema-valid
    provenance_record (record-level only, see module/schema docstring -- entries carry no per-entry
    provenance in this method's shape). Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    entries = record.get("entries")
    entries = entries if isinstance(entries, list) else []
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(entries) and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"entries_checked": len(entries), "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_random_stimulus_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL THREE real invariants from the record's OWN raw fields -- does not trust any
    stored value and does NOT call ``generate_random_stimulus_session``, so a hand-tampered record that
    bypassed the builder entirely is caught here exactly as a builder-refused one would have been. In
    particular, this is the ONLY place EVERY entry's own ``feasibility_status`` is checked against the
    single legal value -- proving the builder's parameter-elimination guarantee is ALSO independently
    re-checked, not merely assumed because the builder never exposed the field. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("random_stimulus_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("random_stimulus_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("random_stimulus_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    entries = record.get("entries")
    if not isinstance(entries, list) or not entries:
        return _result("random_stimulus_integrity", False, [{"reason": "entries missing, not a list, or empty"}], validator, timestamp)
    if not all(_entry_stored_entry_is_valid(entry) for entry in entries):
        return _result(
            "random_stimulus_integrity",
            False,
            [{"reason": "entries invalid (malformed entry, empty stimulus/forced_connection/resulting_idea, or a stored feasibility_status other than NOT_YET_SCREENED)"}],
            validator,
            timestamp,
        )

    return _result("random_stimulus_integrity", True, [{"entry_count": len(entries)}], validator, timestamp)


def evaluate_random_stimulus_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then
    the independent structural integrity re-derivation. No ``evidence_labeling_required`` gate -- the
    contract sets that flag to ``false`` (see divergent.random_stimulus.contract.yaml's own
    ``quality``/``compilation_decisions``), same "only emit gates for what is actually declared true"
    discipline ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_random_stimulus_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
