---
name: improve-codebase-architecture
description: >-
  Find deepening opportunities in a codebase — refactors that turn shallow modules into deep ones. Generates a visual HTML report with before/after diagrams. Use when user wants to improve architecture, find refactoring opportunities, reduce coupling, make code more testable or AI-navigable, or mentions "架構改善", "重構機會", "模組太分散", "很難測試", "run this every few days". See LANGUAGE.md for vocabulary.
---

# improve-codebase-architecture

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/improve-codebase-architecture/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.