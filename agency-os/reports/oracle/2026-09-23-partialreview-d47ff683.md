# codex-oracle review -- 2026-09-23 23:07:02 +08:00

- mode: `review`
- scope: -Path scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 2 of scripts/git-partial-worktree-commit.py. Round-1 findings and fixes: (F1) foreign hunks are now rendered against HEAD + mine: render(write, applied) shifts each hunk old side by the deltas of applied hunks that lie entirely before its first touched line (insertion = after old_start, replacement = at old_start) and the new side by earlier written hunks; (F2) prep refuses a file with STAGED changes (git diff --cached --quiet) and a file whose previous prep was not restored (a .prepped marker); (F3) scratch names carry sha1(relative path) so same-basename files never collide. New tests/scripts/git_partial_worktree_commit_test.py: round trip with foreign insertions before and after my insertions, a mutation that renders foreign against an empty applied list must not silently reproduce the file, refusals, basename separation, no-op on no hunk. Please attack the re-anchoring maths (tie at the same old_start, replacement overlapping an insertion, CRLF files, hunks with trailing tail text), the marker lifecycle, and any remaining path where the original worktree content cannot be recovered from all.patch.
- exit: 0 | elapsed: 146395ms | answer: 1190B
- files-reviewed: scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: File mode changes are silently discarded during prep
  scripts/git-partial-worktree-commit.py:48-51, 123-131   -> scripts/git-partial-worktree-commit.py:123
  confidence  -> CONFIRMED
  scenario    -> A tracked executable has a content hunk plus a mode change; `git diff` includes `old mode`/`new mode`, but `parse()` drops those headers, then `git checkout --` resets the mode, so the commit and restored worktree lose the executable-bit change.
  why missed  -> Tests cover content hunks only, while the parser explicitly retains only diff/index/file headers.

FINDING 2: Scratch identity depends on the caller’s path spelling and omits repository identity
  scripts/git-partial-worktree-commit.py:90-95, 137-140   -> scripts/git-partial-worktree-commit.py:91
  confidence  -> CONFIRMED
  scenario    -> Prep runs as `docs/file.md`, then restore runs as `.\docs\file.md` (or the same relative path in another repository); the SHA-1 names differ, so restore reports “no parked prep” and leaves foreign hunks absent from the worktree.
  why missed  -> The hash normalizes slashes but does not canonicalize the path or include the Git top-level directory.

TOTAL: 2 findings
