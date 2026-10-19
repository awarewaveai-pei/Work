# codex-oracle review -- 2026-10-15 12:19:49 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/suggest-compact.js, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/suggest-compact-rule.test.mjs, scripts/test-hooks.sh, agency-os/AGENTS.md, agency-os/docs/operations/AGENTS_APPENDIX.md, agency-os/docs/operations/TOOL_TRIGGER_MAP.md, agency-os/handoffs/SCHEMA.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: AGENTS.md section 5 gains a Session-switch reminder (first line: /compact at CTX>=50%, /clear plus an opening line for the new session when the task is closed); rules/suggest-compact.js is rewritten from a Write/Edit tool-call counter into a UserPromptSubmit rule that reads the last non-sidechain assistant usage from transcript_path and injects [Hook][CTX] tokens/percent with a model-id window table (Claude 5 family = 1M, else 200k bumped to 1M when exceeded, env override); manifest rewired; new unit test; docs synced.
- exit: 0 | elapsed: 140493ms | answer: 727B
- files-reviewed: agency-os/AGENTS.md, agency-os/docs/operations/AGENTS_APPENDIX.md, agency-os/docs/operations/TOOL_TRIGGER_MAP.md, agency-os/handoffs/SCHEMA.md, mcp/claude-userlevel/hooks/rules.manifest.json, mcp/claude-userlevel/hooks/rules/suggest-compact.js, scripts/test-hooks.sh, tests/hooks/suggest-compact-rule.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The fixed 1 MiB tail can silently disable context warnings when a large record follows the last assistant message.
  mcp/claude-userlevel/hooks/rules/suggest-compact.js:25 -> mcp/claude-userlevel/hooks/rules/suggest-compact.js:57 -> mcp/claude-userlevel/hooks/rules/suggest-compact.js:73
  confidence  -> CONFIRMED
  scenario    -> A 2 MiB tool-result or user record follows the final assistant record; the tail excludes that assistant record, `lastAssistantUsage` returns `null`, and `check` emits no `[Hook][CTX]` warning even at 85% context.
  why missed  -> The tail assumption only works when the latest assistant record remains within the final 1 MiB; large trailing records are not handled.

TOTAL: 1 findings
