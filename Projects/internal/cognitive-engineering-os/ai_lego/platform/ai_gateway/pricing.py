"""What a model call costs, for the pages that promise to say it before and after a run (mock: 約 6k tokens・≈ NT$1).

List prices per million tokens in USD (Anthropic first-party rates, checked 2026-09-28) by model id prefix; a model with no row
gets no money figure (tokens only) rather than a guess. ``COGNITIVE_OS_AI_PRICES_JSON`` overrides or extends the table
({"claude-x": [input_usd_per_m, output_usd_per_m]}); ``COGNITIVE_OS_USD_TWD`` sets the exchange rate (default 32).
"""

from __future__ import annotations

import json
import os

from ai_lego.errors import InvariantViolation

PRICES_ENV = "COGNITIVE_OS_AI_PRICES_JSON"
USD_TWD_ENV = "COGNITIVE_OS_USD_TWD"
DEFAULT_USD_TWD = 32.0
USD_PER_MILLION: dict[str, tuple[float, float]] = {
    "claude-fable-5": (10.0, 50.0),         # rows checked against platform.claude.com/docs/en/about-claude/pricing 2026-09-28
    "claude-mythos-5": (10.0, 50.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4": (5.0, 25.0),           # 4.5 and later (claude-opus-4-5-…, 4-6, 4-7 …)
    "claude-opus-4-1": (15.0, 75.0),        # Opus 4.1 (claude-opus-4-1-20250805)
    "claude-opus-4-2025": (15.0, 75.0),     # Opus 4 (claude-opus-4-20250514)
    "claude-sonnet-5": (2.0, 10.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-sonnet-4": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}


def _table(environ: dict[str, str] | None = None) -> dict[str, tuple[float, float]]:
    env = os.environ if environ is None else environ
    table = dict(USD_PER_MILLION)
    raw = env.get(PRICES_ENV, "").strip()
    if raw:
        try:
            extra = json.loads(raw)
            for model, pair in extra.items():
                table[str(model)] = (float(pair[0]), float(pair[1]))
        except (ValueError, TypeError, KeyError, IndexError, AttributeError) as error:
            raise InvariantViolation(f"AI_PRICES_INVALID: {PRICES_ENV} must be {{model: [input_usd_per_m, output_usd_per_m]}} ({type(error).__name__})") from None
    return table


def usd_twd(environ: dict[str, str] | None = None) -> float:
    env = os.environ if environ is None else environ
    raw = env.get(USD_TWD_ENV, "").strip()
    if not raw:
        return DEFAULT_USD_TWD
    try:
        rate = float(raw)
    except ValueError:
        raise InvariantViolation(f"AI_USD_TWD_INVALID: {raw!r} is not a number") from None
    if rate <= 0:
        raise InvariantViolation(f"AI_USD_TWD_INVALID: must be positive, got {rate}")
    return rate


def cost_usd(model: str, input_tokens: int, output_tokens: int, environ: dict[str, str] | None = None) -> float | None:
    """The longest price-table prefix of ``model`` wins ("claude-sonnet-5-20261001" -> "claude-sonnet-5"); None when unknown."""
    table = _table(environ)
    match = max((key for key in table if str(model).startswith(key)), key=len, default=None)
    if match is None:
        return None
    price_in, price_out = table[match]
    return (max(0, int(input_tokens)) * price_in + max(0, int(output_tokens)) * price_out) / 1_000_000


def cost_twd(model: str, input_tokens: int, output_tokens: int, environ: dict[str, str] | None = None) -> float | None:
    usd = cost_usd(model, input_tokens, output_tokens, environ)
    return None if usd is None else round(usd * usd_twd(environ), 2)
