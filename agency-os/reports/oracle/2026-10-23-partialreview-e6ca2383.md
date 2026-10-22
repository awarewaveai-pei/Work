# codex-oracle review -- 2026-10-23 01:06:46 +08:00

- mode: `review`
- scope: -Path scripts/ao-close.ps1, tests/ao-close-index-scope.test.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ao-close sync commit must carry only this session paths: porcelain D+?? pair for one path was overwritten in ConvertTo-StatusPathMap so a foreign staged deletion leaked into the commit; fix adds IndexStaged set and whole-index invariant Get-AoCloseLeakedIndexPaths (rename old path of an allowed new path stays allowed). Also verify: does this change depend on something NOT visible in this diff that contradicts it? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 243840ms | answer: 1795B
- files-reviewed: scripts/ao-close.ps1, tests/ao-close-index-scope.test.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The whole-index check has a race before the unscoped commit.

  file:line   -> scripts/ao-close.ps1:1202-1214 -> scripts/ao-close.ps1:1329-1332
  confidence  -> CONFIRMED
  scenario    -> AO-CLOSE finds no leak; another session runs `git add foreign.md` before line 1329; the unscoped `git commit` publishes `foreign.md`.
  why missed  -> The scan is treated as an invariant, but the shared index remains mutable until commit.

FINDING 2: Own renames with substantial content changes are misclassified and partially reset.

  file:line   -> scripts/ao-close.ps1:541-550
  confidence  -> CONFIRMED
  scenario    -> This session runs `git mv old.md new.md` and replaces nearly all content; `-M` reports `D old.md` + `A new.md`, so `old.md` is returned as leaked and reset. The commit keeps `old.md` and adds `new.md` instead of recording the rename.
  why missed  -> The regression test covers only an unchanged `B.md` → `C.md` rename (`tests/ao-close-index-scope.test.ps1:44-53`), which remains `R100`.

FINDING 3: Tracker identity can diverge between the hook and AO-CLOSE, causing own staged paths to be unstaged.

  file:line   -> mcp/claude-userlevel/hooks/lib/shared.js:37-48 -> scripts/verify-sid-shared.ps1:11-18,31-40 -> scripts/ao-close.ps1:1202-1210
  confidence  -> PLAUSIBLE
  scenario    -> The hook receives stdin session ID `S1` while `CLAUDE_CODE_SESSION_ID` is stale `S2`; the hook records the staged path under `claude-git-staged-S1.txt`, AO-CLOSE reads `S2`, treats the own path as leaked, and resets it before commit.
  why missed  -> The new cleanup assumes the JavaScript hook and PowerShell helper resolve the same SID, but the source explicitly gives them different priorities and documents that PowerShell cannot read stdin’s session ID.

TOTAL: 3 findings
