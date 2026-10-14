# codex-oracle review -- 2026-10-01 16:43:36 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/file-claim-guard.test.mjs, tests/hooks/helpers.mjs, scripts/test-hooks.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: New PreToolUse Write|Edit gate file-claim-guard: invariant = a file with uncommitted changes has one writing session (Claude Code + Codex sharing one working dir D:\Work and one git index). Claims live in tmpdir and stop counting when the file equals HEAD or the holder has not written it for 4h. Focus: races, false blocks that would stall real work, two writers still slipping through, fail-open behaviour, Windows path normalization.
Also verify: does this change depend on something NOT visible in this diff -- a config value, timeout, schema assumption, or upstream default defined elsewhere (runner.js ctx.sid / collectFiles, lib/codex-adapter.js patchFiles, lib/shared.js getSessionId, rules/git-shared-file-guard.js SHARED)? If it contradicts the change, report it as a finding.
Round 4. Round 3 fixed: git state computed before the lock (critical section = claim JSON only), stale-lock break by rename + token check + link-back, PostToolUseFailure releases a never-written claim, late writes after a takeover reported (PostToolUse exit 2) and the holder warned via lastBlob; CLAUDE_FILE_CLAIMS_HOLD_MS is a test-only seam. Rounds 1-2 fixed: case-insensitive/realpath keys (junction aliases), index-vs-HEAD dirtiness, NaN clocks, pending vs written clocks, baseBlob detection when PostToolUse never ran, per-file lock around every read-decide-write (sorted, stale-lock break), all-or-nothing claims for a blocked multi-file call. Rejected with evidence: hash-object positional path DOES apply autocrlf filters (pinned by a test). Declared design boundaries, do not re-report: Bash-tool writes (no file list) and payloads without any session id (fail-open, same trade-off as lib/shared.js getSessionId m7). Verify the round-2 fixes themselves: lock correctness on Windows, deadlock, a lock held while git subprocesses run, regressions.
If you cannot support a real finding after checking, say so directly and return no findings. Do not invent a weak or speculative finding just to appear useful.
- exit: 0 | elapsed: 898463ms | answer: 1904B
- files-reviewed: mcp/claude-userlevel/hooks/rules.manifest.json, scripts/test-hooks.sh, tests/hooks/helpers.mjs, mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, tests/hooks/file-claim-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A Codex edit denied by another PreToolUse rule leaves a false pending claim for 15 minutes.
  `mcp/claude-userlevel/hooks/rules.manifest.json:41` -> `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:87`
  confidence  -> CONFIRMED
  scenario    -> First Codex `apply_patch` is blocked by `git-log-injector`; no tool runs and no failure event releases the claim, so another session is blocked until `PENDING_MS` expires.
  why missed  -> `tests/hooks/file-claim-guard.test.mjs:58` ignores the PreToolUse result and writes anyway, masking this path.

FINDING 2: Pre-lock Git snapshots can let two sessions write the same file.
  `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:50` -> `mcp/claude-userlevel/hooks/lib/file-claims.js:202`
  confidence  -> CONFIRMED
  scenario    -> B snapshots the file clean, A completes Pre+write+Post, then B acquires the lock; B evaluates A’s live claim with stale `dirty=false`, takes it over, and writes without warning.
  why missed  -> The race test covers only pending claims (`tests/hooks/file-claim-guard.test.mjs:176`), not written claims whose pending clock is cleared.

FINDING 3: Failed Codex `apply_patch` results using `status:"failed"` are treated as successful writes.
  `mcp/claude-userlevel/hooks/lib/codex-adapter.js:70` -> `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:101`
  confidence  -> CONFIRMED
  scenario    -> A has dirty changes; `apply_patch` fails with `{status:"failed"}`. The adapter leaves the event as `PostToolUse`, so the guard records `touchedAt`; B is then blocked for the claim TTL although A changed nothing. The documented apply-patch output includes this status shape ([official docs](https://developers.openai.com/api/docs/guides/tools-apply-patch)).
  why missed  -> `tests/hooks/codex-adapter.test.mjs:90` covers exit codes and boolean failure flags, but not `status:"failed"`.

TOTAL: 3 findings
