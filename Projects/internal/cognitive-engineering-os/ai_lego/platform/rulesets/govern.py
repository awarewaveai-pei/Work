"""GOVERN's rules (STEP34_SHARED_RULES.md §4): how many invitations may be open and made, how long one lives, and when
accepted accounts are held for the convener to confirm (one person, many accounts). Deterministic, no model."""

from __future__ import annotations

from ai_lego.platform.rulesets import Ruleset

INVITES = Ruleset("govern.invites", "GOVERN", "邀請的上限", "1", "平台（第 3 步）", {
    "expires_days": 7,                 # an invitation lives this long, then it opens nothing
    "open_per_group": 25,              # unused, unrevoked, unexpired invitations one group may have
    "created_per_identity_per_day": 10,  # invitations one person may make in 24 hours (all groups)
    "hold_after_accepts": 5,           # more accounts than this joining through one person's invitations ...
    "hold_window_hours": 24,           # ... within this many hours are held until the convener confirms each
})

RULESETS = [INVITES]

HISTORY = {
    "govern.invites": {"1": "d8b80dc49de5"},
}
