---
name: ai-decision-intelligence
description: >-
  Run structured decision intelligence for tool selection, architecture review, implementation planning, rollout planning, build-vs-buy, migration strategy, business strategy, and other choices with real tradeoffs. Use for compare X vs Y, help me decide, best stack, risk register, and ranked recommendation requests.
---

# ai-decision-intelligence

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source is a Claude `.skill` archive (zip) at `.claude/skills/ai-decision-intelligence.skill` (relative to the repo root). When this wrapper triggers, list it with `& "$env:SystemRoot\System32\tar.exe" -tf <archive>` and read files with `-xOf <archive> <path>`, starting with the packaged `SKILL.md`; then follow the source workflow. On Windows use the System32 tar explicitly: a bare `tar` may resolve to Git Bash's GNU tar, which cannot open `D:\` paths.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.