"""Human-in-the-loop review of AI code suggestions (Master Plan §11.2: Accept / Reject / Edit / Lock).

Two adapters for the same use-case: a real terminal prompt loop, and a
deterministic fixture path for regression tests. Both return the same review
record shape; neither assumes what the reviewer will choose.

Callers MUST pass a PII-free ``quote`` (the source's own extracted quote
field, never the raw transcript) -- what the reviewer sees and what gets
copied into the locked code is a direct input to the append-only ledger,
which has no delete API and therefore no way to ever redact it later.

Locking always asks the reviewer to assert whether the locked content is a
direct SOURCE_FACT quote (the schema's own precondition for LOCKED_FACT);
the lock keypress by itself asserts nothing about epistemic type.
"""

from __future__ import annotations

from typing import Any, Callable

from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.research.synthetic_fixtures import CODEBOOK_DEFINITIONS, SUGGESTED_LABEL, SYNTHETIC_TRANSCRIPTS

ACTIONS = {"a": "ACCEPT", "e": "EDIT", "l": "ACCEPT_AND_LOCK", "r": "REJECT"}

# Round 12 (OQ-P5-9): a review that keeps a label also asks the reviewer for a one-line DEFINITION of it. The
# definition is the reviewer's own words for what the label covers; it becomes the codebook entry the second coder
# is shown (ai_coding.apply_codebook definitions=...). Blank = the reviewer gave none, and the label is listed bare.
DEFINITION_PROMPT = "One-line definition of this label for the codebook (what it covers; blank = none): "


def review_code_interactively(
    suggestion_id: str,
    source_id: str,
    quote: str,
    suggested_label: str,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], Any] = print,
) -> dict[str, Any]:
    """Terminal-only human review. Loops until a valid decision is entered.

    ``quote`` must already be PII-free (see module docstring).
    """
    output_fn(f"Review {suggestion_id} from {source_id}: {quote}")
    output_fn(f"Suggested label: {suggested_label}")
    while True:
        choice = input_fn("Choose [a]ccept, [e]dit, [l]ock the suggested label, or [r]eject: ").strip().lower()
        if choice not in ACTIONS:
            output_fn("Invalid choice. Enter a, e, l, or r.")
            continue
        result_label = suggested_label
        was_edited = False
        if choice == "e":
            result_label = input_fn("Replacement label: ").strip()
            if not result_label:
                output_fn("Replacement label cannot be empty.")
                continue
            was_edited = True
        locked = choice == "l"
        if choice in {"e", "l"}:
            lock_answer = input_fn("Lock this label as a human fact? [y/n]: ").strip().lower() if choice == "e" else "y"
            locked = lock_answer == "y"
        asserted_epistemic_type = None
        if locked:
            fact_answer = input_fn("Is this a direct quote from the source (SOURCE_FACT)? [y/n]: ").strip().lower()
            asserted_epistemic_type = "SOURCE_FACT" if fact_answer == "y" else "AI_INFERENCE"
            if asserted_epistemic_type != "SOURCE_FACT":
                output_fn("Not a SOURCE_FACT: locking requires a direct source quote; recording as accepted without lock.")
                locked = False
        if choice == "r":
            action = "REJECT"
        elif locked:
            action = "ACCEPT_AND_LOCK"
        elif was_edited:
            action = "EDIT"
        else:
            action = "ACCEPT"
        definition = None
        if action != "REJECT":
            definition = _normalise_definition(input_fn(DEFINITION_PROMPT))
        return {
            "suggestion_id": suggestion_id,
            "source_id": source_id,
            "quote": quote,
            "suggested_label": suggested_label,
            "action": action,
            "result_label": result_label if action != "REJECT" else None,
            "locked": locked,
            "asserted_epistemic_type": asserted_epistemic_type,
            "definition": definition,
        }


def _normalise_definition(raw: str) -> str | None:
    """One line, no ": " (the codebook prompt's own separator), None when blank."""
    text = " ".join(raw.split())
    return text.replace(": ", " - ") if text else None


def reviewed_codebook_definitions(reviews: list[dict[str, Any]]) -> dict[str, str]:
    """``{label: definition}`` from review records that kept a label AND gave a definition -- the reviewed part of the
    codebook. Labels the reviewer did not define (or never saw: the model's pending labels) are absent, so the second
    coder lists them bare; nothing is invented for them. Two reviews defining the same label keep the first."""
    definitions: dict[str, str] = {}
    for review in reviews:
        label, definition = review.get("result_label"), review.get("definition")
        if label and definition and label not in definitions:
            definitions[label] = definition
    return definitions


def locked_code_from_review(review: dict[str, Any], code_id: str) -> dict[str, Any]:
    """The human-locked code (epistemic_type is the reviewer's own assertion, per MP §11.3 LOCKED FACT; EC §57)."""
    epistemic_type = review.get("asserted_epistemic_type") or "SOURCE_FACT"
    return {
        "code_id": code_id,
        "coder_id": "CODER-1",
        "source_id": review["source_id"],
        "quote": review["quote"],
        "label": review["result_label"],
        "provenance": make_provenance(epistemic_type, "HUMAN_APPROVED", "LOCKED_FACT" if epistemic_type == "SOURCE_FACT" else None),
        "human_action": review["action"],
    }


def locked_definition_from_review(review: dict[str, Any], definition_id: str) -> dict[str, Any] | None:
    """The human-locked codebook DEFINITION from a review record, or ``None`` when the reviewer gave none
    (a blank answer to ``DEFINITION_PROMPT``, or a REJECTed review, which never asks). A definition is the
    reviewer's own analytic decision about what a label covers, not a claim about what is IN the source --
    that distinction is why it locks as ``LOCKED_DECISION`` (``epistemic_type: DECISION``), never
    ``LOCKED_FACT``, whatever ``locked_code_from_review`` decided for the code itself in the same review.
    Fires independently of the code's own lock/edit/accept outcome: a typed definition is always a decision.
    """
    if not review.get("definition") or not review.get("result_label"):
        return None
    return {
        "definition_id": definition_id,
        "coder_id": "CODER-1",
        "label": review["result_label"],
        "definition": review["definition"],
        "provenance": make_provenance("DECISION", "HUMAN_APPROVED", "LOCKED_DECISION"),
        "human_action": review["action"],
    }


def fixture_review(suggested_labels: dict[str, str] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Deterministic review path: lock the P1 suggestion as a SOURCE_FACT, edit the P2 suggestion.

    ``suggested_labels`` (``{source_id: label}``) is what the AI proposed -- the fixture constant by default, a real
    model's open codes under ``--coding local-llm``. The human decisions are the fixture's: P1 accepted-and-locked
    as suggested; P2 edited to ``SUGGESTED_LABEL`` (the reviewer's own replacement, so a model suggestion for SRC-2
    is visibly overridden, not silently adopted). Both records keep ``suggested_label`` so the ledger shows what
    was proposed next to what was decided.
    """
    suggested = suggested_labels or {}
    primary = fixture_primary_review(suggested_labels)
    locked = locked_code_from_review(primary, "CODE-LOCKED-P1-001")
    suggestion = {
        "suggestion_id": "AI-SUG-2",
        "source_id": "SRC-2",
        "quote": SYNTHETIC_TRANSCRIPTS[1]["quote"],
        "suggested_label": suggested.get("SRC-2", SUGGESTED_LABEL),
        "action": "EDIT",
        "result_label": SUGGESTED_LABEL,
        "locked": False,
        "asserted_epistemic_type": None,
        # The fixture reviewer's own definition of the label it typed (its replacement is a fixture label it knows).
        "definition": CODEBOOK_DEFINITIONS.get(SUGGESTED_LABEL),
    }
    return locked, suggestion


def fixture_primary_review(suggested_labels: dict[str, str] | None = None) -> dict[str, Any]:
    """The fixture reviewer's P1 record (accept-and-lock the suggestion as a SOURCE_FACT). Its ``definition`` is the
    fixture reviewer's own only when the locked label is one the fixture knows (``CODEBOOK_DEFINITIONS``); a model's
    novel label is locked without a definition -- the fixture does not write prose for labels it did not author."""
    suggested = suggested_labels or {}
    primary_suggested = suggested.get("SRC-1", SUGGESTED_LABEL)
    return {
        "suggestion_id": "AI-SUG-1",
        "source_id": "SRC-1",
        "quote": SYNTHETIC_TRANSCRIPTS[0]["quote"],
        "suggested_label": primary_suggested,
        "action": "ACCEPT_AND_LOCK",
        "result_label": primary_suggested,
        "locked": True,
        "asserted_epistemic_type": "SOURCE_FACT",
        "definition": CODEBOOK_DEFINITIONS.get(primary_suggested),
    }
