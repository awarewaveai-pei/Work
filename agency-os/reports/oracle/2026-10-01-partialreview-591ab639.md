# codex-oracle review -- 2026-10-01 15:14:21 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/file-claim-guard.test.mjs, tests/hooks/helpers.mjs, scripts/test-hooks.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: New PreToolUse Write|Edit gate file-claim-guard: invariant = a file with uncommitted changes has one writing session (Claude Code + Codex sharing one working dir D:\Work and one git index). Claims live in tmpdir and stop counting when the file equals HEAD or the holder has not written it for 4h. Focus: races, false blocks that would stall real work, two writers still slipping through, fail-open behaviour, Windows path normalization.
Also verify: does this change depend on something NOT visible in this diff -- a config value, timeout, schema assumption, or upstream default defined elsewhere (runner.js ctx.sid / collectFiles, lib/codex-adapter.js patchFiles, lib/shared.js getSessionId, rules/git-shared-file-guard.js SHARED)? If it contradicts the change, report it as a finding.
If you cannot support a real finding after checking, say so directly and return no findings. Do not invent a weak or speculative finding just to appear useful.
- exit: 0 | elapsed: 664212ms | answer: 3317B
- files-reviewed: mcp/claude-userlevel/hooks/rules.manifest.json, scripts/test-hooks.sh, tests/hooks/helpers.mjs, mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, tests/hooks/file-claim-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `isDirty` falsely marks clean CRLF worktrees as dirty  
  mcp/claude-userlevel/hooks/lib/file-claims.js:14-15,68-70 -> tests/hooks/file-claim-guard.test.mjs:20  
  confidence  -> CONFIRMED  
  scenario    -> `core.autocrlf=true`, HEAD stores LF, clean worktree contains CRLF -> A claims the file and B is falsely blocked. Git filters require `--path`, not the positional path ([git-hash-object docs](https://git-scm.com/docs/git-hash-object)).  
  why missed  -> The test fixture forces `core.autocrlf=false`.

FINDING 2: Windows case variants bypass the WORKLOG/TASKS exclusion  
  mcp/claude-userlevel/hooks/rules/file-claim-guard.js:48 -> mcp/claude-userlevel/hooks/lib/file-claims.js:29-30,58-60  
  confidence  -> CONFIRMED  
  scenario    -> Edit arrives as `agency-os\worklog.md` on Windows -> `repo.rel` is not equal to `agency-os/WORKLOG.md`, so the shared file is claimed and another session can be blocked.  
  why missed  -> Tests use only canonical casing at tests/hooks/file-claim-guard.test.mjs:106-108.

FINDING 3: Concurrent non-live claims can both pass and overwrite each other  
  mcp/claude-userlevel/hooks/rules/file-claim-guard.js:55-65 -> mcp/claude-userlevel/hooks/lib/file-claims.js:90-100  
  confidence  -> CONFIRMED  
  scenario    -> A and B preflight the same clean file concurrently; B sees A’s claim, but `isLive` is false while the file equals HEAD, then unconditionally replaces A’s claim -> both writes proceed and the last write can lose the other edit.  
  why missed  -> Tests serialize preflight, then mutate the file at tests/hooks/file-claim-guard.test.mjs:57-59.

FINDING 4: A later blocking rule leaves a live claim for a write that never happened  
  mcp/claude-userlevel/hooks/rules.manifest.json:39-47 -> mcp/claude-userlevel/hooks/runner.js:257-266, mcp/claude-userlevel/hooks/rules/git-log-injector.js:54-60  
  confidence  -> CONFIRMED  
  scenario    -> A pre-dirty file receives A’s first Edit -> file-claim-guard records A, then git-log-injector blocks the call -> A never writes, but B is blocked for up to four hours by A’s claim.  
  why missed  -> The claim is created before sibling rules run, and tests do not combine a pre-dirty file with a later-rule block.

FINDING 5: Staged-only changes are treated as clean  
  mcp/claude-userlevel/hooks/lib/file-claims.js:64-70 -> mcp/claude-userlevel/hooks/rules/file-claim-guard.js:51-55  
  confidence  -> CONFIRMED  
  scenario    -> A stages version A, restores the worktree to HEAD, then B edits and stages version B -> the guard allows B because it compares only worktree content to HEAD, so A’s staged changes are silently replaced.  
  why missed  -> Tests cover commit/release, not a differing index with a HEAD-equal worktree.

FINDING 6: Malformed `touchedAt` creates a claim that never expires  
  mcp/claude-userlevel/hooks/lib/file-claims.js:73-79 -> mcp/claude-userlevel/hooks/lib/file-claims.js:95-100  
  confidence  -> CONFIRMED  
  scenario    -> Claim JSON contains a valid `sid` but `touchedAt: "invalid"` and the file is dirty -> `Number(...)` becomes `NaN`, the TTL comparison is false, and every other session is blocked indefinitely.  
  why missed  -> The TTL test writes only a valid numeric timestamp at tests/hooks/file-claim-guard.test.mjs:87-92.

TOTAL: 6 findings
