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
from ai_lego.modules.research.synthetic_fixtures import SUGGESTED_LABEL, SYNTHETIC_TRANSCRIPTS

ACTIONS = {"a": "ACCEPT", "e": "EDIT", "l": "ACCEPT_AND_LOCK", "r": "REJECT"}


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
        return {
            "suggestion_id": suggestion_id,
            "source_id": source_id,
            "quote": quote,
            "action": action,
            "result_label": result_label if action != "REJECT" else None,
            "locked": locked,
            "asserted_epistemic_type": asserted_epistemic_type,
        }


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


def fixture_review() -> tuple[dict[str, Any], dict[str, Any]]:
    """Deterministic review path: lock the P1 quote as a SOURCE_FACT, edit the P2 suggestion."""
    primary = {
        "suggestion_id": "AI-SUG-1",
        "source_id": "SRC-1",
        "quote": SYNTHETIC_TRANSCRIPTS[0]["quote"],
        "action": "ACCEPT_AND_LOCK",
        "result_label": SUGGESTED_LABEL,
        "locked": True,
        "asserted_epistemic_type": "SOURCE_FACT",
    }
    locked = locked_code_from_review(primary, "CODE-LOCKED-P1-001")
    suggestion = {
        "suggestion_id": "AI-SUG-2",
        "source_id": "SRC-2",
        "quote": SYNTHETIC_TRANSCRIPTS[1]["quote"],
        "action": "EDIT",
        "result_label": SUGGESTED_LABEL,
        "locked": False,
        "asserted_epistemic_type": None,
    }
    return locked, suggestion
