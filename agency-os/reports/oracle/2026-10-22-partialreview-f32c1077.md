# codex-oracle review -- 2026-10-22 14:37:45 +08:00

- mode: `review`
- scope: -Path scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3, rewritten from the invariant instead of patching: own paths -> private index matches the worktree; tracked entries (edits and deletions, files or dirs, ignored or not) via git add -u; new content via plain git add only, so an explicitly named ignored path still fails (never force-added). tracked = has entries in THIS private index (git ls-files under GIT_INDEX_FILE), so a deletion already staged makes a re-stage a no-op. check-ignore --no-index because by default a path with tracked entries is reported not-ignored. Rounds 1-2 (artifacts 56045bf3, 0d85d4cc): deleted dir, re-stage, ignored dir with deleted tracked child + ignored sibling -- all covered by the test. 7/7; 4 mutations (plain add for tracked, no ignore check, no --no-index, tracked from HEAD) each red; shared-file-guard tests 12/12.
- exit: 0 | elapsed: 151318ms | answer: 11B
- files-reviewed: scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
