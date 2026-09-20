---
name: diagnose
description: >-
  Disciplined diagnosis loop for hard bugs and performance regressions. Reproduce → minimise → hypothesise → instrument → fix → regression-test. Use when user says "diagnose this", "debug this", reports a bug, says something is broken/throwing/failing, describes a performance regression, "找不到 bug", "一直報錯", "行為異常", "效能問題". For complex root-cause chains, defer to the `debugger` agent.
---

# diagnose

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/diagnose/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.