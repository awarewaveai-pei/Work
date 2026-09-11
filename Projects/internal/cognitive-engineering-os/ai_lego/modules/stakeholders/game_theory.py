"""``stakeholders.game_theory`` -- F07 stakeholder/power/negotiation family, OPENING member (F07 had zero built
methods before this batch -- grep-confirmed no `ai_lego/modules/stakeholders/` implementation existed at batch
start beyond the pre-created empty package `__init__.py`; this is 1 of 10 concurrent agents opening every F07
member in the same parallel batch).

Atlas cites this method TWICE: F07 tool table row (L495: "Game Theory｜建模互相反應｜players→strategies→payoffs→
equilibria｜避免假設對手不動") and dedicated §12.19 (L2777-2784), which gives the method's own literal pipeline::

    Players -> Strategies -> Payoffs -> Information -> Sequence -> Equilibrium / sensitivity

plus an explicit standalone limitation (§12.19, verbatim): "Payoff 設錯，模型再漂亮也無用" (get the payoffs wrong
and the model, however elegant, is worthless). Grep-confirmed these are the only 2 real citations for this
method case-insensitively across the whole Atlas file ("Game Theory"/"賽局"): no §4 composition formula, no
§14.1 legal-chain mention, no §22.3 Method-specific Gate table row.

Scope boundary (task-mandated, not a corner cut): this module does NOT solve for a Nash equilibrium or any other
game-theoretic solution concept. `equilibrium` is a caller-supplied conclusion string. What this module DOES do
is mechanize §12.19's own limitation into a real completeness gate: `equilibrium` cannot be accepted until the
`payoffs` table actually covers every declared (player, strategy) pair the model claims exists. An equilibrium
claim resting on an incomplete payoff table is exactly the "Payoff 設錯，模型再漂亮也無用" failure mode Atlas
itself names -- you cannot rule out a profitable unilateral deviation for a strategy whose payoff was never
even recorded.

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a stored
flag):

1. **At least 2 players, each well-formed and unique** (``GAMETH_TOO_FEW_PLAYERS`` / ``GAMETH_INVALID_PLAYER`` /
   ``GAMETH_DUPLICATE_PLAYER_ID``): ``players`` has >=2 entries (L495's own "Players" stage -- a strategic
   interaction needs at least two parties), each a non-empty ``{id, name}`` pair, with no duplicate ``id``.

2. **Every player has at least one strategy, every strategy references a real player, no duplicate strategy**
   (``GAMETH_INVALID_STRATEGY`` / ``GAMETH_STRATEGY_UNKNOWN_PLAYER`` / ``GAMETH_DUPLICATE_STRATEGY_ID`` /
   ``GAMETH_PLAYER_WITHOUT_STRATEGY``): a player with zero strategies cannot be modeled as making a choice; a
   strategy naming a ``player_id`` that does not exist in ``players`` is an orphan reference; two strategies
   sharing the same ``(player_id, strategy_id)`` pair is an ambiguous duplicate.

3. **Payoff completeness, THE real invariant this method exists to enforce** (``GAMETH_INVALID_PAYOFF`` /
   ``GAMETH_PAYOFF_UNKNOWN_STRATEGY`` / ``GAMETH_PAYOFF_DUPLICATE`` / ``GAMETH_PAYOFF_INCOMPLETE``): every
   payoff's ``value`` must be a real number (Python ``bool`` is an ``int`` subclass -- explicitly excluded, a
   payoff of ``True``/``False`` is refused, not silently coerced to 1/0); every payoff must reference a
   ``(player_id, strategy_id)`` pair that actually exists in ``strategies``; no two payoffs may reference the
   same pair; and -- the invariant §12.19's own limitation is mechanizing -- every ``strategies`` entry MUST
   have exactly one matching payoff BEFORE construction succeeds. A strategy with no recorded payoff blocks the
   whole record, not just a warning.

4. **Equilibrium is checked LAST, after payoff completeness** (``GAMETH_EMPTY_EQUILIBRIUM``): ``equilibrium``
   must be a non-empty string. Checked after invariant 3 on purpose -- the ordering itself encodes "equilibrium
   cannot be accepted until the payoffs supporting it are complete", not merely "equilibrium happens to also be
   validated".

Record-level-only provenance (NOT per-field) -- the same deliberate BATCH-WIDE decision this whole F06/F07 build
uses (matching ``insight.jtbd``'s own record-level placement). A GameTheoryModel's fields describe one coherent
strategic model, not a list of independently-sourced items.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "game_theory"/"GAMETH"/"GameTheory" before writing any of this method's own files:
zero pre-existing implementation, zero contract-backlog entry.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.game_theory"
RECORD_ID_PREFIX = "GAMETH-"

_PLAYER_KEYS = frozenset({"id", "name"})
_STRATEGY_KEYS = frozenset({"player_id", "strategy_id", "name"})
_PAYOFF_KEYS = frozenset({"player_id", "strategy_id", "value"})
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "players", "strategies", "payoffs", "equilibrium", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_number_excluding_bool(value: Any) -> bool:
    """A payoff value must be a real, finite number. Python's ``bool`` is an ``int`` subclass, so a bare
    ``isinstance(value, (int, float))`` would silently accept ``True``/``False`` as payoffs 1/0 -- excluded
    explicitly, same trap every prior module in this corpus that checks numeric input must guard against.
    ``int`` is unconditionally finite (Python ints are arbitrary-precision, never inf/nan) and is NOT passed
    through ``math.isfinite`` -- a second critic pass (2026-09-11) found that a huge ``int`` (e.g. ``10**400``)
    makes ``math.isfinite`` itself raise ``OverflowError`` on the implicit float conversion, an unhandled crash
    that contradicts this module's own gate docstring ("fails closed... rather than crashing"). Only ``float``
    needs the NaN/+-inf check; that is the one case where "not finite" is even representable."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``jtbd``/``bcg_matrix``/
    ``functional_decomposition``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _validate_players(players: Any) -> list[str]:
    """Returns the list of valid player ids, or raises on any structural defect. Never returns a partial/best-
    effort result -- fail-closed."""
    if not isinstance(players, list) or len(players) < 2:
        raise InvariantViolation(f"GAMETH_TOO_FEW_PLAYERS: players must be a list of at least 2 entries (Atlas L495's own 'Players' stage), got {_shallow_describe(players)}")
    ids: list[str] = []
    for index, player in enumerate(players):
        if not isinstance(player, dict) or set(player.keys()) - _PLAYER_KEYS or not _PLAYER_KEYS <= player.keys():
            raise InvariantViolation(f"GAMETH_INVALID_PLAYER: players[{index}] must be a dict with exactly keys {sorted(_PLAYER_KEYS)}, got {_shallow_describe(player)}")
        if not _is_nonempty_str(player.get("id")) or not _is_nonempty_str(player.get("name")):
            raise InvariantViolation(f"GAMETH_INVALID_PLAYER: players[{index}] id and name must each be a non-empty string, got {_shallow_describe(player)}")
        ids.append(player["id"])
    duplicates = {pid for pid in ids if ids.count(pid) > 1}
    if duplicates:
        raise InvariantViolation(f"GAMETH_DUPLICATE_PLAYER_ID: player id(s) {sorted(duplicates)} appear more than once")
    return ids


def _validate_strategies(strategies: Any, player_ids: list[str]) -> list[tuple[str, str]]:
    """Returns the list of valid (player_id, strategy_id) pairs, or raises. Checks every player has >=1
    strategy, every strategy references a real player, and no duplicate (player_id, strategy_id) pair."""
    if not isinstance(strategies, list) or not strategies:
        raise InvariantViolation(f"GAMETH_INVALID_STRATEGY: strategies must be a non-empty list, got {_shallow_describe(strategies)}")
    pairs: list[tuple[str, str]] = []
    player_id_set = set(player_ids)
    for index, strategy in enumerate(strategies):
        if not isinstance(strategy, dict) or set(strategy.keys()) - _STRATEGY_KEYS or not _STRATEGY_KEYS <= strategy.keys():
            raise InvariantViolation(f"GAMETH_INVALID_STRATEGY: strategies[{index}] must be a dict with exactly keys {sorted(_STRATEGY_KEYS)}, got {_shallow_describe(strategy)}")
        player_id, strategy_id, name = strategy.get("player_id"), strategy.get("strategy_id"), strategy.get("name")
        if not _is_nonempty_str(player_id) or not _is_nonempty_str(strategy_id) or not _is_nonempty_str(name):
            raise InvariantViolation(f"GAMETH_INVALID_STRATEGY: strategies[{index}] player_id, strategy_id, and name must each be a non-empty string, got {_shallow_describe(strategy)}")
        if player_id not in player_id_set:
            raise InvariantViolation(f"GAMETH_STRATEGY_UNKNOWN_PLAYER: strategies[{index}] player_id {player_id!r} does not reference any entry in players")
        pairs.append((player_id, strategy_id))
    duplicates = {pair for pair in pairs if pairs.count(pair) > 1}
    if duplicates:
        raise InvariantViolation(f"GAMETH_DUPLICATE_STRATEGY_ID: (player_id, strategy_id) pair(s) {sorted(duplicates)} appear more than once")
    players_without_strategy = player_id_set - {player_id for player_id, _ in pairs}
    if players_without_strategy:
        raise InvariantViolation(f"GAMETH_PLAYER_WITHOUT_STRATEGY: player id(s) {sorted(players_without_strategy)} have no strategies entry -- a player with zero strategies cannot be modeled as making a choice")
    return pairs


def _validate_payoffs(payoffs: Any, strategy_pairs: list[tuple[str, str]]) -> None:
    """The REAL invariant this method exists to enforce: every declared strategy has exactly one payoff, every
    payoff references a real strategy, no duplicates, and every value is a genuine number. Raises before
    equilibrium is ever inspected -- §12.19's own 'Payoff 設錯，模型再漂亮也無用' mechanized as a hard
    precondition, not a soft caution."""
    if not isinstance(payoffs, list) or not payoffs:
        raise InvariantViolation(f"GAMETH_INVALID_PAYOFF: payoffs must be a non-empty list, got {_shallow_describe(payoffs)}")
    strategy_pair_set = set(strategy_pairs)
    seen: list[tuple[str, str]] = []
    for index, payoff in enumerate(payoffs):
        if not isinstance(payoff, dict) or set(payoff.keys()) - _PAYOFF_KEYS or not _PAYOFF_KEYS <= payoff.keys():
            raise InvariantViolation(f"GAMETH_INVALID_PAYOFF: payoffs[{index}] must be a dict with exactly keys {sorted(_PAYOFF_KEYS)}, got {_shallow_describe(payoff)}")
        player_id, strategy_id, value = payoff.get("player_id"), payoff.get("strategy_id"), payoff.get("value")
        if not _is_nonempty_str(player_id) or not _is_nonempty_str(strategy_id):
            raise InvariantViolation(f"GAMETH_INVALID_PAYOFF: payoffs[{index}] player_id and strategy_id must each be a non-empty string, got {_shallow_describe(payoff)}")
        if not _is_number_excluding_bool(value):
            raise InvariantViolation(f"GAMETH_INVALID_PAYOFF: payoffs[{index}] value must be a real number (bool excluded), got {value!r}")
        pair = (player_id, strategy_id)
        if pair not in strategy_pair_set:
            raise InvariantViolation(f"GAMETH_PAYOFF_UNKNOWN_STRATEGY: payoffs[{index}] (player_id, strategy_id) {pair} does not reference any entry in strategies")
        seen.append(pair)
    duplicates = {pair for pair in seen if seen.count(pair) > 1}
    if duplicates:
        raise InvariantViolation(f"GAMETH_PAYOFF_DUPLICATE: (player_id, strategy_id) pair(s) {sorted(duplicates)} have more than one payoff entry")
    missing = strategy_pair_set - set(seen)
    if missing:
        raise InvariantViolation(
            f"GAMETH_PAYOFF_INCOMPLETE: strategy pair(s) {sorted(missing)} have no payoff -- §12.19's own limitation "
            f"('Payoff 設錯，模型再漂亮也無用') means an equilibrium cannot be accepted while the payoff table is incomplete"
        )


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_game_theory_model(
    record_id: str,
    players: list[dict[str, Any]],
    strategies: list[dict[str, Any]],
    payoffs: list[dict[str, Any]],
    equilibrium: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/game-theory.schema.yaml``.

    Enforces all real invariants fail-closed, in order: id/version/provenance shape, then players (>=2,
    well-formed, unique), then strategies (every player covered, every reference valid, no duplicates), then
    payoffs (real numbers, valid references, no duplicates, and -- the invariant this method exists to enforce
    -- COMPLETE coverage of every declared strategy), and only THEN equilibrium (non-empty). A model whose
    payoff table is incomplete is refused before its equilibrium claim is ever inspected -- never silently
    stored with a gap in the data supposedly backing that claim.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"GAMETH_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"GAMETH_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"GAMETH_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    player_ids = _validate_players(players)
    strategy_pairs = _validate_strategies(strategies, player_ids)
    _validate_payoffs(payoffs, strategy_pairs)

    if not _is_nonempty_str(equilibrium):
        raise InvariantViolation(f"GAMETH_EMPTY_EQUILIBRIUM: equilibrium must be a non-empty string, got {equilibrium!r}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        # dict(...) per element, not just list(...) on the outer list -- a shallow list() copy still shares
        # the caller's own nested dicts, so `payoffs[0]["value"] = 99999` after construction would silently
        # rewrite a gate-passed record (critic-found gap, 2026-09-11; every other builder in this batch --
        # stakeholder_map/power_interest/salience_model/incentive_mapping/raci/batna/coalition_mapping --
        # already rebuilds each element, this was the one that didn't).
        "players": [dict(player) for player in players],
        "strategies": [dict(strategy) for strategy in strategies],
        "payoffs": [dict(payoff) for payoff in payoffs],
        "equilibrium": equilibrium,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_game_theory_model -- a hand-tampered record that bypassed the builder entirely must be caught exactly
# as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_game_theory_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_game_theory_model``, so a hand-tampered record that bypassed the builder entirely
    (e.g. a payoff spliced out after construction) is caught here exactly as a builder-refused one would have
    been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("game_theory_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("game_theory_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("game_theory_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    # Record-level key-set check (critic-found gap, 2026-09-11: an added/removed top-level key was only
    # caught by JSON Schema, not this gate, even though the gate's own docstring claims to catch a
    # hand-tampered record "exactly as a builder-refused one would have been"). _STORED_CONTENT_KEYS was
    # defined at module scope but never referenced before this fix.
    #
    # unknown vs missing are NOT the same set (2nd critic pass, 2026-09-11): the schema's own `required:`
    # (game-theory.schema.yaml) does NOT include generated_by_method (it carries a schema-level `default`,
    # never populated by a validator) -- the first fix's version of this check wrongly required it, FAILing
    # a 100% schema-valid record. unknown_keys is still checked against the full stored set (an ADDED key is
    # always wrong); missing_keys is checked against the smaller required set.
    unknown_keys = set(record.keys()) - _STORED_CONTENT_KEYS
    missing_keys = (_STORED_CONTENT_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "game_theory_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    player_ids: list[str] = []
    strategy_pairs: list[tuple[str, str]] = []
    try:
        player_ids = _validate_players(record.get("players"))
    except InvariantViolation as error:
        problems.append(str(error))
    try:
        strategy_pairs = _validate_strategies(record.get("strategies"), player_ids) if player_ids else []
        if not player_ids:
            problems.append("strategies could not be checked: players failed validation")
    except InvariantViolation as error:
        problems.append(str(error))
    try:
        if strategy_pairs:
            _validate_payoffs(record.get("payoffs"), strategy_pairs)
        else:
            problems.append("payoffs could not be checked: strategies failed validation")
    except InvariantViolation as error:
        problems.append(str(error))
    if not _is_nonempty_str(record.get("equilibrium")):
        problems.append("equilibrium missing or empty")

    return _result("game_theory_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_game_theory_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring and insight.jtbd's own identical "only emit gates for what is
    actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_game_theory_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
