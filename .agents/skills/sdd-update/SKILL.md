---
name: sdd-update
description: >-
  Sync the system design document (SDD or equivalent) with recent code changes. Trigger on "update sdd", "sync design doc", "update system design", "doc is out of date", "update API doc", "更新 sdd", "同步設計文件", "技術文件過時了", "更新 API 文件", "sdd 跟程式碼不一致". Runs a 5-level Claude Code check before starting.
---

# sdd-update

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

The source skill lives at `.claude/skills/sdd-update/SKILL.md` (relative to the repo root). When this wrapper triggers, read that `SKILL.md` and follow the source workflow directly.

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.