# codex-oracle review -- 2026-10-01 15:29:36 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/file-claim-guard.test.mjs, tests/hooks/helpers.mjs, scripts/test-hooks.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: New PreToolUse Write|Edit gate file-claim-guard: invariant = a file with uncommitted changes has one writing session (Claude Code + Codex sharing one working dir D:\Work and one git index). Claims live in tmpdir and stop counting when the file equals HEAD or the holder has not written it for 4h. Focus: races, false blocks that would stall real work, two writers still slipping through, fail-open behaviour, Windows path normalization.
Also verify: does this change depend on something NOT visible in this diff -- a config value, timeout, schema assumption, or upstream default defined elsewhere (runner.js ctx.sid / collectFiles, lib/codex-adapter.js patchFiles, lib/shared.js getSessionId, rules/git-shared-file-guard.js SHARED)? If it contradicts the change, report it as a finding.
If you cannot support a real finding after checking, say so directly and return no findings. Do not invent a weak or speculative finding just to appear useful.
- exit: 0 | elapsed: 555728ms | answer: 2806B
- files-reviewed: mcp/claude-userlevel/hooks/rules.manifest.json, scripts/test-hooks.sh, tests/hooks/helpers.mjs, mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, tests/hooks/file-claim-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Stale or clean claim takeover is not serialized, allowing two writers to win simultaneously.
  file-claim-guard.js:61,65-72 -> file-claims.js:98-100
  confidence  -> CONFIRMED
  scenario    -> Existing claim is stale; sessions B and C concurrently read it, both overwrite non-exclusively, then both edit the file.
  why missed  -> Exclusive creation protects only the no-claim path; takeover uses unconditional replacement.

FINDING 2: A blocked multi-file edit leaves pending claims on files it never writes.
  file-claim-guard.js:55-63,81 -> runner.js:278-294; file-claims.js:110-113
  confidence  -> CONFIRMED
  scenario    -> A targets free `a.txt` then foreign-owned `b.txt`; A claims `a.txt`, is blocked on `b.txt`, and C is falsely blocked on `a.txt` for 15 minutes.
  why missed  -> Pending expiry handles the case, but does not undo claims created before block aggregation.

FINDING 3: Bash-based writes bypass the one-writer invariant entirely.
  file-claim-guard.js:8 -> rules.manifest.json:11-21,38-42
  confidence  -> CONFIRMED
  scenario    -> A edits `a.txt` with `python`/`Set-Content`; B edits it through Write/Edit; A edits it again through Bash, with no claim conflict.
  why missed  -> The missing Bash file list was treated as an explicit limitation despite the invariant being stated for files generally.

FINDING 4: A missing or failed PostToolUse turns an actually dirty file into an available takeover after 15 minutes.
  file-claims.js:110-113 -> file-claim-guard.js:85-89; rules.manifest.json:97-109
  confidence  -> PLAUSIBLE
  scenario    -> A’s PreToolUse succeeds and the write changes the file, but PostToolUse is skipped or fails; after `PENDING_MS`, B sees `touchedAt: null`, takes over, and both edits mix.
  why missed  -> Pending expiry assumes no PostToolUse means no write, while Write/Edit has no PostToolUseFailure cleanup.

FINDING 5: Windows junction/symlink aliases produce different claim keys for the same file.
  file-claims.js:32-38 -> file-claim-guard.js:42-47
  confidence  -> CONFIRMED
  scenario    -> `D:\Work\alias\a.txt` is a junction to `D:\Work\src\a.txt`; sessions use the two paths, producing separate claims and allowing concurrent edits.
  why missed  -> Normalization lowercases and changes slashes but never resolves filesystem aliases.

FINDING 6: Missing session identifiers silently disable the guard.
  file-claim-guard.js:20-22,96-98 -> shared.js:55-72
  confidence  -> PLAUSIBLE
  scenario    -> Two sessions omit `session_id` and both environment IDs; `getSessionId` falls back to the shared cwd hash, `realSid` returns null, and both edits proceed unclaimed.
  why missed  -> Avoiding the non-unique fallback prevents false ownership but leaves no enforcement path if the upstream schema is missing IDs.

TOTAL: 6 findings
