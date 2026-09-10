"""5W1H information-gap detection -- deterministic compute, backing ``framing.five_w_one_h``.

Atlas F01 table row (L340) benefit column "找資訊缺口" (find information gaps) -- the STRUCTURAL POINT of
this method, per Atlas's own citation, is surfacing which of the 6 dimensions remain unanswered, not merely
recording 6 filled-in answers. Same Trusted Compute discipline ``compute/impact_effort/classification.py``
already establishes for a categorical (non-arithmetic) but still LLM-must-not-assert derivation: which
dimensions are gaps is DECIDED here, by a real re-derivation from each dimension's own ``status`` field,
never trusted from a caller-supplied list (Atlas §29 rule 6: "數學與統計必須由 Trusted Compute 執行" --
this is the same "never let the model just assert the derived value" discipline applied to a set
derivation rather than arithmetic).

Called twice for every record's own lifecycle: once at construction
(``ai_lego.modules.framing.five_w_one_h.generate_five_w1h_record`` computes the stored
``information_gaps`` field) and once, independently, inside the integrity gate (to re-derive and compare
against whatever is actually stored) -- the gate never trusts that the constructor ran, or ran correctly,
on a hand-tampered record.
"""

from __future__ import annotations

from typing import Any


def derive_information_gaps(dimensions: list[dict[str, Any]]) -> list[str]:
    """Given an already-shape-validated ``dimensions[]`` (see
    ``ai_lego.modules.framing.five_w_one_h``'s own ``_dimensions_are_valid``), returns the dimension names
    whose ``status`` is ``"UNKNOWN"``, in the SAME order they appear in ``dimensions`` -- which, once shape
    validation has passed, IS ``DIMENSION_ORDER`` (WHO/WHAT/WHEN/WHERE/WHY/HOW), so no separate order
    constant is duplicated here. Pure and stateless -- does not itself validate shape (callers run shape
    validation first, same split ``impact_effort/classification.py``'s own ``classify_ideas`` already
    establishes between validation and derivation). Never mutates ``dimensions``.
    """
    return [entry["dimension"] for entry in dimensions if entry.get("status") == "UNKNOWN"]
