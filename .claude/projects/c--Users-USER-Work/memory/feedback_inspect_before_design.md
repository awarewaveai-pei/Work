---
name: inspect-before-design
description: "For tools/platforms with existing instances (Claude routines, n8n workflows, Trigger.dev tasks, GitHub workflows), ALWAYS list and inspect existing instances FIRST before designing a new one — even before abstract research."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3dd59cab-9a08-4944-b530-bad45e99670b
---

When working with a tool/platform that has existing instances in the user's account (Claude routines, n8n workflows, Trigger.dev tasks, GitHub Actions, etc.), the **first action** must be:

1. `/schedule list` (or equivalent: `n8n list`, `gh workflow list`, etc.)
2. Read 2-3 existing instances' full configs
3. THEN design the new one

**Why:** Existing instances reveal the actual operational pattern (what auth works, what's hardcoded, what's wired up). Abstract docs / subagent research describe what the platform *can* do, not what *this user has done*. Designing from abstract docs first means you'll waste effort planning around constraints that don't exist in practice, or miss constraints that do exist.

**How to apply:** Before invoking the create/write path for ANY scheduled or hosted resource, the previous turn should have invoked the list/inspect path. If you find yourself drafting a prompt / config / SSOT before having seen 1+ existing instance, STOP and inspect first.

**Real example (2026-05-22 Phase 4 routine creation)**: Spent ~40 min designing an elaborate Telegram + env var + web-UI-checklist SSOT for a Claude routine, then ran `/schedule list` AT THE END and discovered all 3 existing routines (DailyBriefing / WeeklyReview / MonthlyReview) use ZERO env vars, no Telegram, just pure git pull + commit + push. The 262-line SSOT had to be largely rewritten. User correctly flagged: "為什麼以前做過, 你卻忘記, 然後做完了才發現?" Related: [[feedback_read_before_recommend]].

**Symptom to catch in self**: "I'm researching what X *should* be" without having checked "what X *currently is* in this account/repo." That's the trigger to switch to inspection.
