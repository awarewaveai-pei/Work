"""``stakeholders.salience_model`` -- F07 stakeholder/power/negotiation family (Atlas L483-507), one of 10
concurrent members opened in the same parallel batch (family `stakeholders` already minted by sibling
``stakeholders.stakeholder_map`` in this same batch, grep-confirmed before writing any of this method's own
files -- not opened here). Read ``ai_lego/modules/insight/jtbd.py`` (builder+gate two-layer discipline and
honest-citation docstring convention) and ``ai_lego/modules/strategy/vrio.py`` (fixed-named-dimension +
GENUINE_COMPUTE closed-lookup-table convention) in full as this module's primary templates -- neither edited.

Atlas cites this method ONCE, a bare F07 tool table row (L489: "Salience Model｜Power/Legitimacy/Urgency｜
三維評分與分類｜加入正當性與急迫性"), no dedicated section. Grep-confirmed this is the only real "salience" hit
case-insensitively across the whole Atlas file -- no §4 composition formula, no §14.1 legal-chain mention, no
§22.3 gate-table row.

**Honesty note on classification (task-mandated disclosure)**: this is the real, publicly documented
Mitchell-Agle-Wood (1997) stakeholder salience model ("Toward a Theory of Stakeholder Identification and
Salience: Defining the Principle of Who and What Really Counts," Academy of Management Review 22(4)), whose
3 dimension NAMES (Power/Legitimacy/Urgency) Atlas L489 does cite. The academic model's own 7-type
classification (dormant/discretionary/demanding/dominant/dangerous/dependent/definitive stakeholders) is,
however, NOT given anywhere in Atlas -- L489 is a bare table row with no classification table, a thinner
citation than e.g. ``strategy.vrio``'s own §12.13, which at least names the method by its full academic
apparatus even though its classification table is likewise not Atlas-cited. Adopting the 7 academic type
NAMES here would overstate what this single table row actually grounds. This module therefore uses a more
conservative, self-disclosing GENUINE_COMPUTE scheme instead: ``dimension_count`` (0-3, a plain count of which
of the 3 dimensions are present) and ``salience_class`` (an 8-way -- 2^3 -- named combination of WHICH
dimensions are present, e.g. ``POWER_LEGITIMACY_URGENCY``, ``LEGITIMACY_ONLY``, ``NONE``), both real,
deterministic, and TOTAL, but honestly this suite's own naming, not Mitchell-Agle-Wood's.

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a stored
flag), grounded in Atlas L489 plus the task's own explicit shape mandate:

1. **Named-dimension shape** (``SALIENCE_INVALID_POWER`` / ``_LEGITIMACY`` / ``_URGENCY``): each of
   ``power``/``legitimacy``/``urgency`` must be exactly ``{"present": <bool>, "justification": <None or
   non-empty str>}`` -- Atlas L489's own 3 named dimensions, each individually a fixed axis (unlike VRIO's 4
   interchangeable list entries), never a 4th/5th unnamed dimension, never missing.

2. **"不能只打勾沒證據" -- justification mandatory when true** (folded into the same 3 error codes above):
   ``justification`` must be a non-empty string whenever ``present`` is ``True``. When ``present`` is
   ``False``, ``justification`` is free (``None``, or an optional disclosed note on why it was judged absent)
   -- a ONE-DIRECTIONAL constraint, same precedent ``decision.moscow``'s own ``bucket==WONT -> reason``
   if/then already establishes, not a bidirectional "false implies null" rule.

3. **``dimension_count``/``salience_class`` are GENUINE_COMPUTE** (``derive_salience_outputs`` below), a
   single TOTAL function over all 8 combinations of the 3 booleans -- never a builder parameter, never
   caller-supplied. ``generate_salience_assessment`` does NOT accept either as a parameter at all; the
   independent gate re-derives both from the record's own raw ``power``/``legitimacy``/``urgency`` and
   rejects any stored value that disagrees, same structural elimination ``strategy.vrio``'s
   ``competitive_implication`` and ``strategy.bcg_matrix``'s ``quadrant`` already establish.

4. **``stakeholder_name`` non-empty** (``SALIENCE_EMPTY_STAKEHOLDER_NAME``): a 3-dimension score with no named
   subject cannot be audited against reality later -- same reasoning ``strategy.vrio``'s own
   ``resource_description`` invariant already establishes for a different fixed-subject method.

**Known trap, explicitly guarded (task-mandated disclosure)**: Python's ``bool`` is a subclass of ``int``
(``isinstance(True, int)`` is ``True``), so a naive ``isinstance(x, int) and 0 <= x <= 3`` range check on the
stored ``dimension_count`` would silently ACCEPT a hand-tampered record whose ``dimension_count`` is the bool
``True`` (which equals ``1``) instead of a real int. ``_is_valid_dimension_count`` below explicitly excludes
``bool`` (``isinstance(value, int) and not isinstance(value, bool)``) before the range check, and
``evaluate_salience_content_integrity_gate`` uses it rather than a bare ``isinstance(..., int)`` check.

Record-level-only provenance (NOT per-dimension) -- a deliberate BATCH-WIDE decision for this whole F07 build
(matching ``insight.jtbd``'s own F06-batch-wide record-level placement). A SalienceAssessment's fields are one
coherent judgment about one stakeholder, not a list of independently-sourced items.

``quality.evidence_labeling_required`` is ``false`` on the method contract -- that flag's own schema
definition (``method.schema.yaml``) scopes it to claims originating from an ``EvidenceSet`` INPUT, which this
method does not take (``inputs.required: []``), same reasoning ``insight.jtbd``'s own contract already
establishes for an analogous no-EvidenceSet-input method.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "salience"/"SALNCE" before writing
any of this method's own files: zero pre-existing implementation (only forward-references in
``method-inventory.yaml`` and ``stakeholders.stakeholder_map.contract.yaml`` already disclosing this method as
unbuilt).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.salience_model"
RECORD_ID_PREFIX = "SALNCE-"
COMPUTATION_PROVENANCE_REF = "ai_lego.modules.stakeholders.salience_model.derive_salience_outputs"

_DIMENSION_KEYS = frozenset({"present", "justification"})
_STORED_KEYS = frozenset(
    {"id", "version", "generated_by_method", "stakeholder_name", "power", "legitimacy", "urgency", "dimension_count", "salience_class", "computation_provenance_ref", "provenance"}
)

NONE_CLASS = "NONE"
POWER_ONLY = "POWER_ONLY"
LEGITIMACY_ONLY = "LEGITIMACY_ONLY"
URGENCY_ONLY = "URGENCY_ONLY"
POWER_LEGITIMACY = "POWER_LEGITIMACY"
POWER_URGENCY = "POWER_URGENCY"
LEGITIMACY_URGENCY = "LEGITIMACY_URGENCY"
POWER_LEGITIMACY_URGENCY = "POWER_LEGITIMACY_URGENCY"
VALID_SALIENCE_CLASSES: frozenset[str] = frozenset(
    {NONE_CLASS, POWER_ONLY, LEGITIMACY_ONLY, URGENCY_ONLY, POWER_LEGITIMACY, POWER_URGENCY, LEGITIMACY_URGENCY, POWER_LEGITIMACY_URGENCY}
)
# This suite's own 8-way (2^3) named combination -- NOT the Mitchell-Agle-Wood 7-type academic labels. See
# module docstring's honesty note.

# Real, TOTAL lookup table (all 8 combinations of 3 present/absent booleans): (power, legitimacy, urgency) ->
# salience_class. Every cell listed explicitly, same explicit-cell-listing discipline strategy.vrio's own
# _IMPLICATION_BY_ANSWERS/strategy.bcg_matrix's own _QUADRANT_BY_AXES already establish.
_CLASS_BY_PRESENCE: dict[tuple[bool, bool, bool], str] = {
    (False, False, False): NONE_CLASS,
    (True, False, False): POWER_ONLY,
    (False, True, False): LEGITIMACY_ONLY,
    (False, False, True): URGENCY_ONLY,
    (True, True, False): POWER_LEGITIMACY,
    (True, False, True): POWER_URGENCY,
    (False, True, True): LEGITIMACY_URGENCY,
    (True, True, True): POWER_LEGITIMACY_URGENCY,
}
assert len(_CLASS_BY_PRESENCE) == 8, "Salience class table must be TOTAL over all 8 present/absent combinations"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_null_or_nonempty_str(value: Any) -> bool:
    """Same "empty string is not a legal disclosure" discipline ``insight.jtbd``'s own ``workaround`` field
    uses: either ``None`` or a non-empty string."""
    return value is None or _is_nonempty_str(value)


def _is_valid_dimension_count(value: Any) -> bool:
    """Guards the ``bool``-is-``int``-subclass trap (module docstring): a bare ``isinstance(value, int)``
    would accept ``True``/``False`` as if they were real counts. ``bool`` is explicitly excluded before the
    range check."""
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 3


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``insight.jtbd``/
    ``strategy.bcg_matrix``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _dimension_is_valid(entry: Any) -> bool:
    """Shared predicate for ONE of power/legitimacy/urgency, called by BOTH the builder and the gate so
    neither can drift from the other. Checks exact key shape, a REAL ``bool`` for ``present`` (not merely
    "truthy"), null-or-non-empty ``justification``, and the "不能只打勾沒證據" invariant (``present=True``
    requires a non-empty, non-``None`` ``justification``)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _DIMENSION_KEYS:
        return False
    present = entry.get("present")
    if not isinstance(present, bool):
        return False
    justification = entry.get("justification")
    if not _is_null_or_nonempty_str(justification):
        return False
    if present and justification is None:
        return False
    return True


def salience_dimension(present: bool, justification: str | None = None) -> dict[str, Any]:
    """One INPUT entry for ``generate_salience_assessment``'s own ``power``/``legitimacy``/``urgency``
    parameters. Convenience constructor: enforces THIS entry's own shape (real bool, null-or-non-empty
    justification, and the "不能只打勾沒證據" rule) but nothing about sibling dimensions or the record as a
    whole -- ``generate_salience_assessment`` re-validates whatever dict it is handed for each dimension
    regardless of how it was built, same convention ``strategy.vrio``'s own ``question_entry`` /
    ``strategy.bcg_matrix``'s own ``portfolio_item`` already establish."""
    if not isinstance(present, bool):
        raise InvariantViolation(f"SALIENCE_INVALID_PRESENCE_TYPE: present must be a real bool (not {type(present).__name__}), got {present!r}")
    if not _is_null_or_nonempty_str(justification):
        raise InvariantViolation(f"SALIENCE_INVALID_JUSTIFICATION: justification must be None or a non-empty string, got {justification!r}")
    if present and justification is None:
        raise InvariantViolation("SALIENCE_MISSING_JUSTIFICATION: present=True requires a non-empty justification -- 不能只打勾沒證據 (cannot check a dimension true with no disclosed evidence)")
    return {"present": present, "justification": justification}


def derive_salience_outputs(power_present: bool, legitimacy_present: bool, urgency_present: bool) -> tuple[int, str]:
    """GENUINE_COMPUTE: the sole authority for turning the 3 real dimension booleans into
    ``(dimension_count, salience_class)``. Called by BOTH the builder (at construction) and the gate
    (re-derived from raw fields) -- neither can drift from the other, and the two outputs can never disagree
    with each other since a single function computes both from the same 3 inputs. Pure and total over all 8
    legal 3-tuples of real booleans; raises only if an input is not a real ``bool`` (defense in depth -- by
    the time this is called, ``generate_salience_assessment``/``evaluate_salience_content_integrity_gate``
    have already confirmed each via ``_dimension_is_valid``)."""
    for name, value in (("power_present", power_present), ("legitimacy_present", legitimacy_present), ("urgency_present", urgency_present)):
        if not isinstance(value, bool):
            raise InvariantViolation(f"SALIENCE_INVALID_PRESENCE_TYPE: {name} must be a real bool (not {type(value).__name__}), got {value!r}")
    key = (power_present, legitimacy_present, urgency_present)
    if key not in _CLASS_BY_PRESENCE:
        raise InvariantViolation(f"SALIENCE_UNRESOLVABLE_CLASS: {key!r} is not a legal 3-tuple of real booleans")
    salience_class = _CLASS_BY_PRESENCE[key]
    dimension_count = sum(1 for present in key if present)
    return dimension_count, salience_class


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_salience_assessment(
    record_id: str,
    stakeholder_name: str,
    power: dict[str, Any],
    legitimacy: dict[str, Any],
    urgency: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/salience-model.schema.yaml``.

    Enforces all real invariants fail-closed, in order: id/version/provenance shape, ``stakeholder_name``
    non-empty, then each of the 3 named dimensions (shape, real bool, "不能只打勾沒證據"). Deliberately has NO
    ``dimension_count``/``salience_class`` parameter -- see module docstring's GENUINE_COMPUTE invariant 3:
    always computed here via ``derive_salience_outputs``, never accepted from the caller, so there is no code
    path through which a caller could construct a record whose stored count/class disagrees with its own 3
    dimensions.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SALIENCE_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SALIENCE_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"SALIENCE_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    if not _is_nonempty_str(stakeholder_name):
        raise InvariantViolation(f"SALIENCE_EMPTY_STAKEHOLDER_NAME: stakeholder_name must be a non-empty string, got {stakeholder_name!r}")

    if not _dimension_is_valid(power):
        raise InvariantViolation(
            f"SALIENCE_INVALID_POWER: power must be {{'present': <bool>, 'justification': <None or non-empty str>}}, with a non-empty justification "
            f"required when present is True (不能只打勾沒證據), got {_shallow_describe(power)}"
        )
    if not _dimension_is_valid(legitimacy):
        raise InvariantViolation(
            f"SALIENCE_INVALID_LEGITIMACY: legitimacy must be {{'present': <bool>, 'justification': <None or non-empty str>}}, with a non-empty "
            f"justification required when present is True (不能只打勾沒證據), got {_shallow_describe(legitimacy)}"
        )
    if not _dimension_is_valid(urgency):
        raise InvariantViolation(
            f"SALIENCE_INVALID_URGENCY: urgency must be {{'present': <bool>, 'justification': <None or non-empty str>}}, with a non-empty "
            f"justification required when present is True (不能只打勾沒證據), got {_shallow_describe(urgency)}"
        )

    dimension_count, salience_class = derive_salience_outputs(power["present"], legitimacy["present"], urgency["present"])

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "stakeholder_name": stakeholder_name,
        "power": dict(power),
        "legitimacy": dict(legitimacy),
        "urgency": dict(urgency),
        "dimension_count": dimension_count,
        "salience_class": salience_class,
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_salience_assessment -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input. No per-dimension provenance to check (record-level-only, see module
    docstring)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_salience_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_salience_assessment``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. In particular, this is the ONLY
    place the stored ``dimension_count``/``salience_class`` are checked against a fresh
    ``derive_salience_outputs`` recomputation from the record's own ``power``/``legitimacy``/``urgency``
    ``present`` values -- using ``_is_valid_dimension_count`` (not a bare ``isinstance(..., int)``) so a
    hand-tampered ``dimension_count: True`` cannot slip past as if it equalled a real ``1`` (module docstring's
    bool-is-int-subclass trap). Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("salience_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("salience_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("salience_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("stakeholder_name")):
        return _result("salience_content_integrity", False, [{"reason": "stakeholder_name missing or empty"}], validator, timestamp)

    dimensions = {"power": record.get("power"), "legitimacy": record.get("legitimacy"), "urgency": record.get("urgency")}
    invalid_dims = sorted(name for name, entry in dimensions.items() if not _dimension_is_valid(entry))
    if invalid_dims:
        return _result(
            "salience_content_integrity",
            False,
            [{"reason": f"invalid dimension entries {invalid_dims} -- each must be {{'present': <bool>, 'justification': <non-empty str, required when present is True>}}"}],
            validator,
            timestamp,
        )

    try:
        recomputed_count, recomputed_class = derive_salience_outputs(dimensions["power"]["present"], dimensions["legitimacy"]["present"], dimensions["urgency"]["present"])
    except InvariantViolation as error:
        return _result("salience_content_integrity", False, [{"reason": f"UNRESOLVABLE: {error}"}], validator, timestamp)

    stored_count = record.get("dimension_count")
    if not _is_valid_dimension_count(stored_count) or stored_count != recomputed_count:
        return _result(
            "salience_content_integrity",
            False,
            [{"reason": "stored dimension_count missing, not a real int in [0,3], or disagrees with recomputation", "stored": stored_count, "recomputed": recomputed_count}],
            validator,
            timestamp,
        )

    stored_class = record.get("salience_class")
    if stored_class not in VALID_SALIENCE_CLASSES or stored_class != recomputed_class:
        return _result(
            "salience_content_integrity",
            False,
            [{"reason": "stored salience_class missing, unrecognized, or disagrees with recomputation", "stored": stored_class, "recomputed": recomputed_class}],
            validator,
            timestamp,
        )

    # critic-found gap (2026-09-11): dimension_count/salience_class were re-derived above, but
    # computation_provenance_ref itself was never checked against the module's own constant -- a value
    # forged to point at a DIFFERENT method's compute function passed both this gate and the schema.
    if record.get("computation_provenance_ref") != COMPUTATION_PROVENANCE_REF:
        return _result(
            "salience_content_integrity",
            False,
            [{"reason": "computation_provenance_ref does not match this method's own compute function", "stored": record.get("computation_provenance_ref"), "expected": COMPUTATION_PROVENANCE_REF}],
            validator,
            timestamp,
        )

    return _result(
        "salience_content_integrity",
        True,
        [{"stakeholder_name": record["stakeholder_name"], "dimension_count": recomputed_count, "salience_class": recomputed_class}],
        validator,
        timestamp,
    )


def evaluate_salience_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring and ``insight.jtbd``'s own identical "only emit gates for
    what is actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_salience_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
