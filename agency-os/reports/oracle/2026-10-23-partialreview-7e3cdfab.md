# codex-oracle review -- 2026-10-23 01:15:31 +08:00

- mode: `review`
- scope: -Path scripts/ao-close.ps1, tests/ao-close-index-scope.test.ps1, mcp/claude-userlevel/hooks/rules/git-add-scope-tracker.js  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2. AO-CLOSE sync and skeleton commits must carry only this session paths. Round-1 findings: F1 race between index check and bare git commit -> now Invoke-AoCloseScopedCommit commits from a private index built from HEAD plus only allowed paths copied from the shared index; F2 own rename with rewritten content -> git-add-scope-tracker records both sides via --no-renames; F3 SID divergence resetting own staged paths -> excluded paths are no longer reset, only left staged and listed. Porcelain D+?? pair parse fixed via IndexStaged. Also verify: does this change depend on something NOT visible in this diff that contradicts it? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 223422ms | answer: 1139B
- files-reviewed: mcp/claude-userlevel/hooks/rules/git-add-scope-tracker.js, scripts/ao-close.ps1, tests/ao-close-index-scope.test.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The private commit can convert a concurrent unstage into an unintended deletion.
  file:line   -> scripts/ao-close.ps1:572 -> scripts/ao-close.ps1:592
  confidence  -> CONFIRMED
  scenario    -> AO-CLOSE computes `foo.md` as allowed; another session unstages it; `ls-files` returns no entry, so `--force-remove` removes `foo.md` from the private index and the commit deletes it from HEAD.
  why missed  -> The private index is rebuilt later, but a missing entry is treated as a staged deletion rather than validated against the earlier scope snapshot.

FINDING 2: Staged deletions whose names contain glob syntax can remove the wrong path.
  file:line   -> scripts/ao-close.ps1:592
  confidence  -> CONFIRMED
  scenario    -> HEAD contains `a[b].txt` and `ab.txt`; AO-CLOSE stages deletion of `a[b].txt`; `git update-index --force-remove -- a[b].txt` interprets `[b]` as a pathspec and removes `ab.txt` from the private index instead.
  why missed  -> The preceding `ls-files` call uses `--literal-pathspecs`, but the corresponding `update-index` call does not; the regression test uses only simple filenames.

TOTAL: 2 findings
