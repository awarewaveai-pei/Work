# codex-oracle review -- 2026-09-20 12:04:20 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks, mcp/codex-userlevel/scripts, scripts/claude-oracle.ps1, scripts/_agent-host.ps1, tests/hooks/codex-adapter.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Final state after two oracle rounds: deploy lock now uses FileOptions.DeleteOnClose (lock existence == handle ownership, no unlink-by-path), parity trust keys are attributed to the user hooks file when the key format allows, deploy-hook matcher covers Codex shell aliases.
- exit: 0 | elapsed: 186040ms | answer: 1227B
- files-reviewed: mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1, mcp/claude-userlevel/hooks/rules.manifest.json, mcp/claude-userlevel/hooks/rules/dangerous-bash.js, mcp/claude-userlevel/hooks/runner.js, mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1, mcp/codex-userlevel/scripts/sync-claude-to-codex.ps1, mcp/claude-userlevel/hooks/lib/codex-adapter.js, mcp/claude-userlevel/hooks/lib/codex-heartbeat.js, mcp/claude-userlevel/hooks/rules/permission-deny-mirror.js, mcp/codex-userlevel/scripts/codex-bridge-lib.ps1, scripts/_agent-host.ps1, scripts/claude-oracle.ps1, tests/hooks/codex-adapter.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Deploys can be silently lost after the five-round limit.

  `mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1:146` -> `mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1:197`  
  confidence  -> CONFIRMED  
  scenario    -> Six workflow-changing pushes arrive while one deploy holds the lock; the loop processes only five rounds, exits with the marker behind `origin/main`, and all concurrent hooks already exited on the lock, so the sixth push is never deployed.  
  why missed  -> The recheck loop handles ordinary concurrency, but the fixed iteration cap turns sustained concurrency into permanent marker loss.

FINDING 2: SHA-256 Git repositories are treated as having no `origin/main`.

  `mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1:104` -> `mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1:147`  
  confidence  -> PLAUSIBLE  
  scenario    -> A repository configured with `extensions.objectFormat=sha256` returns a 64-character commit ID; `Get-Sha` accepts only 40 hex characters, returns `$null`, and the hook exits without deploying.  
  why missed  -> The implementation assumes SHA-1 object IDs while Git repository format is an external dependency.

Final: TOTAL: 2 findings
