# codex-oracle review -- 2026-10-22 12:03:26 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, tests/hooks/file-claim-guard.test.mjs, .gitignore  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: file-claim-guard skips script-generated reports/status/*-LATEST.* (claims.GENERATED, one SSOT in lib/file-claims.js) so regenerating them no longer warns another-session-is-editing; real files still warn. Also .gitignore for Claude app state .claude/policy-limits.json* and .claude/remote-settings.json*.
- exit: 0 | elapsed: 133533ms | answer: 667B
- files-reviewed: .gitignore, mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, tests/hooks/file-claim-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The generated-file test never creates the claim it claims to test.
  tests/hooks/file-claim-guard.test.mjs:360 -> mcp/claude-userlevel/hooks/rules/file-claim-guard.js:51
  confidence  -> CONFIRMED
  scenario    -> `written(s, A, f, ...)` runs through `targets()`, which skips generated paths, so A creates no claim. A regression removing the Bash filter at `file-claim-guard.js:188` would still pass because `holderOf(s, f)` is already null.
  why missed  -> The shared `written()` helper looks like a real Edit, but its pre/post hooks both exclude the generated path; the test therefore never exercises suppression of an existing claim.

TOTAL: 1 findings
