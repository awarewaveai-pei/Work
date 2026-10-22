# codex-oracle review -- 2026-10-22 14:25:40 +08:00

- mode: `review`
- scope: -Path scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: stage -- <own files>: an own file that is gone from disk but exists in HEAD is now staged with git rm --cached instead of git add, because git add refuses a path that .gitignore now covers (untracking a directory: 15 .claude/sessions/*.md deletions failed today; a worker earlier hand-edited the marker JSON to get 255 deletions through). Files still on disk keep git add, so naming an ignored file still fails rather than being force-added. Marker bookkeeping (own list, base blob) unchanged; the existing own-deletions-staged report still runs. Test: untrack via .gitignore -> deletion staged in the private index; ignored file on disk -> SystemExit. 7/7; mutation (gone_from_disk = []) -> red.
- exit: 0 | elapsed: 510509ms | answer: 1010B
- files-reviewed: scripts/git-partial-worktree-commit.py, tests/scripts/git_partial_worktree_commit_test.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Deleted tracked directories are not staged because recursive removal is omitted  
  file:line -> scripts/git-partial-worktree-commit.py:131-133, 249-254  
  confidence -> CONFIRMED  
  scenario -> `own` contains a deleted tracked directory; `head_blob()` returns its tree ID, then `git rm --cached -- <dir>` fails because `-r` is missing, so the directory deletion is not staged.  
  why missed -> The test covers only a deleted file, not a deleted directory.

FINDING 2: Re-staging an already-staged deletion aborts instead of being idempotent  
  file:line -> scripts/git-partial-worktree-commit.py:249-254  
  confidence -> CONFIRMED  
  scenario -> The same private index is reused for a second `stage` call with the same deleted path; it remains in `gone_from_disk`, but is already absent from the index, so `git rm --cached` rejects the pathspec and the command exits.  
  why missed -> The test stages the deletion only once and does not reuse that index for the same path.

TOTAL: 2 findings
