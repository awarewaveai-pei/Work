# codex-oracle review -- 2026-10-22 14:29:24 +08:00

- mode: `review`
- scope: -Path scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Second round. Round 1 (artifact 2026-10-22-partialreview-56045bf3) found: F1 deleted directory not staged (no -r), F2 re-staging same deletion aborts. Fixed: git rm --cached -r --quiet --ignore-unmatch. Test now deletes a whole directory, re-stages the same deletion into the same index, and checks an ignored on-disk file is still refused. 7/7; mutation removing -r -> red; removing --ignore-unmatch -> red.
- exit: 0 | elapsed: 161442ms | answer: 707B
- files-reviewed: scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Deleted tracked children are not staged when their ignored parent directory still exists.
  scripts/git-partial-worktree-commit.py:248-251 -> tests/scripts/git_partial_worktree_commit_test.py:163
  confidence  -> CONFIRMED
  scenario    -> `HEAD` tracks `logs/a.md`; `.gitignore` contains `logs/`; `logs/a.md` is deleted but ignored `logs/b.md` remains -> `lexists(root/"logs")` classifies `logs` as present, `git add -- logs` refuses the ignored directory, and the deletion of `logs/a.md` is not staged.
  why missed  -> The test deletes the entire directory, then tests an ignored file explicitly; it does not test a deleted tracked child alongside an ignored on-disk sibling.

TOTAL: 1 finding
