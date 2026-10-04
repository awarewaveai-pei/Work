"""TEACH's reviewed content rulesets."""

from __future__ import annotations

from ai_lego.platform.lessons import HISTORY, load_lessons, load_practice_cases


RULESETS = [load_lessons(), load_practice_cases()]
