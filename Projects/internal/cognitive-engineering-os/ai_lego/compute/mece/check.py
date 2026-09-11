"""MECE (Mutually Exclusive, Collectively Exhaustive) overlap/gap check -- deterministic compute, backing
``decomposition.mece``.

Atlas §12.7 (L2622-2631): "檢查分類是否重疊或漏掉" (check whether a classification overlaps or omits) --
this method's OWN citation names a verification procedure, not a generative one: given an already-declared
``universe_item_ids`` and an already-declared ``categories`` classification of that universe, whether the
categories are mutually exclusive (no item counted in >1 category) and collectively exhaustive (no item
left in 0 categories) is a real, deterministic SET-ARITHMETIC fact -- not a caller assertion, the same
"genuine compute over caller-supplied structural input" class ``compute/normalization/closure.py``'s own
``classify_normal_form`` already establishes for a different family.

Atlas's own explicit caution (L2629: "不是所有現實系統都能完美 MECE；不要為形式強切世界" -- not every real
system can be perfectly MECE, don't force-cut reality for form's sake) is why ``mece_check`` never raises when
the classification actually fails to be MECE -- ``is_mece: False`` is a legal, complete, non-error result;
only structurally malformed input is rejected by the caller (``ai_lego/modules/decomposition/mece.py``),
never by this pure function.

Same "compute layer assumes well-formed input, method layer validates it" separation
``compute/normalization/closure.py``'s own module docstring establishes: this module ASSUMES
``universe_item_ids`` is a list of strings and each ``categories[]`` entry already carries a
``member_item_ids`` list of strings -- both validated by the CALLER before this is ever invoked.
"""

from __future__ import annotations

from collections import Counter
from typing import Any


def mece_check(universe_item_ids: list[str], categories: list[dict[str, Any]]) -> dict[str, Any]:
    """Real set-arithmetic MECE check.

    - ``overlaps``: sorted item ids that appear in MORE THAN ONE category's own ``member_item_ids`` -- a
      mutual-exclusivity violation.
    - ``gaps``: sorted item ids in ``universe_item_ids`` that appear in ZERO categories -- a
      collective-exhaustiveness violation.
    - ``unknown_members``: sorted item ids referenced by some category's ``member_item_ids`` but ABSENT
      from ``universe_item_ids`` -- a distinct referential-integrity defect (a category cannot classify an
      item the universe never declared), disclosed separately from overlaps/gaps rather than silently
      folded into either.
    - ``is_mece``: True iff BOTH ``overlaps`` and ``gaps`` are empty (Atlas's own two-part definition,
      "互斥且完整" -- mutually exclusive AND collectively exhaustive). ``unknown_members`` does NOT gate
      ``is_mece`` -- it is a referential-integrity defect about the categories' own inputs, not a mutual-
      exclusivity or collective-exhaustiveness fact about the universe itself (see method contract
      compilation_decisions for why this is a disclosed, deliberate choice, not an oversight).

    Deterministic / order-independent: membership counts are accumulated via a plain ``Counter`` over each
    category's own DEDUPLICATED member set (a repeated id WITHIN one category is a duplicate listing, not a
    cross-category overlap -- see method contract compilation_decisions), so the result cannot depend on
    ``categories``' own list order or ``universe_item_ids``' own list order.
    """
    universe_set = set(universe_item_ids)
    membership_count: Counter[str] = Counter()
    for cat in categories:
        for member in set(cat["member_item_ids"]):
            membership_count[member] += 1

    overlaps = sorted(item for item, count in membership_count.items() if count > 1)
    gaps = sorted(universe_set - set(membership_count.keys()))
    unknown_members = sorted(set(membership_count.keys()) - universe_set)
    is_mece = not overlaps and not gaps

    return {"overlaps": overlaps, "gaps": gaps, "unknown_members": unknown_members, "is_mece": is_mece}
