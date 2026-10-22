# codex-oracle review -- 2026-10-22 21:49:12 +08:00

- mode: `review`
- scope: -Path scripts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `4d73ef128^..4d73ef128`
- context: AO-RESUME parity in a shared checkout: when ff-only is refused because a dirty file was also changed upstream, git-parity-merge.py 3-way merges each blocking file (base=HEAD, ours=worktree, theirs=origin/main), and only if all merge cleanly resets those index entries, writes HEAD bytes, ff-only, writes merged bytes. doc-sync skips writes where only the _Last synced stamp changes. Look for data loss of other sessions' uncommitted work.
- exit: 0 | elapsed: 144381ms | answer: 1158B
- files-reviewed: scripts/ao-resume.ps1, scripts/doc-sync-automation.ps1, scripts/git-parity-merge.py, scripts/lib/git-safe-ops.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Staged-only local content is discarded because `ours` reads only the worktree.
  scripts/git-parity-merge.py:49-57 -> scripts/git-parity-merge.py:76-77
  confidence  -> CONFIRMED
  scenario    -> HEAD contains A, index contains staged B, worktree was restored to A, and origin changes the file to C -> the helper merges A/A/C, resets the index, fast-forwards, and loses staged B.
  why missed  -> Normal staged edits usually leave the same bytes in the worktree, so this split index/worktree state is easy to miss.

FINDING 2: Failed rollback does not restore the index, despite reporting that nothing was touched.
  scripts/git-parity-merge.py:76-87
  confidence  -> CONFIRMED
  scenario    -> One planned file has staged-only content, then another session dirties a second upstream-changed file before the helper’s second `ff-only` -> `git reset` has already replaced the first index entry, `ff-only` fails, rollback restores only worktree bytes, and the staged content is lost; line 87 reports failure as if nothing changed.
  why missed  -> The rollback handles moved files and worktree bytes but omits the index snapshot.

TOTAL: 2 findings
