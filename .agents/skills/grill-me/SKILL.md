---
name: grill-me
description: >-
  Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree one at a time. For each question, provide a recommended answer. Use when user wants to stress-test a plan, get grilled on their design, mentions "grill me", "問爆我", "逼我想清楚", "壓力測試計畫", "質問我", or wants deep alignment before starting.
---

# grill-me

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/grill-me/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.