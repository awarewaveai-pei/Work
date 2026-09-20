---
name: prototype
description: >-
  Build a throwaway prototype to flesh out a design before committing to it. Routes between two branches — a runnable terminal app for state/business-logic questions, or several radically different UI variations toggleable from one route. Use when user wants to prototype, sanity-check a data model or state machine, mock up a UI, explore design options, or says "prototype this", "做個原型", "先試試看", "讓我玩一下", "試幾個設計".
---

# prototype

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/prototype/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.