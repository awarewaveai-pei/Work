# codex-oracle review -- 2026-09-24 03:23:41 +08:00

- mode: `review`
- scope: -Path scripts/git-partial-worktree-commit.py, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, mcp/claude-userlevel/hooks/lib/shared.js, tests/hooks/shared-file-guard.test.mjs, tests/scripts/git_partial_worktree_commit_test.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 3 of the shared-file commit guard (same decision/mechanism as round 2, artifact agency-os/reports/oracle/2026-09-24-partialreview-783ab7b0.md). Round-2 findings and what changed:
F1 (`env VAR=value git commit` unmatched) -- REJECTED as stated: RE_GIT_COMMIT already matched `env GIT_INDEX_FILE=x git commit` (verified by direct test); the real gap was `env -u FOO VAR=1 git commit` (flag with an argument) -> regex now allows one non-dash argument per env flag with backtracking (lib/shared.js), test added.
F2 (--amend / -a bypass) -- FIXED: git-shared-file-guard.js no longer exempts --amend; -a/--all is checked as a worktree commit of every shared file (the scope guard still blocks -a outright). Tests added.
F3 (PostToolUse reset could discard another session's staged entry) -- FIXED: marker records `base` (HEAD blob per path at stage time); a shared-index entry is reset only when it equals base or the committed blob, otherwise left untouched with a WARN. Test added (B stages TASKS in the window).
F4 (reset failure ignored, index deleted) -- FIXED: reset exit status checked; on failure index+marker are kept and a WARN names the manual command. Test added (index.lock held).
Also added: marker `head` (HEAD sha at stage) -- validatePrivateIndex and the helper refuse when HEAD moved, because a commit from a private index read-tree'd from an older HEAD would revert everything committed in between (git does not check). Tests added.
Review focus for this round: (1) is there still a way for a private-index commit to revert or drop another session's work (worktree, shared index, HEAD)? (2) any regression in RE_GIT_COMMIT for ordinary commands; (3) correctness of the base/committed comparison in syncSharedIndexAfterPrivateCommit (untracked own files, files absent from HEAD); (4) test gaps. Concrete file:line findings only; say NO FINDINGS if none.
- exit: 0 | elapsed: 100827ms | answer: 820B
- files-reviewed: mcp/claude-userlevel/hooks/lib/shared.js, mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, tests/hooks/shared-file-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Private-index validation is vulnerable to a HEAD-move race and can revert another session’s commit
  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:382-383` -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:498-500`
  confidence  -> CONFIRMED
  scenario    -> HEAD is `H1`; PreToolUse validates the private index against `H1` and returns allow; another session commits `H2`; the original `GIT_INDEX_FILE=... git commit` then runs. Git accepts the older private index tree and creates a commit based on `H1`, silently reverting the files introduced by `H2`.
  why missed   -> The new `HEAD` check prevents stale commits only when HEAD is unchanged between hook validation and the actual Git process; there is no lock or revalidation at commit time.

TOTAL: 1 findings
