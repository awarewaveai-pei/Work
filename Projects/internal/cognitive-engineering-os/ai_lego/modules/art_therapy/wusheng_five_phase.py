"""``art_therapy.wusheng_five_phase`` -- 五階段療程系統 (WuSheng Five Phases): track a client's placement
within the operator's own five-phase action-research framework, which maps Chinese Five-Element (五行) /
Zang-Fu (臟腑) theory onto a change-hypothesis-validation cycle: WS-01 生存 Existence -> WS-02 生活 Life
Stabilization -> WS-03 生態 Ecological Awareness -> WS-04 生動 Activating Creative Aliveness -> WS-05 生機
Vital Emergence.

Operator's real framework (not a Method Atlas source): extracted from her own Airtable base
``appbQ5ACPPxMybVvM``, tables "WuSheng Five Phases" and "五階段療程系統" (2026-09-18). GROUNDED ORIGINAL
DESIGN, disclosed in the contract -- same class as ``art_therapy.life_wheel``/``art_therapy.story_completion``.
Each phase's guiding question / working hypothesis / practice strategy / progress indicator is reproduced
verbatim in ``PHASE_REFERENCE`` below per operator directive: this content is not to be edited, "optimized",
or completed by this module, only structurally wrapped.

Non-diagnostic, non-crisis-assessment, non-treatment-outcome-determination (same boundary class as
``recipes/validated/art-therapy-creative-reflection-v1.recipe.yaml``): ``current_phase`` is the
practitioner's own clinical placement of the client, and ``progress_evidence`` is the same practitioner's
free-text observation -- this method never infers a diagnosis or a crisis/risk state, and it never verifies
from that text whether a phase's own quantitative progress indicator (e.g. WS-04's "execution rate > 80% per
week", WS-05's "> 6 weeks steady growth") has actually been met. That judgment stays entirely human; the gate
below checks structural completeness only (closed-set phase code, non-empty evidence string), never clinical
sufficiency -- attempting the latter from free text would be a false-precision claim this system cannot back.

Real invariants (builder raises; gate re-derives from raw fields):
1. ``current_phase`` is exactly one of the 5 closed-set codes in ``PHASE_REFERENCE`` (``WS-01``..``WS-05``) --
   never free text, never an invented 6th code. This is the one invariant the operator named explicitly.
2. ``progress_evidence`` is a non-empty string (required; never auto-graded against the phase's own
   quantitative threshold -- see the boundary paragraph above).
3. ``linked_tool_ids``, when present, is a non-empty list of non-empty strings -- references into the
   operator's separate Art Reflection Tools table (id only; that table's own 50+-field structure is out of
   scope here, a future method/schema).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import (
    all_gates_pass,
    base_record,
    integrity_gate,
    is_nonempty_str,
    is_nonempty_str_list,
    is_one_of,
    provenance_required_gate,
    require,
    require_header,
)

METHOD_ID = "art_therapy.wusheng_five_phase"
RECORD_ID_PREFIX = "WUSHENG-"

# Verbatim from the operator's Airtable base `appbQ5ACPPxMybVvM`, tables "WuSheng Five Phases" / "五階段療程系統"
# (2026-09-18). Not to be edited/optimized/completed -- this is her real, already-in-use clinical framework.
# Keys are also this method's own closed set for `current_phase` (see PHASE_CODES below).
PHASE_REFERENCE: dict[str, dict[str, str]] = {
    "WS-01": {
        "name_zh": "生存",
        "pinyin": "Shēng Cún",
        "name_en": "Existence",
        "element": "金",
        "organs": "肝、膽",
        "function": "Exploration",
        "recommended_sessions": "3-4次",
        "guiding_question": "Am I here?",
        "working_hypothesis": "If sensory awareness is reawakened → self-presence returns",
        "practice_strategy": "Visual/tactile awareness practices, inner imagery drawing",
        "progress_indicator": '"I can feel again" → moves to next stage',
    },
    "WS-02": {
        "name_zh": "生活",
        "pinyin": "Shēng Huó",
        "name_en": "Life Stabilization",
        "element": "水",
        "organs": "腎・膀胱(含胰與心)",
        "function": "Exploration",
        "recommended_sessions": "2-3次",
        "guiding_question": "Where am I stuck?",
        "working_hypothesis": "Bottlenecks = emotional/resource power struggles",
        "practice_strategy": "Daily mapping, tension triggers, permission to let go",
        "progress_indicator": "Sense of flow improves → anxiety decreases",
    },
    "WS-03": {
        "name_zh": "生態",
        "pinyin": "Shēng Tài",
        "name_en": "Ecological Awareness",
        "element": "木",
        "organs": "肝・膽",
        "function": "Integration",
        "recommended_sessions": "3-4次",
        "guiding_question": "How can these experiences nourish me?",
        "working_hypothesis": "Retell the story → shift from conflict to co-creation",
        "practice_strategy": "Story rewriting, role exchange, systems canvas",
        "progress_indicator": "Reports feeling in resonance with life/world",
    },
    "WS-04": {
        "name_zh": "生動",
        "pinyin": "Shēng Dòng",
        "name_en": "Activating Creative Aliveness",
        "element": "火",
        "organs": "心・小腸",
        "function": "Healing",
        "recommended_sessions": "1-2次",
        "guiding_question": "How do I move now?",
        "working_hypothesis": "Liver release → action flow restarts",
        "practice_strategy": "Emotion pinboard + SMART action checklist",
        "progress_indicator": "Execution rate > 80% per week",
    },
    "WS-05": {
        "name_zh": "生機",
        "pinyin": "Shēng Jī",
        "name_en": "Vital Emergence",
        "element": "土",
        "organs": "脾・胃(三焦系統)",
        "function": "Integration",
        "recommended_sessions": "2-3次",
        "guiding_question": "How do I sustain this?",
        "working_hypothesis": '"Gather good, clear excess" → enable sustainability',
        "practice_strategy": "Healing rituals, creative integration",
        "progress_indicator": "Stabilized energy curve → >6 weeks steady growth",
    },
}
PHASE_CODES = frozenset(PHASE_REFERENCE)

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "PHASE_REFERENCE", "PHASE_CODES", "generate_wusheng_five_phase", "evaluate_wusheng_five_phase_gates", "all_gates_pass"]


def _core_problem(subject: Any, current_phase: Any, progress_evidence: Any, linked_tool_ids: Any) -> str | None:
    if not is_nonempty_str(subject):
        return "subject missing or empty"
    if not is_one_of(current_phase, PHASE_CODES):
        return f"current_phase must be one of {sorted(PHASE_CODES)}, got {current_phase!r}"
    if not is_nonempty_str(progress_evidence):
        return "progress_evidence missing or empty"
    if linked_tool_ids is not None and not is_nonempty_str_list(linked_tool_ids):
        return f"linked_tool_ids must be a non-empty list of non-empty strings when present, got {linked_tool_ids!r}"
    return None


def generate_wusheng_five_phase(
    record_id: str,
    subject: str,
    current_phase: str,
    progress_evidence: str,
    provenance: dict[str, Any],
    *,
    linked_tool_ids: list[str] | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    require_header("WUSHENG", record_id, RECORD_ID_PREFIX, version, provenance)
    require(is_nonempty_str(subject), "WUSHENG_INVALID_SUBJECT", f"subject must be a non-empty string, got {subject!r}")
    require(is_one_of(current_phase, PHASE_CODES), "WUSHENG_INVALID_PHASE", f"current_phase must be one of {sorted(PHASE_CODES)}, got {current_phase!r}")
    require(is_nonempty_str(progress_evidence), "WUSHENG_INVALID_EVIDENCE", f"progress_evidence must be a non-empty string, got {progress_evidence!r}")
    require(linked_tool_ids is None or is_nonempty_str_list(linked_tool_ids), "WUSHENG_INVALID_LINKED_TOOLS", f"linked_tool_ids must be a non-empty list of non-empty strings when present, got {linked_tool_ids!r}")
    fields: dict[str, Any] = {"subject": subject, "current_phase": current_phase, "progress_evidence": progress_evidence}
    if linked_tool_ids:
        fields["linked_tool_ids"] = linked_tool_ids
    return base_record(record_id, version, generated_by_method, provenance, **fields)


def _record_problem(record: dict[str, Any]) -> str | None:
    return _core_problem(record.get("subject"), record.get("current_phase"), record.get("progress_evidence"), record.get("linked_tool_ids"))


def evaluate_wusheng_five_phase_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate(
            "wusheng_five_phase_integrity",
            record,
            RECORD_ID_PREFIX,
            _record_problem,
            lambda r: {"current_phase": r["current_phase"], "phase_name_en": PHASE_REFERENCE[r["current_phase"]]["name_en"], "linked_tool_count": len(r.get("linked_tool_ids") or [])},
            validator,
            timestamp,
        ),
    ]
