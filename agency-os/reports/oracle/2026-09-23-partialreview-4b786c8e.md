# codex-oracle review -- 2026-09-23 22:43:24 +08:00

- mode: `review`
- scope: -Path scripts/git-partial-worktree-commit.py, scripts/git-stage-hunks.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: New helper scripts/git-partial-worktree-commit.py: commit only YOUR hunks of a file shared with concurrent sessions (WORKLOG.md, TASKS.md) while every commit gate still fires. prep: saves the full uncommitted diff of the file (all.patch), splits hunks into mine (by old-line range or body regex) and foreign, git checkout -- file, git apply --unidiff-zero mine.patch; the operator then runs a literal git add + git commit -F msg -- <pathspec> (a pathspec commit takes worktree content, and the scope guard exempts a git-verified pathspec); restore: git apply --unidiff-zero foreign.patch. Reuses HUNK regex and rewrite_hunk_header from scripts/git-stage-hunks.py via importlib. Please attack: data-loss paths (checkout -- file when prep fails half-way, restore failing, a hunk classified wrong, CRLF files, BOM at line 1, a hunk that both matches the regex and belongs to someone else), hunk header re-anchoring for insertion hunks, Windows path handling of the scratch dir, and whether all.patch really lets the operator recover everything.
- exit: 0 | elapsed: 107921ms | answer: 2008B
- files-reviewed: scripts/git-partial-worktree-commit.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Hunk headers are not re-anchored after excluding earlier foreign hunks  
  `scripts/git-partial-worktree-commit.py:61` -> `scripts/git-partial-worktree-commit.py:89`  
  confidence  -> CONFIRMED  
  scenario    -> A foreign insertion precedes the operator’s edit. The original diff’s later hunk header includes the insertion’s line shift, but `build()` only adjusts for previously selected hunks. `git apply` then applies the mine/foreign patch at the wrong line or fails, leaving the worktree incomplete.  
  why missed  -> `delta` appears to handle re-anchoring, but it tracks only selected hunks and not omitted hunks.

FINDING 2: Existing staged changes can be committed as part of the operator’s change  
  `scripts/git-partial-worktree-commit.py:80` -> `scripts/git-partial-worktree-commit.py:100`  
  confidence  -> CONFIRMED  
  scenario    -> The file contains a foreign hunk already staged plus the operator’s unstaged hunk. `git diff` saves only the unstaged hunk; `git checkout -- file` restores the worktree from the index, retaining the staged foreign hunk. The instructed `git add` and pathspec commit then commit both hunks.  
  why missed  -> The implementation assumes `git checkout -- file` restores `HEAD`, but it restores the index version.

FINDING 3: Scratch files collide for different paths with the same basename  
  `scripts/git-partial-worktree-commit.py:68` -> `scripts/git-partial-worktree-commit.py:71`  
  confidence  -> CONFIRMED  
  scenario    -> Two sessions run `prep` for `docs/TASKS.md` and `archive/TASKS.md`. Both write `TASKS.all.patch`, `TASKS.mine.patch`, and `TASKS.foreign.patch` in the same scratch directory. Restoring the first file can use the second file’s patch, causing restore failure or applying the wrong changes; the first recovery copy has already been overwritten.  
  why missed  -> Scratch identity is based only on `os.path.basename(path)`, without repository or relative-path disambiguation.

Final line: TOTAL: 3 findings
