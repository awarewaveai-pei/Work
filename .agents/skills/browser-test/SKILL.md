---
name: browser-test
description: >-
  Live browser testing via Chrome MCP (Claude-in-Chrome extension). Drives the user's real logged-in Chrome session — no headless, no credentials needed. Use for e2e verification of authenticated features, Canvas/Fabric.js tools, React app state, API calls. Trigger on "幫我測", "瀏覽器測試", "browser test", "Chrome 測一下", "live test", "測一下 XXX 頁面", "幫我跑一下 e2e".
---

# browser-test

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/browser-test/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.