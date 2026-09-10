"""``association.mind_map`` -- F04 "關聯映射與組合" (Associative Mapping & Combination) family, 1st member
(family 0/6 built before this batch; contract-backlog.yaml's own `association.mind_map` entry under this
exact method_id is a NAMING-FORMAT `worked_example` lifted from MACHINE_READABLE_SPEC_PLAN.md §4 --
`contract_status: pending`, NOT a real built method -- confirmed by direct grep before writing this file, and
NOT edited by this module or its contract; this module's own orchestrating task mints the real tier_1 entry
separately, in `methods/registry/contract-backlog.yaml`, not here).

Atlas's citations (grep-confirmed, whole-file, 19 "Mind Map"/"心智圖" hits, all read): F04 tool table row
(L411: "Mind Map | 自由樹狀聯想 | 中心→主枝→次枝→關鍵詞 | 外化工作記憶 | Affinity、Concept Map"), the F04 mermaid
diagram (L418-426, Mind Map's own UNTYPED edges contrasted directly against Concept Map's typed edges in the
SAME diagram), and the PRIMARY structural citation -- dedicated §11.1 (L1124-1172, "心智圖 Mind Map"), whose
own 5-step 標準使用方式 is transcribed verbatim into this module's invariants:

1. 中心只放一個主題或問題 (L1131) -- exactly ONE ``central_topic``, a single string field, not a list.
2. 第一層放主要方向，不急著要求 MECE (L1132) -- ``main_branches[]``, deliberately NOT required to be mutually
   exclusive/exhaustive in CONTENT (only id-uniqueness is checked, never label/content overlap).
3. 第二、三層放關鍵詞、例子、疑問、素材 (L1133) -- ``sub_branches[]`` (level 2) each optionally carrying
   ``keywords[]`` (level 3, flat strings -- the table's own literal citation terminus "→關鍵詞"; Atlas draws no
   field-level distinction among keyword/example/question/material, so one flat string array covers all four).
4. 發散完成後切到 Affinity Diagram 做分群 (L1134) + 推薦搭配 "Mind Map → Affinity Diagram → Concept Map / Issue
   Tree" (L1172) -- names ``association.affinity_diagram``/``association.concept_map`` as the next step; BOTH
   are unbuilt at this module's write time (concurrent siblings in this same batch, per this task's own
   constraint not to depend on or invent their shape) -- left as open_questions, not invented.
5. 若開始出現「A 造成 B」等關係，切換 Concept Map / Causal DAG，不要硬用 Mind Map 表達因果 (L1135) + 限制
   (L1167-1169: "邊沒有正式語意"／"不能因為兩個東西畫在一起就宣稱存在因果"／"不適合作為正式證據圖譜") -- THE
   structural point this module's own shape enforces, not a runtime guard: ``main_branches``/``sub_branches``
   are NESTED (a sub_branch lives inside exactly one main_branch's own ``sub_branches[]`` array), never an
   id-cross-referenced graph. There is no field anywhere a caller could populate to assert a cross-branch or
   causal link -- Atlas's own "no formal edge semantics" limitation is foreclosed BY CONSTRUCTION, same
   "structural guarantee, not a denylist" class ``framing.non_goals``'s own closed-key-set reasoning already
   establishes for a different limitation.

Ruled OUT as unrelated (read directly, not merely grepped): "Mind Map View" (F24 Representation table L966,
"Representation Contract" L1040-1051, §11.55 L2468-2482, §15.1 L3606-3619) -- a RENDERING VIEW of an
arbitrary Knowledge Object ("View 只保存 layout/filters/visible_fields/presentation_preferences，不得複製
Knowledge 本體", L1053), not this method's own typed-object shape.

Due diligence (VERIFIED before writing): grepped the whole ai_lego tree case-insensitively for "mind_map"/
"mind map" -- zero pre-existing implementation. Read ``ai_lego/modules/framing/non_goals.py`` (nested-entry
shape-check convention, closest sibling with NO compute layer) and
``ai_lego/modules/decision/decision_tree.py`` (the ONLY other tree-SHAPED sibling in this suite -- confirmed
its own "NESTED, not id-cross-referenced, because a node can only ever belong to one parent" representation
choice, reused here for the identical reason, at a FIXED 3-level depth rather than decision_tree's own
arbitrary-depth/``MAX_TREE_DEPTH``-bounded recursion, since Atlas's own citation names a fixed 4-level
structure, not an open-ended one). No compute/ package: no genuine arithmetic or derived-value citation
anywhere in Atlas's own text for this method (contrast ``framing.five_w_one_h``'s own ``information_gaps``)
-- not invented.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this suite already establishes:

1. Tree shape/completeness (``MINDMAP_EMPTY_CENTRAL_TOPIC`` / ``MINDMAP_INVALID_MAIN_BRANCHES`` /
   ``MINDMAP_INVALID_BRANCH_ENTRY``): ``central_topic`` a genuinely non-empty string; ``main_branches`` a
   non-empty list of well-shaped entries (non-empty id/label, valid provenance dict, optional non-empty
   ``sub_branches[]`` of well-shaped entries, each optionally carrying a non-empty ``keywords[]`` of
   non-empty strings).
2. Whole-tree id uniqueness (``MINDMAP_DUPLICATE_BRANCH_ID``): every ``main_branch`` id AND every nested
   ``sub_branch`` id, across the ENTIRE record (not merely within one level), is unique -- same invariant
   class ``framing.non_goals``'s own ``NONGOALS_DUPLICATE_ITEM_ID`` establishes, applied recursively across
   two nesting levels so a future consumer can address any branch node by id unambiguously.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "association.mind_map"
RECORD_ID_PREFIX = "MINDMAP-"

_SUB_BRANCH_REQUIRED_KEYS = frozenset({"id", "label", "provenance"})
_SUB_BRANCH_ALLOWED_KEYS = _SUB_BRANCH_REQUIRED_KEYS | frozenset({"keywords"})
_MAIN_BRANCH_REQUIRED_KEYS = frozenset({"id", "label", "provenance"})
_MAIN_BRANCH_ALLOWED_KEYS = _MAIN_BRANCH_REQUIRED_KEYS | frozenset({"sub_branches"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a recursive ``repr()`` over caller-supplied
    input of unknown size/depth, same denial-of-service-in-an-error-path avoidance
    ``framing.non_goals``'s own ``_shallow_describe`` already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _keywords_shape_is_valid(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(k) for k in value)


def _sub_branch_shape_is_valid(entry: Any) -> bool:
    """Level 2. Atlas §11.1 step 3 -- id/label required; ``keywords[]`` (level 3) OPTIONAL, a non-empty list
    of non-empty strings when present (the citation's own terminus -- no level 4 invented)."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not _SUB_BRANCH_REQUIRED_KEYS.issubset(keys) or not keys.issubset(_SUB_BRANCH_ALLOWED_KEYS):
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("label")):
        return False
    if not isinstance(entry.get("provenance"), dict):
        return False
    if "keywords" in entry and not _keywords_shape_is_valid(entry["keywords"]):
        return False
    return True


def _main_branch_shape_is_valid(entry: Any) -> bool:
    """Level 1. Atlas §11.1 step 2 -- id/label required; ``sub_branches[]`` (level 2) OPTIONAL, a non-empty
    list of well-shaped ``_sub_branch_shape_is_valid`` entries when present."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not _MAIN_BRANCH_REQUIRED_KEYS.issubset(keys) or not keys.issubset(_MAIN_BRANCH_ALLOWED_KEYS):
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("label")):
        return False
    if not isinstance(entry.get("provenance"), dict):
        return False
    if "sub_branches" in entry:
        subs = entry["sub_branches"]
        if not isinstance(subs, list) or not subs or not all(_sub_branch_shape_is_valid(s) for s in subs):
            return False
    return True


def _collect_branch_ids(main_branches: list[dict[str, Any]]) -> list[str]:
    """Every id in the WHOLE tree, ``main_branches[]`` first then each one's own nested ``sub_branches[]``,
    in tree (pre-order) order. Precondition: every entry already passed its own shape check (id present, a
    non-empty string)."""
    ids: list[str] = []
    for branch in main_branches:
        ids.append(branch["id"])
        for sub in branch.get("sub_branches", []):
            ids.append(sub["id"])
    return ids


def _first_duplicate_id(ids: list[str]) -> str | None:
    seen: set[str] = set()
    for branch_id in ids:
        if branch_id in seen:
            return branch_id
        seen.add(branch_id)
    return None


def sub_branch(
    branch_id: str,
    label: str,
    provenance: dict[str, Any],
    *,
    keywords: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/mind-map-record.schema.yaml#/$defs/sub_branch``. Convenience constructor
    only -- emits ONLY known-good keys; does NOT itself enforce shape validity (``generate_mind_map_record``
    validates whatever dict it is handed regardless of how it was built, same "helper is not the invariant
    boundary" discipline ``framing.non_goals``'s own ``excluded_scope_entry`` docstring already establishes --
    mutation tests build entries directly, bypassing this helper, to prove the constructor itself enforces the
    invariants)."""
    record: dict[str, Any] = {"id": branch_id, "label": label, "provenance": provenance}
    if keywords:
        record["keywords"] = list(keywords)
    return record


def main_branch(
    branch_id: str,
    label: str,
    provenance: dict[str, Any],
    *,
    sub_branches: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/mind-map-record.schema.yaml#/properties/main_branches``. Same convenience-
    constructor-only discipline as ``sub_branch`` above."""
    record: dict[str, Any] = {"id": branch_id, "label": label, "provenance": provenance}
    if sub_branches:
        record["sub_branches"] = [dict(s) for s in sub_branches]
    return record


def generate_mind_map_record(
    record_id: str,
    central_topic: str,
    main_branches: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/mind-map-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/version/central_topic shape, ``main_branches`` list shape,
    then PER ``main_branch`` (and, nested inside, per ``sub_branch``) -- shape, then whole-tree id uniqueness.
    REBUILDS every nested list/dict it owns; ``provenance`` fields are stored by reference, same family-wide
    convention every prior module in this package already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"MINDMAP_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"MINDMAP_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(central_topic):
        raise InvariantViolation(f"MINDMAP_EMPTY_CENTRAL_TOPIC: central_topic must be a non-empty string, got {central_topic!r}")
    if not isinstance(main_branches, list) or not main_branches:
        raise InvariantViolation(f"MINDMAP_INVALID_MAIN_BRANCHES: main_branches must be a non-empty list, got {_shallow_describe(main_branches)}")

    for branch in main_branches:
        if not _main_branch_shape_is_valid(branch):
            raise InvariantViolation(
                f"MINDMAP_INVALID_BRANCH_ENTRY: every main_branches[] entry (and its own nested sub_branches[]) must be well-shaped "
                f"(non-empty id/label, valid provenance dict, optional non-empty sub_branches[]/keywords[], no unknown keys), got {_shallow_describe(branch)}"
            )

    duplicate_id = _first_duplicate_id(_collect_branch_ids(main_branches))
    if duplicate_id is not None:
        raise InvariantViolation(
            f"MINDMAP_DUPLICATE_BRANCH_ID: branch id {duplicate_id!r} is used more than once across the tree "
            f"(main_branches and nested sub_branches share one id namespace)"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "central_topic": central_topic,
        "main_branches": [_rebuild_main_branch(branch) for branch in main_branches],
        "provenance": provenance,
    }


def _rebuild_main_branch(entry: dict[str, Any]) -> dict[str, Any]:
    rebuilt = dict(entry)
    if "sub_branches" in entry:
        rebuilt["sub_branches"] = [dict(sub) for sub in entry["sub_branches"]]
    return rebuilt


def all_keywords(record: dict[str, Any]) -> list[str]:
    """Real derived view (recomputed fresh every call, never a stored field) -- every keyword anywhere in the
    record's own tree, in tree (pre-order) traversal order. Atlas's own '外化工作記憶' (externalize working
    memory) benefit column, made concrete: the full divergent output of one mind-mapping pass, at a glance.
    SCOPE: operates on an ALREADY-VALID record (``generate_mind_map_record``/``evaluate_mind_map_integrity_
    gate`` already proved shape); does not re-validate and will raise on a malformed record, same
    ALREADY-VALID-record scope ``framing.non_goals``'s own ``entries_with_moscow_ref`` already documents."""
    keywords: list[str] = []
    for branch in record["main_branches"]:
        for sub in branch.get("sub_branches", []):
            keywords.extend(sub.get("keywords", []))
    return keywords


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance AND every main_branch's
    AND every nested sub_branch's own provenance are schema-valid. Fails closed on a non-dict record or a
    non-list main_branches."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_valid = provenance_is_valid(record.get("provenance"))
    branches = record.get("main_branches")
    branches = branches if isinstance(branches, list) else []
    invalid_branch_ids: list[Any] = []
    for branch in branches:
        if not isinstance(branch, dict):
            continue
        if not provenance_is_valid(branch.get("provenance")):
            invalid_branch_ids.append(branch.get("id"))
        for sub in branch.get("sub_branches") or []:
            if isinstance(sub, dict) and not provenance_is_valid(sub.get("provenance")):
                invalid_branch_ids.append(sub.get("id"))
    passed = record_provenance_valid and bool(branches) and not invalid_branch_ids
    return _result(
        "provenance_required",
        passed,
        [{"record_provenance_valid": record_provenance_valid, "branches_checked": len(branches), "invalid_provenance_branch_ids": invalid_branch_ids}],
        validator,
        timestamp,
    )


def evaluate_mind_map_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value,
    does NOT call ``generate_mind_map_record``, so a hand-tampered record that bypassed the builder entirely
    is caught here exactly as a builder-refused one would have been. FAILS CLOSED on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("mind_map_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("mind_map_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("mind_map_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("central_topic")):
        return _result("mind_map_integrity", False, [{"reason": "central_topic missing or empty"}], validator, timestamp)

    main_branches = record.get("main_branches")
    if not isinstance(main_branches, list) or not main_branches:
        return _result("mind_map_integrity", False, [{"reason": "main_branches missing, empty, or not a list"}], validator, timestamp)

    for branch in main_branches:
        if not _main_branch_shape_is_valid(branch):
            return _result(
                "mind_map_integrity",
                False,
                [{"reason": "a main_branches[] entry (or its own nested sub_branches[]) is malformed (unknown/missing key or wrong type)", "entry": _shallow_describe(branch)}],
                validator,
                timestamp,
            )

    duplicate_id = _first_duplicate_id(_collect_branch_ids(main_branches))
    if duplicate_id is not None:
        return _result("mind_map_integrity", False, [{"reason": "MINDMAP_DUPLICATE_BRANCH_ID", "duplicate_id": duplicate_id}], validator, timestamp)

    return _result(
        "mind_map_integrity",
        True,
        [{"main_branch_count": len(main_branches), "total_branch_count": len(_collect_branch_ids(main_branches))}],
        validator,
        timestamp,
    )


def evaluate_mind_map_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the declared ``quality`` property, then the
    independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_mind_map_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
