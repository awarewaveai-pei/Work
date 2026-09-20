---
name: strategy-review
description: >-
  Run a multi-angle strategic decision review for tool selection, client engagement, business strategy, vendor selection, integration decisions, pre-mortems, red-blue debate, and should-we questions that need tradeoff analysis and a tracked decision record.
---

# strategy-review

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/strategy-review/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.