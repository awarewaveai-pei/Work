---
name: tdd
description: >-
  Test-driven development with red-green-refactor loop, vertical slices, and behavior-focused tests. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", "寫測試", "TDD", wants integration tests, or asks for test-first development. See bundled files: tests.md, mocking.md, deep-modules.md, interface-design.md, refactoring.md.
---

# tdd

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/tdd/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.