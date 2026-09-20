---
name: qa-review
description: >-
  Run QA testing on a local dev environment and produce a structured report. Trigger on "run QA", "test the app", "check for bugs", "QA review", "test before deploy", "跑 QA", "測試功能", "找 bug", "上線前測試", "QA 報告". Runs a 5-level Claude Code check before starting.
---

# qa-review

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/qa-review/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.