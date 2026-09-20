---
name: grill-with-docs
description: >-
  Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions, mentions "grill with docs", "對齊設計", "確認術語", "更新詞彙表", or wants deep pre-implementation alignment with codebase context.
---

# grill-with-docs

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/grill-with-docs/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.