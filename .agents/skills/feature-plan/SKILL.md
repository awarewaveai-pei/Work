---
name: feature-plan
description: >-
  Plan a new feature by analyzing requirements, decomposing technical work, assessing impact, and updating planning docs. Use when the user asks for feature design, a new feature plan, implementation breakdown, scope sizing, or plan.md/docs updates before coding.
---

# feature-plan

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/feature-plan/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.