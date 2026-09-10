"""Schema-change compatibility classification + worst-of verdict aggregation -- deterministic compute,
backing ``database_data.schema_compatibility_analysis``.

Same Trusted Compute discipline every prior genuine-compute module in this package establishes
(``compute/attack_tree/aggregate.py``, ``compute/morphological_analysis/combination_generation.py``,
``compute/impact_effort/classification.py``): whether one schema change is compatible or breaking, and what
a whole migration's own OVERALL verdict is, are DECIDED here by a real deterministic lookup + reduction,
never asserted by a caller (Atlas §29 rule 6: "數學與統計必須由 Trusted Compute 執行" -- the same rule
``impact_effort/classification.py`` already cites for its own threshold comparison, extended here to a
closed-vocabulary LOOKUP rather than a numeric comparison).

Atlas F21's own row (L903) and Execution Contract §28's own "Compatibility Analysis" stage (step 3 of 15,
grounded in the ADR-005a-corrected 15-step sequence ``database_data.expand_contract_migration`` already
transcribes) name the CONCEPT ("檢查 schema migration 相容性") but give no field-level change-type taxonomy
-- neither does EC §29's own "必須評估" checklist (Lock Duration/Table Size/.../Data Reconciliation, real
but a DIFFERENT concern: operational migration-risk factors, not per-change data-shape compatibility).
CHANGE_TYPE_COMPATIBILITY below is therefore DISCLOSED external domain knowledge (the same class of
disclosed-not-Atlas-cited vocabulary ``decision.ice``'s own 1-10 Sean Ellis scale and ``decision.rice``'s
own reach unit already establish for this package), grounded in standard expand-contract /
backward-compatible-schema-evolution practice: 5 of its 13 entries are the task's own explicit examples
(add_nullable_column=compatible, drop_column=breaking, widen_type=compatible, narrow_type=breaking,
add_not_null_column_without_default=breaking); the other 8 extend the SAME two questions every entry
answers -- (1) could an existing WRITER (old code, unaware of the new schema) produce data the new schema
rejects, and (2) could existing DATA (rows already written under the old schema) violate the new schema --
to a small, disclosed, non-exhaustive set of common DDL operations.

Binary per-change classification only (compatible/breaking), not a directional BACKWARD/FORWARD split the
way Confluent-style schema-registry practice distinguishes -- Atlas's own row gives no directional
vocabulary, and the task's own explicit example set is itself binary (see method contract's own
compilation_decisions for the disclosed scope limit).
"""

from __future__ import annotations

from typing import Any

COMPATIBILITY_COMPATIBLE = "compatible"
COMPATIBILITY_BREAKING = "breaking"
VALID_COMPATIBILITY_CLASSES = frozenset({COMPATIBILITY_COMPATIBLE, COMPATIBILITY_BREAKING})

VERDICT_SAFE_FOR_ZERO_DOWNTIME = "safe_for_zero_downtime"
VERDICT_REQUIRES_COORDINATED_DEPLOY = "requires_coordinated_deploy"
VALID_OVERALL_VERDICTS = frozenset({VERDICT_SAFE_FOR_ZERO_DOWNTIME, VERDICT_REQUIRES_COORDINATED_DEPLOY})

CHANGE_TYPE_COMPATIBILITY: dict[str, str] = {
    # -- compatible: neither an existing writer nor existing data can violate the new schema --
    "add_nullable_column": COMPATIBILITY_COMPATIBLE,  # an old writer that never sets it leaves it NULL, which the new column already permits
    "add_column_with_default": COMPATIBILITY_COMPATIBLE,  # an old writer that omits it gets the declared default, satisfying any NOT NULL the new column carries
    "widen_type": COMPATIBILITY_COMPATIBLE,  # e.g. INT->BIGINT, VARCHAR(50)->VARCHAR(200): every value valid under the old (narrower) type stays valid under the new (wider) one
    "relax_not_null_to_nullable": COMPATIBILITY_COMPATIBLE,  # loosening a constraint can never make a previously-valid row invalid
    "drop_unique_constraint": COMPATIBILITY_COMPATIBLE,  # removing a constraint can never make previously-valid data invalid
    "add_index": COMPATIBILITY_COMPATIBLE,  # changes query plans/performance only, not the set of valid data or the interface existing readers/writers see
    "drop_index": COMPATIBILITY_COMPATIBLE,  # same -- index presence is outside the data-compatibility surface this method classifies
    # -- breaking: an existing writer or existing data can violate the new schema --
    "drop_column": COMPATIBILITY_BREAKING,  # any reader still selecting/expecting the column breaks
    "narrow_type": COMPATIBILITY_BREAKING,  # e.g. BIGINT->INT, VARCHAR(100)->VARCHAR(50): existing values may no longer fit
    "tighten_nullable_to_not_null": COMPATIBILITY_BREAKING,  # existing NULL rows violate the new constraint
    "add_not_null_column_without_default": COMPATIBILITY_BREAKING,  # existing rows have no value to satisfy the new constraint, and an old writer that omits the column fails the insert
    "rename_column": COMPATIBILITY_BREAKING,  # functionally drop-the-old-name + add-the-new-name from the perspective of any reader/writer still bound to the old name
    "add_unique_constraint": COMPATIBILITY_BREAKING,  # existing duplicate values violate the new constraint
}
KNOWN_CHANGE_TYPES = frozenset(CHANGE_TYPE_COMPATIBILITY)


def classify_change(change_type: str) -> str:
    """Pure lookup: given a KNOWN ``change_type``, returns its fixed compatibility classification. Not a
    caller-supplied value at any layer -- see module docstring. Precondition: ``change_type in
    KNOWN_CHANGE_TYPES`` (callers validate shape first, same 'validate first, then compute' split
    ``compute/attack_tree/aggregate.py``'s own SCOPE note establishes)."""
    return CHANGE_TYPE_COMPATIBILITY[change_type]


def classify_changes(changes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Returns a NEW list of ``{change_type, target, compatibility_class}`` -- one entry per input change, in
    the SAME order. Precondition: every entry is already shape-valid (a dict with a known ``change_type`` and
    a non-empty ``target``) -- see module scope note. Never mutates ``changes``."""
    return [{"change_type": change["change_type"], "target": change["target"], "compatibility_class": classify_change(change["change_type"])} for change in changes]


def aggregate_overall_verdict(classifications: list[dict[str, Any]]) -> str:
    """WORST-OF-ALL reduction over ``classifications`` (each already produced by ``classify_changes``): a
    single ``breaking`` entry anywhere makes the WHOLE migration ``requires_coordinated_deploy`` -- one
    unsafe change is enough to forbid a zero-downtime rollout, the same 'weakest link' principle
    ``compute/attack_tree/aggregate.py``'s own AND-node cost/skill/detectability aggregation already applies
    for a structurally analogous 'every element must hold' question. ``safe_for_zero_downtime`` only when
    EVERY classification is ``compatible``. Precondition: ``classifications`` is non-empty (an empty
    migration has nothing to aggregate -- callers refuse an empty ``changes`` list before this is ever
    called, see module scope note)."""
    if any(entry["compatibility_class"] == COMPATIBILITY_BREAKING for entry in classifications):
        return VERDICT_REQUIRES_COORDINATED_DEPLOY
    return VERDICT_SAFE_FOR_ZERO_DOWNTIME
