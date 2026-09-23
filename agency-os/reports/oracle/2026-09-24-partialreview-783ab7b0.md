# codex-oracle review -- 2026-09-24 03:17:43 +08:00

- mode: `review`
- scope: -Path scripts/git-partial-worktree-commit.py, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, mcp/claude-userlevel/hooks/rules/worklog-entry-number-guard.js, mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, mcp/claude-userlevel/hooks/lib/shared.js, mcp/claude-userlevel/hooks/rules/verify-gate-commit.js, mcp/claude-userlevel/hooks/rules/commit-quality.js, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/shared-file-guard.test.mjs, tests/scripts/git_partial_worktree_commit_test.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Decision: close the "shared-file sweep" hole mechanically. Concurrent Claude sessions share one worktree + one git index; git-commit-scope-guard.js (2026-08-30) only blocks a bare commit that sweeps files another session STAGED. Two doors stayed open: `git commit -- agency-os/WORKLOG.md` commits the WORKTREE bytes of the path (every session's hunks), and a whole-file `git add` of a shared file + bare commit. Also concurrent sessions hand-pick the same WORKLOG entry number (蝥).
Mechanism: scripts/git-partial-worktree-commit.py `stage` builds a PRIVATE index (GIT_INDEX_FILE) = HEAD + explicitly selected hunks (--worklog-entry N block / --range / --keep-re) + whole own files, and writes a marker <index>.json {root, entries:{path:blob}, own:[path]}. The operator commits with `GIT_INDEX_FILE=<idx> git commit -F msg`. git-commit-scope-guard.js v7 accepts such a commit only while the private index equals the marker (validatePrivateIndex) and, PostToolUse, syncs the shared index entries of the committed paths to HEAD (`git reset -q -- <paths>`) and deletes index+marker. New git-shared-file-guard.js blocks every other way a shared file (agency-os/WORKLOG.md, TASKS.md) reaches a commit (pathspec with worktree != HEAD; bare commit with shared-index blob != HEAD; GIT_INDEX_FILE without marker), ack line `# CONFIRMED-SHARED-FILE-COMMIT:`. New worklog-entry-number-guard.js blocks an Edit/Write on WORKLOG.md that introduces an already-existing `## <date>嚗?N嚗 header. RE_GIT_COMMIT moved to lib/shared.js and now accepts leading VAR=value / env prefixes -- previously `GIT_INDEX_FILE=x git commit` bypassed verify-gate-commit, commit-quality and the scope guard.
Constraints: Node >= 18 hooks, no dependencies, rules fail open on their own errors (logFailOpen); python 3 helper, git only. Tests: tests/hooks/shared-file-guard.test.mjs (7, real runner + real helper on a scratch repo), tests/scripts/git_partial_worktree_commit_test.py (5); full suite 287 green.
Acceptance / review focus: (1) any remaining way to get another session's hunks of a shared file into a commit that the guards do not see (command shapes, quoting, `env`, `-C`, cd, chained commands, --amend, merges); (2) correctness of validatePrivateIndex and the PostToolUse sync (can it drop or revert anything in the shared index or worktree? races with a concurrent `git add`?); (3) worklog_target placement/CRLF logic; (4) RE_GIT_COMMIT regression risk for existing commands; (5) test gaps. Report concrete file:line findings only.
- exit: 0 | elapsed: 113847ms | answer: 2434B
- files-reviewed: mcp/claude-userlevel/hooks/lib/shared.js, mcp/claude-userlevel/hooks/rules.manifest.json, mcp/claude-userlevel/hooks/rules/commit-quality.js, mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, mcp/claude-userlevel/hooks/rules/verify-gate-commit.js, scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, mcp/claude-userlevel/hooks/rules/worklog-entry-number-guard.js, tests/hooks/shared-file-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `env VAR=value git commit` bypasses all commit guards

  file:line   -> `mcp/claude-userlevel/hooks/lib/shared.js:469`

  confidence  -> CONFIRMED

  scenario    -> `env GIT_INDEX_FILE=/tmp/unmarked.index git commit -m x` is executed; the regex allows `env` flags but not assignments after `env`, so no commit segment is found and shared-file protection is skipped.

  why missed  -> The regex was expanded for environment prefixes but only modeled `VAR=value git` and `env -x git`, not `env VAR=value git`.

FINDING 2: `--amend` and broad flags bypass the shared-file guard

  file:line   -> `mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js:57-58`

  confidence  -> CONFIRMED

  scenario    -> Another session stages a full `agency-os/WORKLOG.md`; the current session runs `git commit --amend -m x` or `git commit -a -m x`. The guard returns before inspecting the shared file, and the other session’s hunks are included.

  why missed  -> The implementation inherits the scope guard’s exemptions without accounting for the fact that amend and `-a` still consume staged/worktree shared-file bytes.

FINDING 3: PostToolUse can erase another session’s staged index entries

  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:384,389`

  confidence  -> CONFIRMED

  scenario    -> Session A commits through a private index while Session B runs `git add agency-os/TASKS.md` between A’s commit and PostToolUse. A’s `git reset -q -- agency-os/TASKS.md` resets B’s shared-index entry to HEAD, silently discarding B’s staged change.

  why missed  -> The sync treats the shared index as stable across the commit/PostToolUse gap; the private index protects commit contents but does not serialize updates to the shared index.

FINDING 4: Sync failures are ignored while the private index is deleted

  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:389,392`

  confidence  -> CONFIRMED

  scenario    -> The commit succeeds, but `git reset -q -- <paths>` fails because another Git process holds the index lock. The return value is ignored, then the private index and marker are deleted; the shared index still contains stale committed entries, but the operator receives no failure signal.

  why missed  -> Cleanup is unconditional after attempting synchronization, so failure of the synchronization step is not surfaced or recoverable.

TOTAL: 4 findings
