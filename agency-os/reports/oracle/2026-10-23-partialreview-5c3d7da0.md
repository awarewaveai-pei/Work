# codex-oracle review -- 2026-10-23 13:29:24 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, tests/hooks/shared-file-guard.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: git-commit-scope-guard PreToolUse: a GIT_INDEX_FILE value containing $ or a backtick (command substitution / variable) is BLOCKED, because the hook cannot expand it: before this, no marker was read, git reads of a nonexistent index failed open, and the PostToolUse shared-index sync never ran (57 entries left stale on 2026-10-23). Test added. Report only real defects (bypasses of this check, false blocks of legitimate literal paths).
- exit: 0 | elapsed: 295955ms | answer: 1877B
- files-reviewed: mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, tests/hooks/shared-file-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: An exported command-substitution value bypasses the new check and skips private-index synchronization.
  file:line   -> mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:540 -> mcp/claude-userlevel/hooks/lib/shared.js:167
  confidence  -> CONFIRMED
  scenario    -> `export GIT_INDEX_FILE="$(cat idx.txt)"; git commit -m mine` is split into separate segments, so `privateIndexOf` sees only `git commit`; the commit uses the private index, but PostToolUse finds no marker and leaves the shared index stale.
  why missed  -> The test covers only an assignment on the same command segment.

FINDING 2: Tilde-expanded private-index paths still fail open.
  file:line   -> mcp/claude-userlevel/hooks/git-commit-scope-guard.js:540 -> mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:350
  confidence  -> CONFIRMED
  scenario    -> With a valid marker at `/home/u/private.index`, `GIT_INDEX_FILE=~/private.index git commit` passes the `$`/backtick test; marker reads use the literal `~/private.index`, git-state verification returns null and fails open, while Bash expands `~` and commits. PostToolUse cannot sync the shared index.
  why missed  -> The check treats only `$` and backticks as non-literal shell syntax.

FINDING 3: A commit message containing `GIT_INDEX_FILE=$...` is falsely blocked.
  file:line   -> mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:341 -> mcp/claude-userlevel/hooks/lib/shared.js:467
  confidence  -> CONFIRMED
  scenario    -> `git commit -m 'Document GIT_INDEX_FILE=$HOME/private.index'` has no environment assignment, but `privateIndexOf` scans inside the message, extracts `$HOME/private.index`, and the new check blocks the legitimate commit.
  why missed  -> The new check assumes `privateIndexOf` is restricted to leading assignments, but its regex searches the entire commit segment.

TOTAL: 3 findings
