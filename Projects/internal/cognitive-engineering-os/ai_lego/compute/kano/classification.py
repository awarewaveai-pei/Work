"""Kano feature classification -- deterministic compute, backing ``decision.kano``.

Same Trusted Compute discipline every prior genuine-compute module in this package establishes
(``compute/impact_effort/classification.py``, ``compute/mcda/scoring.py``): each feature's category is
DECIDED here, by a real table lookup, never asserted by an LLM or accepted as a bare caller claim (Atlas §29
rule 6: "數學與統計必須由 Trusted Compute 執行"; Atlas F16 L765's own benefit column "不只看票數" -- not just
vote counts -- is the textual signal a caller-asserted category would fail to honor).

The lookup table itself (functional response x dysfunctional response -> category) is the classical Kano
evaluation table (Kano, Seraku, Takahashi, Tsuji, "Attractive Quality and Must-Be Quality," Journal of the
Japanese Society for Quality Control, 1984) -- external, public-domain product-management convention, NOT
Atlas content (Atlas F16 L765 is a bare 4-column table row with no worked example or table of its own).

VERIFICATION (R4: a memorized table is exactly the kind of claim that needs checking, not trusting recall):
an initial WebFetch of one secondary source (Folding Burritos' "Pouliot's revision") returned a table that
contradicts basic Kano semantics -- it maps the entire "I dislike it" functional row mostly to One-dimensional
and Must-be, which cannot be right: those categories mean satisfaction tracks WANTING the feature present,
while a customer who dislikes its presence and likes its absence is definitionally the mirror case (Reverse),
not Performance/Basic. That source explicitly self-describes as a "modified" variant, not the original.
Rejected. Independently re-derived from each category's own definition (Must-be: presence unnoticed, absence
hurts; One-dimensional: satisfaction linear in presence; Attractive: presence delights, absence unnoticed;
Indifferent: neither matters; Reverse: the mirror of the above three, customer prefers absence; Questionable:
the two extreme-corner cells where a respondent claims to like, or dislike, both presence AND absence of the
same feature -- self-contradictory). Then cross-checked against Wikipedia's Kano-model article, which gives 5
explicit worked spot-check cells -- all 5 matched the independently re-derived table exactly, including the
two cells the rejected source got wrong ((MUST_BE, DISLIKE)->basic and (DISLIKE, MUST_BE)->reverse). The table
below is that doubly-corroborated version.

``classify_quadrant``-equivalent here is ``classify_kano_category`` -- a discrete 5x5 lookup rather than a
continuous threshold comparison, a genuinely distinct compute shape from ``impact_effort``'s own
threshold-comparison classifier despite both producing a categorical label from 2 raw inputs (see method
contract's due-diligence comparison). ``validate_response`` is the second half of this module's own Trusted
Compute surface (enum-membership validation), same discipline ``impact_effort/classification.py``'s own
``validate_value_in_scale`` already establishes for its analogous per-axis input check.
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

RESPONSE_LIKE = "LIKE"
RESPONSE_MUST_BE = "MUST_BE"
RESPONSE_NEUTRAL = "NEUTRAL"
RESPONSE_LIVE_WITH = "LIVE_WITH"
RESPONSE_DISLIKE = "DISLIKE"
VALID_RESPONSES = frozenset({RESPONSE_LIKE, RESPONSE_MUST_BE, RESPONSE_NEUTRAL, RESPONSE_LIVE_WITH, RESPONSE_DISLIKE})

CATEGORY_BASIC = "basic"
CATEGORY_PERFORMANCE = "performance"
CATEGORY_DELIGHTER = "delighter"
CATEGORY_INDIFFERENT = "indifferent"
CATEGORY_REVERSE = "reverse"
CATEGORY_QUESTIONABLE = "questionable"
VALID_CATEGORIES = frozenset(
    {CATEGORY_BASIC, CATEGORY_PERFORMANCE, CATEGORY_DELIGHTER, CATEGORY_INDIFFERENT, CATEGORY_REVERSE, CATEGORY_QUESTIONABLE}
)

# The classical Kano evaluation table (see module docstring for sourcing/verification). Rows = functional
# response, columns = dysfunctional response. TOTAL over all 25 cells -- every (functional, dysfunctional)
# pair in VALID_RESPONSES x VALID_RESPONSES resolves to exactly one of the 6 categories, never a KeyError.
_KANO_TABLE: dict[str, dict[str, str]] = {
    RESPONSE_LIKE: {
        RESPONSE_LIKE: CATEGORY_QUESTIONABLE,
        RESPONSE_MUST_BE: CATEGORY_DELIGHTER,
        RESPONSE_NEUTRAL: CATEGORY_DELIGHTER,
        RESPONSE_LIVE_WITH: CATEGORY_DELIGHTER,
        RESPONSE_DISLIKE: CATEGORY_PERFORMANCE,
    },
    RESPONSE_MUST_BE: {
        RESPONSE_LIKE: CATEGORY_REVERSE,
        RESPONSE_MUST_BE: CATEGORY_INDIFFERENT,
        RESPONSE_NEUTRAL: CATEGORY_INDIFFERENT,
        RESPONSE_LIVE_WITH: CATEGORY_INDIFFERENT,
        RESPONSE_DISLIKE: CATEGORY_BASIC,
    },
    RESPONSE_NEUTRAL: {
        RESPONSE_LIKE: CATEGORY_REVERSE,
        RESPONSE_MUST_BE: CATEGORY_INDIFFERENT,
        RESPONSE_NEUTRAL: CATEGORY_INDIFFERENT,
        RESPONSE_LIVE_WITH: CATEGORY_INDIFFERENT,
        RESPONSE_DISLIKE: CATEGORY_BASIC,
    },
    RESPONSE_LIVE_WITH: {
        RESPONSE_LIKE: CATEGORY_REVERSE,
        RESPONSE_MUST_BE: CATEGORY_INDIFFERENT,
        RESPONSE_NEUTRAL: CATEGORY_INDIFFERENT,
        RESPONSE_LIVE_WITH: CATEGORY_INDIFFERENT,
        RESPONSE_DISLIKE: CATEGORY_BASIC,
    },
    RESPONSE_DISLIKE: {
        RESPONSE_LIKE: CATEGORY_REVERSE,
        RESPONSE_MUST_BE: CATEGORY_REVERSE,
        RESPONSE_NEUTRAL: CATEGORY_REVERSE,
        RESPONSE_LIVE_WITH: CATEGORY_REVERSE,
        RESPONSE_DISLIKE: CATEGORY_QUESTIONABLE,
    },
}


def validate_response(value: Any, axis_name: str, feature_id: Any = "?") -> None:
    """A functional/dysfunctional response must be one of the 5 canonical Kano scale values. Same
    fail-closed discipline ``impact_effort/classification.py``'s own ``validate_value_in_scale`` uses for its
    analogous per-axis input check."""
    if value not in VALID_RESPONSES:
        raise InvariantViolation(f"KANO_INVALID_RESPONSE: feature {feature_id!r} {axis_name}={value!r} must be one of {sorted(VALID_RESPONSES)}")


def classify_kano_category(functional_response: str, dysfunctional_response: str) -> str:
    """The classical Kano evaluation table (see module docstring), pure and stateless: given one feature's
    functional and dysfunctional response, returns exactly one of the 6 canonical categories. Does not itself
    validate the two responses are legal enum values -- callers run ``validate_response`` first
    (``classify_features`` below does so in the right order). Called twice for every feature in a record's
    own lifecycle: once at construction (to compute the stored category) and once, independently, inside the
    integrity gate (to re-derive and compare against whatever category is actually stored) -- the gate never
    trusts that the constructor ran, or ran correctly, on a hand-tampered record."""
    return _KANO_TABLE[functional_response][dysfunctional_response]


def classify_features(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Validates every feature's functional/dysfunctional response (fail-closed, rejects any value outside
    the 5-point scale), then classifies each via ``classify_kano_category``. Returns a NEW list of
    ``{id, label, functional_response, dysfunctional_response, category}`` dicts -- never mutates
    ``features``. Assumes each entry's SHAPE (id/label are non-empty strings, response keys present) was
    already checked by the caller -- same split ``impact_effort/classification.py``'s own ``classify_ideas``
    already establishes relative to ``modules/decision/impact_effort.py``'s own shape checks."""
    classified: list[dict[str, Any]] = []
    for entry in features:
        feature_id = entry.get("id", "?")
        functional_response, dysfunctional_response = entry["functional_response"], entry["dysfunctional_response"]
        validate_response(functional_response, "functional_response", feature_id)
        validate_response(dysfunctional_response, "dysfunctional_response", feature_id)
        category = classify_kano_category(functional_response, dysfunctional_response)
        classified.append(
            {
                "id": entry["id"],
                "label": entry["label"],
                "functional_response": functional_response,
                "dysfunctional_response": dysfunctional_response,
                "category": category,
            }
        )
    return classified
