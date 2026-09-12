"""``foresight.delphi`` -- F13 unknown-unknowns/foresight family (Atlas L668-685), with a dedicated section
(§12.23, L2821-2828).

Atlas's own table row (L684, verbatim): "Delphi | 匿名多輪專家估計 | round1->
summary->round2->dispersion | 降權威效應、保留分歧" (anonymous multi-round
expert estimation; reduce authority effects, preserve dispersion). §12.23's
own explicit limitation (L2827, verbatim): "限制：Consensus 不是 truth；應
保存 minority range" (limitation: consensus is not truth; the minority range
must be preserved).

THREE real invariants, all load-bearing, enforced at TWO independent layers
each (construction-time refusal + independent gate re-derivation), same
belt-and-suspenders discipline every prior slice in this corpus establishes:

1. **Anonymity is structural** (``DELPHI_IDENTITY_CLAIM_FORBIDDEN``) --
   ``assert_no_identity_claim`` refuses to construct a record carrying any
   identity-shaped key on a response, modeled directly on
   ``challenge.red_team``'s ``FORBIDDEN_AUTHORITY_KEYS``/
   ``assert_no_authority_claim`` pattern. ``typed-objects/delphi-
   study.schema.yaml``'s own response-level ``additionalProperties: false``
   independently refuses a hand-crafted bypass. A named expert defeats
   exactly the "降權威效應" (reduce authority effect) benefit Atlas states
   for this method -- so anonymity must be structurally impossible to
   violate, not merely discouraged.
2. **Minority range preserved** (``DELPHI_MINORITY_RANGE_NOT_PRESERVED``) --
   §12.23's own L2827 rule: a record carrying ``consensus_summary`` (always
   required by this method) must ALSO carry a non-empty
   ``minority_positions[]`` OR an explicit ``minority_positions_none_
   recorded_reason``. Collapsing to consensus while silently discarding the
   minority range is precisely the failure §12.23 names.
3. **>=2 rounds, each with >=2 responses** (``DELPHI_TOO_FEW_ROUNDS`` /
   round-shape errors) -- Delphi is definitionally multi-round (Atlas's own
   "round1->summary->round2"), and dispersion across a single response is
   meaningless. Round numbering must be exactly 1..N, unique, in order
   (``DELPHI_INVALID_ROUND_SEQUENCE``).

``dispersion`` is GENUINE_COMPUTE (see ``compute_dispersion``): population
standard deviation of the FINAL round's numeric estimates, disclosed as a
compilation decision (Atlas names the concept, gives no formula) in
``typed-objects/delphi-study.schema.yaml``. Never a builder parameter
(verified by ``tests/unit/test_delphi.py`` via ``inspect.signature``, same
idiom ``epistemic.bayesian_updating``'s own ``posterior`` establishes); the
gate independently recomputes it from the record's own stored rounds and
FAILs on any mismatch beyond an explicit float tolerance.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"delphi"/"德菲"/"德爾菲" before writing any of this method's own files: zero
pre-existing implementation or schema title overlap.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.delphi"
RECORD_ID_PREFIX = "DELPHI-"

# Same class of "representative blocklist for the runtime layer's own defense" comment
# challenge.red_team's own FORBIDDEN_AUTHORITY_KEYS carries -- the schema's
# additionalProperties:false on a response is the exhaustive, structural second layer.
FORBIDDEN_IDENTITY_KEYS = frozenset({"name", "expert_name", "author", "affiliation", "email", "title"})

_RESPONSE_KEYS = frozenset({"participant_id", "estimate", "rationale"})
_ROUND_KEYS = frozenset({"round_number", "responses"})

# Compilation decision (disclosed, schema module docstring): storage rounds to 8dp (matching
# epistemic.bayesian_updating's own convention), so a 1e-9 gate tolerance is one order of magnitude tighter than
# that unit -- absorbs float round-trip noise, never masks a real tamper.
_FLOAT_TOLERANCE = 1e-9


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_estimate(value: Any) -> bool:
    """An estimate must be a real, finite number. ``bool`` excluded (Python's ``bool`` is an ``int`` subclass --
    same documented trap ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` guards against). ``int``
    is unconditionally finite in Python and is not range-restricted (see schema compilation_decisions -- Delphi
    estimates are general, not probability-only)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _response_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped, anonymous response". Both ``response()`` (construction
    layer) and the gates (independent re-derivation layer) consult it, same single-shared-predicate discipline
    ``epistemic.evidence_matrix``'s own ``_link_problem`` establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _RESPONSE_KEYS
    if unknown:
        identity_hit = unknown & FORBIDDEN_IDENTITY_KEYS
        if identity_hit:
            return f"identity-shaped key(s) {sorted(identity_hit)} forbidden -- Delphi responses must be anonymous (Atlas L684: 降權威效應)"
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _is_nonempty_str(value.get("participant_id")):
        return f"participant_id must be a non-empty string, got {value.get('participant_id')!r}"
    if not _is_valid_estimate(value.get("estimate")):
        return f"estimate must be a real finite number (bool excluded), got {value.get('estimate')!r}"
    if "rationale" in value and not _is_nonempty_str(value.get("rationale")):
        return f"rationale, if present, must be a non-empty string, got {value.get('rationale')!r}"
    return None


def response(participant_id: str, estimate: float, rationale: str | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/delphi-study.schema.yaml#/properties/rounds/items/properties/responses``.
    Accepts only the 3 legal keyword parameters -- there is no ``**kwargs`` escape hatch through which a caller
    could smuggle an identity-shaped key onto a response built through this helper."""
    record: dict[str, Any] = {"participant_id": participant_id, "estimate": estimate}
    if rationale is not None:
        record["rationale"] = rationale
    problem = _response_problem(record)
    if problem is not None:
        raise InvariantViolation(f"DELPHI_INVALID_RESPONSE: {problem}")
    return record


def _round_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ROUND_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ROUND_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ROUND_KEYS - value.keys(), key=repr)}"
    round_number = value.get("round_number")
    if isinstance(round_number, bool) or not isinstance(round_number, int) or round_number < 1:
        return f"round_number must be an integer >= 1 (bool excluded), got {round_number!r}"
    responses = value.get("responses")
    if not isinstance(responses, list) or len(responses) < 2:
        return "responses must be a list of at least 2 items -- a dispersion computed across a single response is meaningless"
    for i, r in enumerate(responses):
        problem = _response_problem(r)
        if problem is not None:
            return f"responses[{i}]: {problem}"
    return None


def round_(round_number: int, responses: list[dict[str, Any]]) -> dict[str, Any]:
    """One item of ``typed-objects/delphi-study.schema.yaml#/properties/rounds``. Rebuilds every response via
    ``response()`` (never trusting the caller's raw dicts), the same discipline ``epistemic.evidence_matrix``'s
    ``link()``/``generate_evidence_matrix`` split establishes."""
    rebuilt_responses: list[dict[str, Any]] = []
    if not isinstance(responses, list):
        raise InvariantViolation(f"DELPHI_INVALID_ROUND: responses must be a list, got {type(responses).__name__}")
    for i, r in enumerate(responses):
        # Validated against the RAW dict `r` first (via _response_problem, the same predicate response() uses)
        # -- NOT extracted field-by-field into response(r.get("participant_id"), ...), which would silently
        # DROP any surplus key (including a smuggled identity key) instead of refusing it. Dropping is not
        # refusing: a caller could smuggle {"participant_id": "P1", "estimate": 5, "name": "Alice"} and have
        # "name" silently vanish while construction still SUCCEEDS -- exactly the "silently accepted, not
        # refused" failure this method's own anonymity rule exists to prevent.
        problem = _response_problem(r)
        if problem is not None:
            raise InvariantViolation(f"DELPHI_INVALID_ROUND: responses[{i}]: {problem}")
        rebuilt = {"participant_id": r["participant_id"], "estimate": r["estimate"]}
        if "rationale" in r:
            rebuilt["rationale"] = r["rationale"]
        rebuilt_responses.append(rebuilt)
    record = {"round_number": round_number, "responses": rebuilt_responses}
    problem = _round_problem(record)
    if problem is not None:
        raise InvariantViolation(f"DELPHI_INVALID_ROUND: {problem}")
    return record


def assert_no_identity_claim(record: dict[str, Any]) -> None:
    """§12.23/Atlas L684's own anonymity rule, checked structurally on a full record -- not just trusting that
    ``response()``'s own construction-time check already ran (a hand-crafted/tampered record must still be
    caught). Modeled directly on ``challenge.red_team``'s ``assert_no_authority_claim``, including its
    non-dict-input fail-closed guard."""
    if not isinstance(record, dict):
        raise InvariantViolation(f"DELPHI_IDENTITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    for rnd in record.get("rounds", []):
        if not isinstance(rnd, dict):
            continue
        for resp in rnd.get("responses", []):
            if not isinstance(resp, dict):
                continue
            violations = FORBIDDEN_IDENTITY_KEYS & resp.keys()
            if violations:
                raise InvariantViolation(
                    f"DELPHI_IDENTITY_CLAIM_FORBIDDEN: response {resp.get('participant_id')!r} in round "
                    f"{rnd.get('round_number')!r} carries key(s) {sorted(violations)} that identify the respondent "
                    "(Atlas L684: Delphi responses must be anonymous)"
                )


def compute_dispersion(estimates: list[float]) -> float:
    """GENUINE_COMPUTE: population standard deviation. Never accepted as an input -- always derived here, and
    independently re-derived by ``evaluate_dispersion_integrity_gate``. Raises ``DELPHI_DISPERSION_UNDEFINED``
    (not a crash, not a silent 0) on an empty list -- the degenerate case a hand-tampered record's final round
    could otherwise present to this pure-compute function, even though ``round_()`` already forbids constructing
    a round with fewer than 2 responses (this function trusts its own argument's shape, the same "pure compute,
    fails closed on its own degenerate input" boundary ``epistemic.bayesian_updating``'s own ``compute_posterior``
    already establishes). Result rounded to 8 decimal places (module docstring)."""
    if not estimates:
        raise InvariantViolation("DELPHI_DISPERSION_UNDEFINED: at least one numeric estimate is required to compute dispersion, got an empty list")
    n = len(estimates)
    mean = sum(estimates) / n
    variance = sum((x - mean) ** 2 for x in estimates) / n
    return round(math.sqrt(variance), 8)


def _final_round(rounds: list[dict[str, Any]]) -> dict[str, Any]:
    return max(rounds, key=lambda r: r["round_number"])


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_delphi_study(
    record_id: str,
    rounds: list[dict[str, Any]],
    consensus_summary: str,
    provenance: dict[str, Any],
    *,
    minority_positions: list[str] | None = None,
    minority_positions_none_recorded_reason: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/delphi-study.schema.yaml``.

    Deliberately has NO ``dispersion`` parameter -- GENUINE_COMPUTE via ``compute_dispersion``, never
    caller-supplied. Enforces all real invariants fail-closed, in order: id/version/provenance shape, >=2 rounds
    each rebuilt via ``round_()`` (which itself enforces >=2 responses and per-response anonymity), round_number
    sequence exactly 1..N, consensus_summary non-empty, minority-range preservation (§12.23 L2827), then
    ``assert_no_identity_claim`` as a final defense-in-depth pass over the fully assembled record before
    computing ``dispersion`` and returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DELPHI_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DELPHI_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("DELPHI_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(rounds, list):
        raise InvariantViolation(f"DELPHI_INVALID_ROUNDS: rounds must be a list, got {type(rounds).__name__}")
    rebuilt_rounds: list[dict[str, Any]] = []
    for i, r in enumerate(rounds):
        if not isinstance(r, dict):
            raise InvariantViolation(f"DELPHI_INVALID_ROUNDS: rounds[{i}] must be a dict, got {r!r}")
        try:
            rebuilt_rounds.append(round_(r.get("round_number"), r.get("responses", [])))
        except InvariantViolation as error:
            raise InvariantViolation(f"DELPHI_INVALID_ROUNDS: rounds[{i}]: {error}") from error

    if len(rebuilt_rounds) < 2:
        raise InvariantViolation(f"DELPHI_TOO_FEW_ROUNDS: at least 2 rounds are required (Atlas L684: round1->summary->round2), got {len(rebuilt_rounds)}")

    round_numbers = sorted(r["round_number"] for r in rebuilt_rounds)
    if round_numbers != list(range(1, len(rebuilt_rounds) + 1)):
        raise InvariantViolation(f"DELPHI_INVALID_ROUND_SEQUENCE: round_number values must be exactly 1..{len(rebuilt_rounds)}, unique, got {round_numbers}")
    rebuilt_rounds = sorted(rebuilt_rounds, key=lambda r: r["round_number"])

    if not _is_nonempty_str(consensus_summary):
        raise InvariantViolation(f"DELPHI_INVALID_CONSENSUS_SUMMARY: consensus_summary must be a non-empty string, got {consensus_summary!r}")

    rebuilt_minority_positions: list[str] = []
    if minority_positions is not None:
        if not isinstance(minority_positions, list):
            raise InvariantViolation(f"DELPHI_INVALID_MINORITY_POSITIONS: minority_positions must be a list, got {type(minority_positions).__name__}")
        for i, m in enumerate(minority_positions):
            if not _is_nonempty_str(m):
                raise InvariantViolation(f"DELPHI_INVALID_MINORITY_POSITIONS: minority_positions[{i}] must be a non-empty string, got {m!r}")
            rebuilt_minority_positions.append(m)

    if minority_positions_none_recorded_reason is not None and not _is_nonempty_str(minority_positions_none_recorded_reason):
        raise InvariantViolation(f"DELPHI_INVALID_MINORITY_NONE_REASON: minority_positions_none_recorded_reason, if provided, must be a non-empty string, got {minority_positions_none_recorded_reason!r}")

    if rebuilt_minority_positions and minority_positions_none_recorded_reason is not None:
        raise InvariantViolation(
            "DELPHI_CONTRADICTORY_MINORITY_STATE: minority_positions_none_recorded_reason must not be present alongside a non-empty minority_positions[] -- "
            "these two fields assert contradictory things about whether a minority view was recorded"
        )
    if not rebuilt_minority_positions and not minority_positions_none_recorded_reason:
        raise InvariantViolation(
            "DELPHI_MINORITY_RANGE_NOT_PRESERVED: consensus_summary is recorded without a non-empty minority_positions[] or an explicit "
            "minority_positions_none_recorded_reason -- Atlas §12.23 (L2827): 'Consensus 不是 truth；應保存 minority range'"
        )

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "rounds": rebuilt_rounds,
        "minority_positions": rebuilt_minority_positions,
        "consensus_summary": consensus_summary,
        "provenance": copy.deepcopy(provenance),
    }
    if minority_positions_none_recorded_reason is not None:
        record["minority_positions_none_recorded_reason"] = minority_positions_none_recorded_reason

    assert_no_identity_claim(record)

    final_estimates = [r["estimate"] for r in _final_round(rebuilt_rounds)["responses"]]
    record["dispersion"] = compute_dispersion(final_estimates)
    return record


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_delphi_study -- a hand-tampered record that bypassed the builder entirely must be caught exactly as a
# builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_anonymity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks Atlas L684's anonymity rule structurally on any record handed to it -- not just trusting that
    ``generate_delphi_study``'s own construction-time check already ran. A record with no well-formed ``rounds``
    list to inspect has nothing anonymity-verifiable in it -- FAILS CLOSED rather than vacuously reporting PASS
    for a record that never actually proved anything (``assert_no_identity_claim`` alone would silently pass
    ``{}``/``{"junk": 1}``, since an absent/malformed ``rounds`` iterates as empty)."""
    if not isinstance(record, dict) or not isinstance(record.get("rounds"), list):
        return _result("anonymity", False, [{"reason": "record is not a dict, or rounds is not a list"}], validator, timestamp)
    try:
        assert_no_identity_claim(record)
        return _result("anonymity", True, [{"checked_keys": sorted(FORBIDDEN_IDENTITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("anonymity", False, [{"error": str(error)}], validator, timestamp)


def evaluate_round_structure_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives round/response shape and sequencing directly from raw fields using the SAME ``_round_problem``/
    ``_response_problem`` predicates the builder uses -- without this the gate could pass records the builder
    refuses. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("round_structure", False, [{"reason": "record is not a dict"}], validator, timestamp)
    rounds = record.get("rounds")
    problems: list[str] = []
    if not isinstance(rounds, list):
        problems.append("rounds must be a list")
        return _result("round_structure", False, [{"problems": problems}], validator, timestamp)
    if len(rounds) < 2:
        problems.append(f"fewer than 2 rounds: {len(rounds)}")
    malformed = [f"rounds[{i}]: {problem}" for i, problem in ((i, _round_problem(r)) for i, r in enumerate(rounds)) if problem]
    problems.extend(malformed)
    if not malformed:
        round_numbers = sorted(r["round_number"] for r in rounds)
        if round_numbers != list(range(1, len(rounds) + 1)):
            problems.append(f"round_number values must be exactly 1..{len(rounds)}, unique, got {round_numbers}")
    passed = not problems
    return _result("round_structure", passed, [{"rounds_checked": len(rounds), "problems": problems}], validator, timestamp)


def evaluate_minority_range_preserved_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives §12.23's own L2827 rule directly from raw fields: a non-empty consensus_summary must be
    accompanied by a non-empty minority_positions[] OR minority_positions_none_recorded_reason, and the two must
    not both be present (contradictory minority state)."""
    if not isinstance(record, dict):
        return _result("minority_range_preserved", False, [{"reason": "record is not a dict"}], validator, timestamp)
    consensus_summary = record.get("consensus_summary")
    if not _is_nonempty_str(consensus_summary):
        return _result("minority_range_preserved", False, [{"reason": "consensus_summary missing, empty, or not a string"}], validator, timestamp)
    minority_positions = record.get("minority_positions")
    reason = record.get("minority_positions_none_recorded_reason")
    has_positions = isinstance(minority_positions, list) and any(_is_nonempty_str(m) for m in minority_positions)
    has_reason = _is_nonempty_str(reason)
    problems: list[str] = []
    if has_positions and has_reason:
        problems.append("both minority_positions[] and minority_positions_none_recorded_reason are present -- contradictory minority state")
    if not has_positions and not has_reason:
        problems.append("consensus_summary is recorded without a non-empty minority_positions[] or minority_positions_none_recorded_reason (Atlas §12.23 L2827)")
    passed = not problems
    return _result("minority_range_preserved", passed, [{"problems": problems}], validator, timestamp)


def evaluate_dispersion_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ``dispersion`` directly from the record's OWN stored final-round estimates -- does not trust
    any stored value and does NOT call ``generate_delphi_study``, so a hand-tampered record (e.g. a spliced-in
    wrong ``dispersion``, or a final round whose estimates were altered after construction) is caught here
    exactly as a builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("dispersion_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    rounds = record.get("rounds")
    if not isinstance(rounds, list) or not rounds:
        return _result("dispersion_integrity", False, [{"reason": "rounds must be a non-empty list"}], validator, timestamp)
    valid_rounds = [r for r in rounds if isinstance(r, dict) and isinstance(r.get("round_number"), int) and not isinstance(r.get("round_number"), bool)]
    if not valid_rounds:
        return _result("dispersion_integrity", False, [{"reason": "no round with a valid integer round_number"}], validator, timestamp)
    final = max(valid_rounds, key=lambda r: r["round_number"])
    responses = final.get("responses")
    if not isinstance(responses, list) or not responses:
        return _result("dispersion_integrity", False, [{"reason": "final round has no responses"}], validator, timestamp)
    estimates: list[float] = []
    for r in responses:
        if isinstance(r, dict) and _is_valid_estimate(r.get("estimate")):
            estimates.append(r["estimate"])
    if not estimates:
        return _result("dispersion_integrity", False, [{"reason": "final round has no response with a valid numeric estimate"}], validator, timestamp)
    try:
        expected = compute_dispersion(estimates)
    except InvariantViolation as error:
        return _result("dispersion_integrity", False, [{"reason": f"dispersion undefined for the record's own final-round estimates: {error}"}], validator, timestamp)
    stored = record.get("dispersion")
    if not isinstance(stored, (int, float)) or isinstance(stored, bool) or abs(stored - expected) > _FLOAT_TOLERANCE:
        return _result("dispersion_integrity", False, [{"reason": f"dispersion={stored!r} does not match recomputed {expected!r} (tolerance {_FLOAT_TOLERANCE})"}], validator, timestamp)
    return _result("dispersion_integrity", True, [{"recomputed_dispersion": expected}], validator, timestamp)


def evaluate_delphi_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_round_structure_gate(record, validator, timestamp),
        evaluate_anonymity_gate(record, validator, timestamp),
        evaluate_minority_range_preserved_gate(record, validator, timestamp),
        evaluate_dispersion_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
