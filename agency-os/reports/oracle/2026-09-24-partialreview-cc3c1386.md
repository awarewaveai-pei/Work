# codex-oracle review -- 2026-09-24 03:30:00 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, scripts/git-partial-worktree-commit.py, tests/hooks/shared-file-guard.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 4 (final) of the shared-file commit guard. Round-3 finding (HEAD moves between PreToolUse validation and the actual `GIT_INDEX_FILE=<idx> git commit`, so the commit's tree reverts the in-between commit) -- FIXED by checking the property of the created commit instead of the time: PostToolUse (git-commit-scope-guard.js syncSharedIndexAfterPrivateCommit) verifies HEAD^ == marker.head; when not, it undoes the commit with `git update-ref <branch> <parent> <HEAD>` (compare-and-swap; worktree and shared index untouched), deletes index+marker and tells the operator to re-stage on the current HEAD; if the CAS fails it prints the exact manual command. Invariant: a private-index commit is correct iff its parent is the HEAD its index was read from. Test added (tests/hooks/shared-file-guard.test.mjs "codex r3": H1 validate -> H2 lands -> stale commit -> PostToolUse -> HEAD == H2, other.txt intact, worktree and shared index untouched, re-stage works). Full hook suite 297/297.
Review focus: (1) can the undo itself lose or revert anything (detached HEAD, push in the same command, amend, the marker entries check before the undo)? (2) is there any remaining path where a private-index commit with a stale base survives to a push? (3) regressions for ordinary commits. Concrete file:line findings only; say NO FINDINGS if none.
- exit: 0 | elapsed: 162456ms | answer: 2570B
- files-reviewed: mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, scripts/git-partial-worktree-commit.py, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, tests/hooks/shared-file-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: PostToolUse can undo a legitimate commit made after the stale private-index commit

  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:409`
  confidence  -> CONFIRMED
  scenario    -> stale private commit H3 is created; another session immediately commits H4 on top; PostToolUse sees `HEAD=H4`, `parent=H3`, then CAS-updates the branch to H3, silently removing H4.
  why missed  -> the undo assumes `HEAD` is still the private-index commit, but only compares its parent with `marker.head`; it never verifies `HEAD == the commit created by this invocation`.

FINDING 2: `--amend` is treated as a stale-base commit and can remove the amended commit

  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:404`
  confidence  -> CONFIRMED
  scenario    -> marker is prepared on H1; `GIT_INDEX_FILE=<idx> git commit --amend` creates H1' whose parent is H1’s parent, not H1; PostToolUse enters the stale branch and updates the ref to H1’s parent, removing H1' and H1 from the branch.
  why missed  -> the parent invariant is valid for ordinary commits but not for amend commits, whose parent intentionally differs from the current HEAD.

FINDING 3: A stale private-index commit can reach the remote before PostToolUse undoes it locally

  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:481`
  confidence  -> CONFIRMED
  scenario    -> command is `GIT_INDEX_FILE=<idx> git commit -m x && git push`; the stale commit is pushed before the single PostToolUse callback runs, which only rewinds the local branch, leaving the stale commit on the remote.
  why missed  -> the guard performs its stale-parent check only after the entire tool command finishes and has no protection covering a subsequent `git push` in the same command.

FINDING 4: The private-index marker is forgeable, so the shared-file guard can be bypassed

  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:340`
  file:line   -> `mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js:84`
  confidence  -> CONFIRMED
  scenario    -> a user stages the full worktree version of `agency-os/TASKS.md` into a private index, writes `<index>.json` containing the current HEAD, the staged blob, and matching `entries`, then commits; `readMarker` accepts the structurally valid JSON and the shared-file guard skips the block.
  why missed  -> the marker is trusted based only on parseable fields; it has no authenticity check tying it to `git-partial-worktree-commit.py`.

Final line: TOTAL: 4 findings
