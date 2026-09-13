"""Open / axial / selective coding outputs for ``research.qualitative_coding`` (Strauss & Corbin).

Produces the three stage outputs the method contract requires -- CodeSet
(open), CategorySet (axial), ThemeSet (selective) -- in that order, plus a
``SaturationAssessment`` record. Every output object carries a
``provenance_record`` so the Authorship Gate has something real to check.

``epistemic_type`` on a locked code is an explicit human assertion (the
review records whether the human is confirming a directly-quoted
SOURCE_FACT), never derived from the lock action itself -- the schema makes
SOURCE_FACT a *precondition* of LOCKED_FACT, not a consequence of locking.

Coder 2 is a synthetic fixture standing in for an independent second human
coder; its objects are flagged ``synthetic_fixture: true``.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.research.synthetic_fixtures import (
    CATEGORY_OF_LABEL,
    CODER_ONE_PENDING_AI_LABELS,
    CODER_TWO_LABELS,
    SYNTHETIC_TRANSCRIPTS,
    THEMES_V11,
)

STAGE_SEQUENCE = ["open_coding", "axial_coding", "selective_coding"]
PENDING_CATEGORY = "pending_axial_review"

_HUMAN_AUTHORSHIP = {"ACCEPT": "HUMAN_APPROVED", "ACCEPT_AND_LOCK": "HUMAN_APPROVED", "EDIT": "HUMAN_EDITED"}


def code_from_review(review: dict[str, Any], code_id: str, coder_id: str = "CODER-1") -> dict[str, Any] | None:
    """An AI suggestion after human review; None when the human rejected it.

    ``review["asserted_epistemic_type"]`` (defaulting to ``AI_INFERENCE``) is
    the human's own assertion for a locked code, per the schema's
    SOURCE_FACT-is-a-precondition-of-LOCKED_FACT direction; the reviewer, not
    the lock keypress, decides what kind of claim this is.
    """
    action = review["action"]
    if action == "REJECT":
        return None
    locked = "LOCKED_FACT" if action == "ACCEPT_AND_LOCK" else None
    epistemic_type = review.get("asserted_epistemic_type") or "AI_INFERENCE"
    if locked == "LOCKED_FACT" and epistemic_type != "SOURCE_FACT":
        raise ValueError(f"LOCK_REQUIRES_SOURCE_FACT: cannot lock {code_id} as {epistemic_type}")
    return {
        "code_id": code_id,
        "coder_id": coder_id,
        "source_id": review["source_id"],
        "quote": review["quote"],
        "label": review["result_label"],
        "provenance": make_provenance(epistemic_type, _HUMAN_AUTHORSHIP[action], locked),
        "human_action": action,
        "originated_as": review["suggestion_id"],
    }


def _quote_for(source_id: str) -> str:
    return next(entry["quote"] for entry in SYNTHETIC_TRANSCRIPTS if entry["source_id"] == source_id)


def assemble_coding_outputs(
    locked_code: dict[str, Any],
    ai_review: dict[str, Any],
    at: str,
    *,
    pending_ai_labels: dict[str, str] | None = None,
    suggestion_source: dict[str, Any] | None = None,
    coder_two_labels: dict[str, str] | None = None,
    coder_two_source: dict[str, Any] | None = None,
    category_of_label: dict[str, str] | None = None,
    themes_v11: list[tuple[str, list[str]]] | None = None,
    grouping_source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """``pending_ai_labels`` defaults to the synthetic fixture dict; a real model run passes its own
    (``ai_coding.suggest_open_codes``) plus ``suggestion_source`` so each pending code records which model,
    prompt version and trace produced it. The assembled shape is identical either way -- gates cannot tell."""
    reviewed = code_from_review(ai_review, "CODE-C1-002")
    coder_one: list[dict[str, Any]] = [locked_code]
    rejected: list[dict[str, Any]] = []
    if reviewed is None:
        rejected.append({**ai_review, "provenance": make_provenance("AI_SUGGESTION", "AI_SUGGESTED")})
    else:
        coder_one.append(reviewed)
    pending = CODER_ONE_PENDING_AI_LABELS if pending_ai_labels is None else pending_ai_labels
    for index, (source_id, label) in enumerate(sorted(pending.items()), start=3):
        code: dict[str, Any] = {
            "code_id": f"CODE-C1-{index:03d}",
            "coder_id": "CODER-1",
            "source_id": source_id,
            "quote": _quote_for(source_id),
            "label": label,
            "provenance": make_provenance("AI_SUGGESTION", "AI_SUGGESTED"),
            "human_action": None,
        }
        if suggestion_source is not None:
            code["suggestion_source"] = suggestion_source
        coder_one.append(code)
    if coder_two_labels is None:
        # Synthetic stand-in for an independent second HUMAN coder; flagged so the authorship gate knows.
        coder_two_id = "CODER-2-SYNTHETIC"
        coder_two = [
            {
                "code_id": f"CODE-C2-{index:03d}",
                "coder_id": coder_two_id,
                "source_id": source_id,
                "quote": _quote_for(source_id),
                "label": label,
                "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
                "human_action": "ORIGINAL",
                "synthetic_fixture": True,
            }
            for index, (source_id, label) in enumerate(sorted(CODER_TWO_LABELS.items()), start=1)
        ]
    else:
        # A real second pass by a model applying coder 1's codebook: an AI coder, labelled as one (AI_SUGGESTION /
        # AI_SUGGESTED, no human action), never presented as a human coder.
        coder_two_id = "CODER-2-MODEL"
        coder_two = [
            {
                "code_id": f"CODE-C2-{index:03d}",
                "coder_id": coder_two_id,
                "source_id": source_id,
                "quote": _quote_for(source_id),
                "label": label,
                "provenance": make_provenance("AI_SUGGESTION", "AI_SUGGESTED"),
                "human_action": None,
                "suggestion_source": coder_two_source,
            }
            for index, (source_id, label) in enumerate(sorted(coder_two_labels.items()), start=1)
        ]

    all_codes = coder_one + coder_two
    # Axial map and v11 theme list: the fixture constants by default, a model's (``ai_coding.suggest_categories`` /
    # ``suggest_themes``) when supplied. Both paths obey the same two invariants: a code with no category lands in the
    # honest PENDING_CATEGORY (never guessed), and a category no theme claims passes through as its own theme
    # (never dropped, never merged) -- so every code is reachable from exactly one theme via exactly one category,
    # which is what the methodology gate checks.
    axial_map = CATEGORY_OF_LABEL if category_of_label is None else category_of_label
    theme_list = THEMES_V11 if themes_v11 is None else themes_v11
    grouping_provenance = make_provenance("AI_INFERENCE", "AI_SUGGESTED")
    categories: dict[str, dict[str, Any]] = {}
    for code in all_codes:
        category_label = axial_map.get(code["label"], PENDING_CATEGORY)
        category = categories.setdefault(
            category_label,
            {"category_id": f"CAT-{category_label}", "label": category_label, "code_ids": [], "provenance": grouping_provenance},
        )
        category["code_ids"].append(code["code_id"])
    if grouping_source is not None:
        for category in categories.values():
            category["suggestion_source"] = grouping_source
    category_set = sorted(categories.values(), key=lambda item: item["category_id"])

    themes = []
    present_category_ids = {c["category_id"] for c in category_set}
    covered_category_ids: set[str] = set()
    for theme_label, category_labels in theme_list:
        category_ids = [f"CAT-{label}" for label in category_labels if f"CAT-{label}" in present_category_ids and f"CAT-{label}" not in covered_category_ids]
        if not category_ids:
            # A theme with no category under it is not a theme (selective coding builds on axial coding; the
            # methodology gate rejects a theme whose codes are not reachable through its categories). A theme list
            # written against labels that never materialised in this run is simply absent -- not emitted empty.
            continue
        covered_category_ids.update(category_ids)
        code_ids = [code_id for category in category_set if category["category_id"] in category_ids for code_id in category["code_ids"]]
        theme: dict[str, Any] = {"theme_id": f"THEME-{len(themes) + 1}", "label": theme_label, "category_ids": category_ids, "code_ids": code_ids, "provenance": grouping_provenance}
        if grouping_source is not None:
            theme["suggestion_source"] = grouping_source
        themes.append(theme)
    for category in category_set:
        if category["category_id"] in covered_category_ids:
            continue
        # Pass-through: a category no theme integrated stays visible as its own theme, labelled by the category.
        themes.append(
            {
                "theme_id": f"THEME-{len(themes) + 1}",
                "label": category["label"],
                "category_ids": [category["category_id"]],
                "code_ids": list(category["code_ids"]),
                "provenance": grouping_provenance,
                "selective_status": "UNTHEMED_PASSTHROUGH",
            }
        )

    saturation_assessment = {
        "assessment_id": "SAT-1",
        "criterion": "theoretical_saturation",
        "citation": "Glaser & Strauss (1967); Strauss & Corbin (1990/1998) Ch. 12",
        "units_assessed": len(SYNTHETIC_TRANSCRIPTS),
        "new_codes_in_last_unit": 1,
        "saturated": False,
        "threshold_data_units": None,
        "threshold_status": "OPERATOR_SET_PENDING",
        "rationale": "Four synthetic interviews cannot demonstrate saturation; the last unit still introduced a new code. Recorded, not asserted.",
        "assessed_at": at,
        "provenance": make_provenance("HUMAN_OPINION", "HUMAN_APPROVED"),
    }
    return {
        "stage_sequence": list(STAGE_SEQUENCE),
        "coder_1": {"coder_id": "CODER-1", "code_set": coder_one, "pending_labels_origin": "fixture" if pending_ai_labels is None else "model", "suggestion_source": suggestion_source},
        "coder_2": {"coder_id": coder_two_id, "code_set": coder_two, "synthetic_fixture": coder_two_labels is None, "coder_kind": "synthetic_fixture" if coder_two_labels is None else "model", "suggestion_source": coder_two_source},
        "rejected": rejected,
        "category_set": category_set,
        "theme_set": {"prompt_version": 11, "themes": themes, "grouping_origin": "fixture" if category_of_label is None and themes_v11 is None else "model", "suggestion_source": grouping_source},
        "saturation_assessment": saturation_assessment,
    }


def build_v12_over_merged_theme_set(coding_outputs: dict[str, Any]) -> list[dict[str, Any]]:
    """A real (deliberately degraded) v12 variant: all categories collapsed into one over-merged theme.

    This is what makes PromptVersionRollback a genuine state change to
    reverse, rather than an event whose payload is never read (the recipe's
    'over-merged themes' failure mode, produced honestly rather than
    asserted as a literal string).
    """
    category_ids = [category["category_id"] for category in coding_outputs["category_set"]]
    code_ids = [code_id for category in coding_outputs["category_set"] for code_id in category["code_ids"]]
    return [{"theme_id": "THEME-V12-1", "label": "over_merged_all_categories", "category_ids": category_ids, "code_ids": code_ids, "provenance": make_provenance("AI_INFERENCE", "AI_SUGGESTED")}]


def generate_qualitative_coding(
    transcript: dict[str, Any],
    locked_code: dict[str, Any],
    ai_review: dict[str, Any],
    at: str,
    *,
    pending_ai_labels: dict[str, str] | None = None,
    suggestion_source: dict[str, Any] | None = None,
    coder_two_labels: dict[str, str] | None = None,
    coder_two_source: dict[str, Any] | None = None,
    category_of_label: dict[str, str] | None = None,
    themes_v11: list[tuple[str, list[str]]] | None = None,
    grouping_source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dispatchable reviewed-coding entrypoint for the generic Workflow API.

    The current MVP deliberately receives reviewed coding material as input;
    it does not infer codes from raw media or silently replace a human lock.
    The transcript is still required and checked before the method runs.
    """
    if transcript.get("status") != "normalized" or not isinstance(transcript.get("provenance"), dict):
        raise ValueError("QUALITATIVE_CODING_TRANSCRIPT_INVALID")
    return assemble_coding_outputs(
        locked_code,
        ai_review,
        at,
        pending_ai_labels=pending_ai_labels,
        suggestion_source=suggestion_source,
        coder_two_labels=coder_two_labels,
        coder_two_source=coder_two_source,
        category_of_label=category_of_label,
        themes_v11=themes_v11,
        grouping_source=grouping_source,
    )


def evaluate_qualitative_coding_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Run the method-local structural gate; cross-step research gates stay upstream."""
    passed = (
        isinstance(record, dict)
        and isinstance(record.get("coder_1", {}).get("code_set"), list)
        and isinstance(record.get("coder_2", {}).get("code_set"), list)
        and isinstance(record.get("category_set"), list)
        and bool(record.get("theme_set", {}).get("themes"))
    )
    return [{"gate_id": "qualitative_coding_structure", "status": "PASS" if passed else "FAIL", "evidence": ["code/category/theme stages present"], "validator": validator, "timestamp": timestamp}]
