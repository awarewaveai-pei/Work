"""「大家怎麼看」 (docs/platform/STEP34_SHARED_RULES.md §8; card 21): which options members who otherwise disagree both agree
with. Pure and deterministic: the same stances give the same answer, whatever order they come in. No vote count decides
anything and nothing returned ranks: per option only whether it is agreed across the group, and the objections' reasons.

The rule (its text and version: ``platform/rulesets/collab.py`` ``collab.agreement``):
- each counted member (current, confirmed: one held for review is left out and listed) is a vector over every option with a
  recorded stance, now or in an earlier round: 同意 = 1, 異議 = -1, none = 0 (a stance now replaces an earlier one);
- the members are split in two by 2-means: start from the two members furthest apart (Hamming distance), ties to the
  smaller member ids; each member joins the nearer centre (a tie: the first); at most 20 rounds;
- an option is agreed across the group only when each side has someone who agrees and nobody objects;
- the same table again without the members who marked the most options (the top 10%, rounded up, only from 10 members on);
- under 3 counted members, fewer than 2 options marked, or one side empty: "還不夠看出誰跟誰不同", and nothing agreed."""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

AGREE, OBJECT = "同意", "異議"
INSUFFICIENT = "還不夠看出誰跟誰不同"
MIN_MEMBERS, MIN_OPTIONS, MAX_ROUNDS = 3, 2, 20
HEAVY_SHARE, HEAVY_FROM = 0.10, 10


def _vectors(stances: Mapping[str, Mapping[str, Mapping[str, Any]]], history: Mapping[str, Mapping[str, str]], counted: Sequence[str]) -> dict[str, dict[str, int]]:
    vectors: dict[str, dict[str, int]] = {}
    for member in counted:
        marks = {option: said for option, said in (history.get(member) or {}).items()}
        marks.update({option: stance["stance"] for option, stance in (stances.get(member) or {}).items()})
        vectors[member] = {option: 1 if said == AGREE else -1 for option, said in marks.items() if said in (AGREE, OBJECT)}
    return vectors


def _two_sides(members: list[str], points: dict[str, tuple[int, ...]]) -> tuple[list[str], list[str]]:
    far = None
    for index, first in enumerate(members):
        for second in members[index + 1:]:
            distance = sum(a != b for a, b in zip(points[first], points[second]))
            if far is None or distance > far[0]:   # strict: among equals the first pair in id order stays
                far = (distance, first, second)
    centres = [tuple(float(value) for value in points[far[1]]), tuple(float(value) for value in points[far[2]])]
    sides: tuple[int, ...] | None = None
    for _ in range(MAX_ROUNDS):
        joined = tuple(0 if _square(points[member], centres[0]) <= _square(points[member], centres[1]) else 1 for member in members)
        if joined == sides:
            break
        sides = joined
        for side in (0, 1):
            mine = [points[member] for member, at in zip(members, sides) if at == side]
            if mine:
                centres[side] = tuple(sum(column) / len(mine) for column in zip(*mine))
    return [member for member, at in zip(members, sides) if at == 0], [member for member, at in zip(members, sides) if at == 1]


def _square(point: tuple[int, ...], centre: tuple[float, ...]) -> float:
    return sum((a - b) ** 2 for a, b in zip(point, centre))


def _table(stances: Mapping[str, Mapping[str, Mapping[str, Any]]], vectors: dict[str, dict[str, int]]) -> dict[str, Any]:
    members = sorted(vectors)
    options = sorted({option for marks in vectors.values() for option in marks})
    if len(members) < MIN_MEMBERS or len(options) < MIN_OPTIONS:
        return {"insufficient": True, "why": INSUFFICIENT}
    points = {member: tuple(vectors[member].get(option, 0) for option in options) for member in members}
    sides = _two_sides(members, points)
    if not all(sides):
        return {"insufficient": True, "why": INSUFFICIENT}
    now = sorted({option for member in members for option in (stances.get(member) or {})})
    table = {}
    for option in now:
        objections = sorted(stances[member][option]["reason"] for member in members if (stances.get(member) or {}).get(option, {}).get("stance") == OBJECT)
        agreed = not objections and all(any(vectors[member].get(option) == 1 for member in side) for side in sides)
        table[option] = {"agreed_across": agreed, "objections": objections}
    return {"insufficient": False, "options": table}


def _heaviest(vectors: dict[str, dict[str, int]]) -> set[str]:
    if len(vectors) < HEAVY_FROM:
        return set()
    by_marks = sorted(vectors, key=lambda member: (-len(vectors[member]), member))
    return set(by_marks[:math.ceil(len(vectors) * HEAVY_SHARE)])


def agreement(stances: Mapping[str, Mapping[str, Mapping[str, Any]]], history: Mapping[str, Mapping[str, str]], members: Sequence[Mapping[str, str]]) -> dict[str, Any]:
    """``stances``: {member: {option: {"stance": 同意|異議, "reason"}}} for the options of this round; ``history``: {member:
    {option: 同意|異議}} for the options of earlier rounds; ``members``: [{"identity_id", "review_state"}] of the group now."""
    counted = sorted(member["identity_id"] for member in members if member.get("review_state") == "confirmed")
    held = sorted(member["identity_id"] for member in members if member.get("review_state") == "pending_review")
    vectors = _vectors(stances, history, counted)
    heavy = _heaviest(vectors)
    first = _table(stances, vectors)
    second = _table(stances, {member: marks for member, marks in vectors.items() if member not in heavy}) if heavy else first
    return {"held": held, **first, "heaviest_left_out": bool(heavy), "without_heaviest": second}
