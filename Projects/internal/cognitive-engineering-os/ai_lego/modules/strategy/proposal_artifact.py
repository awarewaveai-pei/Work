"""``artifact.generate_proposal`` capability adapter -- composes a Markdown business proposal from bound outputs.

Side-effect free (returns an artifact value; nothing is written to an operator path). Every number and
statement is CARRIED from typed, gate-checked upstream records; nothing is generated. Fail-closed: each bound
input must be the dict the producing method emitted, otherwise the step errors instead of printing "N/A".
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

REQUIRED_INPUTS = ("problem_statement", "market_analysis", "swot", "strategy_options", "financial_assumptions", "npv", "risk_register", "okr", "roadmap")


def _req(payload: dict[str, Any], key: str) -> dict[str, Any]:
    value = payload.get(key)
    if not isinstance(value, dict):
        raise InvariantViolation(f"PROPOSAL_INPUT_REQUIRED: {key} must be the upstream record, got {type(value).__name__}")
    return value


def _f(record: Any, *path: str) -> Any:
    """Strict carried-field access: a missing key is an upstream shape drift and fails the step (never 'None' in prose)."""
    value = record
    for key in path:
        if not isinstance(value, dict) or key not in value:
            raise InvariantViolation(f"PROPOSAL_FIELD_MISSING: {'.'.join(path)}")
        value = value[key]
    return value


def _items(record: dict[str, Any], key: str) -> list[dict[str, Any]]:
    items = _f(record, key)
    if not isinstance(items, list) or not all(isinstance(i, dict) for i in items):
        raise InvariantViolation(f"PROPOSAL_FIELD_MISSING: {key} must be a list of records")
    return items


def _bullets(items: list[dict[str, Any]], fmt) -> list[str]:
    return [f"- {fmt(i)}" for i in items] or ["- (none)"]


def proposal_artifact_adapter(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
    p = {key: _req(payload, key) for key in REQUIRED_INPUTS}
    ps, mkt, swot, tows, fin, npv, risks, okr, road = (p[k] for k in REQUIRED_INPUTS)
    sizing = _f(mkt, "sizing")
    lines = [
        "# Business proposal (generated from typed records; review required)",
        "",
        "## 1. Problem",
        f"- Current: {_f(ps, 'content', 'current_state')}",
        f"- Expected: {_f(ps, 'content', 'expected_state')}",
        f"- Gap: {_f(ps, 'content', 'gap')}",
        "",
        "## 2. Market",
        f"- Definition: {_f(mkt, 'market_definition')}",
        f"- TAM / SAM / SOM: {_f(sizing, 'tam')} / {_f(sizing, 'sam')} / {_f(sizing, 'som')} {_f(sizing, 'unit')}",
        *_bullets(_items(mkt, "segments"), lambda s: f"Segment {_f(s, 'name')}: {_f(s, 'size_estimate')} {_f(sizing, 'unit')}, growth {_f(s, 'growth_rate')} (evidence {_f(s, 'evidence_ref')})"),
        "",
        "## 3. SWOT",
        *_bullets(_items(swot, "factors"), lambda f: f"{_f(f, 'category')}: {_f(f, 'statement')}"),
        "",
        "## 4. Strategy options (TOWS)",
        *_bullets(_items(tows, "pairings"), lambda t: f"{_f(t, 'pairing_type')} ({_f(t, 'internal_factor_id')} x {_f(t, 'external_factor_id')}): {_f(t, 'strategy_option')}"),
        "",
        "## 5. Financial assumptions",
        f"- Currency {_f(fin, 'currency')}, discount rate {_f(fin, 'discount_rate')}, horizon {_f(fin, 'horizon_years')} years",
        *_bullets(_items(fin, "assumptions"), lambda a: f"{_f(a, 'name')}: {_f(a, 'value')} {_f(a, 'unit')} (basis: {_f(a, 'basis')})"),
        f"- NPV ({_f(npv, 'id')}): {_f(npv, 'npv')}",
        "",
        "## 6. Risks",
        *_bullets(_items(risks, "risks"), lambda r: f"{_f(r, 'risk_id')}: {_f(r, 'description')} (p={_f(r, 'probability')}, impact={_f(r, 'impact')}, owner {_f(r, 'owner')})"),
        "",
        "## 7. KPI (OKR)",
        f"- Objective: {_f(okr, 'objective')}",
        *_bullets(_items(okr, "key_results"), lambda k: f"{_f(k, 'id')}: {_f(k, 'description')} -> {_f(k, 'target')} ({_f(k, 'owner')})"),
        "",
        "## 8. Execution plan (outcome roadmap)",
        *_bullets(_items(road, "outcomes"), lambda o: f"{_f(o, 'outcome_id')} [{_f(o, 'theme_id')}]: {_f(o, 'description')}"),
        *_bullets(_items(road, "bets"), lambda b: f"Bet {_f(b, 'bet_id')} -> {_f(b, 'outcome_id')}: {_f(b, 'description')}"),
        f"- Next review: {_f(road, 'next_review')}",
        "",
        "_Status: NEEDS_HUMAN_REVIEW. Numbers are carried from provenance-bearing records; this document is not investment advice._",
    ]
    return {
        "artifact": {
            "artifact_type": "BusinessProposalArtifact",
            "content": "\n".join(lines) + "\n",
            "sources": {key: _f(p[key], "id") for key in REQUIRED_INPUTS},
            "provenance": {"source": "proposal_artifact_adapter", "epistemic_type": "AI_GENERATED"},
        }
    }
