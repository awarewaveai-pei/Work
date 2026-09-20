---
name: level-check
description: >-
  Audit the current project against the 5 Levels of Claude Code framework and auto-fix any gaps found. Trigger on "check claude levels", "audit project structure", "am I at level 3", "level check", "5 levels check", "檢查 claude 層級", "盤點專案結構", "level 偵測", "我現在在哪個層級", "Claude Code 五個層級
---

# level-check

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/level-check/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.