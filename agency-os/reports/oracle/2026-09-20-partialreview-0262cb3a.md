# codex-oracle review -- 2026-09-20 11:58:46 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks, mcp/codex-userlevel/scripts, scripts/claude-oracle.ps1, scripts/_agent-host.ps1, tests/hooks/codex-adapter.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Codex governance parity round 2 (deploy-hook matcher covers Codex shell aliases; documented that a live deploy lock cannot be stolen). Verify the whole change for defects.
- exit: 0 | elapsed: 122241ms | answer: 1856B
- files-reviewed: mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1, mcp/claude-userlevel/hooks/rules.manifest.json, mcp/claude-userlevel/hooks/rules/dangerous-bash.js, mcp/claude-userlevel/hooks/runner.js, mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1, mcp/codex-userlevel/scripts/sync-claude-to-codex.ps1, mcp/claude-userlevel/hooks/lib/codex-adapter.js, mcp/claude-userlevel/hooks/lib/codex-heartbeat.js, mcp/claude-userlevel/hooks/rules/permission-deny-mirror.js, mcp/codex-userlevel/scripts/codex-bridge-lib.ps1, scripts/_agent-host.ps1, scripts/claude-oracle.ps1, tests/hooks/codex-adapter.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: First-run deployment detection never recognizes a fresh push
  file:mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1:92   -> `reflog show --date=unix --format='%gd|%gs'`
  confidence  -> CONFIRMED
  scenario    -> The marker is absent and a workflow commit is freshly pushed -> `%gd` yields a reflog selector such as `origin/main@{0}`, but the code treats `0` as a Unix timestamp, fails the 300-second check, records a baseline, and silently skips deployment.
  why missed  -> The implementation appears to confuse `%gd`’s reflog selector with a timestamp; `--date=unix` does not make `%gd` the reflog entry timestamp.

FINDING 2: Lock cleanup can delete a newly acquired lock
  file:mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1:163   -> `Remove-Item -LiteralPath $lockFile -Force`
  confidence  -> CONFIRMED
  scenario    -> A deployment runs over 30 minutes, then the holder disposes the lock; another hook removes and recreates the stale lock before the holder’s `finally` executes -> the holder’s unconditional removal deletes the new lock, allowing a third hook to deploy concurrently.
  why missed  -> The live-lock protection is correct while the handle is open, but the release and deletion are separate operations with a race window.

FINDING 3: Hook trust validation can pass while the AwareWave hooks remain untrusted
  file:mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1:250   -> `Assert-Parity ($trusted.Count -ge $expectedHandlers)`
  confidence  -> CONFIRMED
  scenario    -> Codex has six untrusted AwareWave handlers and six trusted unrelated hook handlers -> the count passes, although every governance hook is silently skipped.
  why missed  -> The check counts all trusted hook keys but never verifies that the trusted keys correspond to the generated AwareWave handlers.

TOTAL: 3 findings
