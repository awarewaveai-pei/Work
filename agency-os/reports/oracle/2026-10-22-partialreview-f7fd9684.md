# codex-oracle review -- 2026-10-22 12:16:06 +08:00

- mode: `review`
- scope: -Path .gitignore, mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, tests/hooks/file-claim-guard.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: file-claim-guard must not claim or warn on script-generated whole-file outputs (agency-os/reports/status/*-LATEST.json|md) via claims.GENERATED; app-written .claude/policy-limits.json* and remote-settings.json* are gitignored. Invariant: claim = hand-written hunk by a session; real tracked files must still warn.
- exit: 0 | elapsed: 369541ms | answer: 634B
- files-reviewed: .gitignore, mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, tests/hooks/file-claim-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `GENERATED` suppresses conflict protection for hand-edited tracked files matching the pattern.
  file:16, 48-52, 188   -> `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:16`
  confidence  -> CONFIRMED
  scenario    -> A edits tracked `agency-os/reports/status/backup-health-LATEST.json` with `Edit`; B edits it with `Edit` afterward. `targets()` excludes the file, so A creates no claim and B receives no warning or block.
  why missed  -> The test only verifies that a matching path does not warn; it never verifies that ordinary `Edit`/`Write` operations on a tracked matching file still conflict.

TOTAL: 1 finding
