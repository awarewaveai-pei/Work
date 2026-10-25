# codex-oracle review -- 2026-10-23 13:47:26 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, tests/hooks/shared-file-guard.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Final review after an invariant rewrite. The hook no longer models shell state: exactly one private-index shape is accepted, GIT_INDEX_FILE=<existing literal path> git commit ... as the commit segment own prefix (no env prefix). GIT_INDEX_FILE in any other segment or before git in a non-canonical form, a value with $ backtick ~ or glob chars, or a missing file -> PreToolUse BLOCK (untrustedIndex). Text inside the commit message is ignored. Over-blocking a heredoc that mentions the name is accepted. Report only real defects: a way to commit with an index the hook did not check, or a false block of the canonical shape.
- exit: 0 | elapsed: 366091ms | answer: 1247B
- files-reviewed: mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, tests/hooks/shared-file-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A preceding `cd` lets Git resolve a different relative index than the hook checks
  file:365 -> mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:499
  confidence  -> CONFIRMED
  scenario    -> From repo root, `repo/private.index` exists and is marker-valid while `repo/sub/private.index` is different; `cd sub; GIT_INDEX_FILE=private.index git commit ...` passes because the hook checks `ctx.cwd/private.index`, but Git commits using `sub/private.index`.
  why missed  -> The rewrite rejects `GIT_INDEX_FILE` in other segments but does not model `cd` state when resolving relative paths.

FINDING 2: An earlier environment assignment can make the hook check a different index than Git uses
  file:346 -> mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:351
  confidence  -> CONFIRMED
  scenario    -> Both `other.index` and `real.index` exist; `FOO='x GIT_INDEX_FILE=other.index' GIT_INDEX_FILE=real.index git commit ...` makes `RE_INDEX_ASSIGN` select `other.index`, so the marker check passes while Git uses `real.index`.
  why missed  -> The prefix regex permits arbitrary environment assignments, and the assignment regex scans quoted values textually instead of parsing assignment boundaries.

TOTAL: 2 findings
