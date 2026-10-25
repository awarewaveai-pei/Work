# codex-oracle review -- 2026-10-23 12:53:55 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1, scripts/bootstrap-local-wordpress-windows.ps1, scripts/check-claude-sync.ps1, scripts/check-smoke-tests.ps1, scripts/codex-continue.ps1, scripts/commit-checkpoint.ps1, scripts/fetch-external-signals.ps1, scripts/git-align-main-aoresume-feature.ps1, scripts/git-prune-merged-local-branches.ps1, scripts/lib/post-commit-doc-check.ps1, scripts/lobster-trigger-deploy.ps1, scripts/scan-local-config-for-secrets.ps1, scripts/sync-endpoint-alert-heartbeat.ps1, scripts/sync-grafana-alerting-slack.ps1, scripts/sync-observability-grafana-content.ps1, scripts/sync-pagerduty-endpoint-alert.ps1, scripts/sync-slack-alert-webhooks.ps1, scripts/test-git-safe-ops-matrix.ps1, scripts/test-post-commit-doc-check.ps1, scripts/test/scan-local-config-for-secrets.Tests.ps1, scripts/verify-aoresume-archive.ps1, scripts/verify-head-typecheck.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Governance batch B: CP950 trap closure -- every native-command capture site (git/ssh/docker) in these PS 5.1 scripts wrapped in Invoke-WithUtf8Console (scripts/_console-encoding-helpers.ps1) so UTF-8 output is not decoded as CP950. Review ONLY semantic preservation: LASTEXITCODE after the call, 2>&1 / 2>$null, stdin piped into native commands, array vs string results, StrictMode side effects of dot-sourcing the helper, $_ scope inside the scriptblock.
- exit: 0 | elapsed: 847853ms | answer: 679B
- files-reviewed: mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1, scripts/bootstrap-local-wordpress-windows.ps1, scripts/check-claude-sync.ps1, scripts/check-smoke-tests.ps1, scripts/codex-continue.ps1, scripts/commit-checkpoint.ps1, scripts/fetch-external-signals.ps1, scripts/git-align-main-aoresume-feature.ps1, scripts/git-prune-merged-local-branches.ps1, scripts/lib/post-commit-doc-check.ps1, scripts/lobster-trigger-deploy.ps1, scripts/scan-local-config-for-secrets.ps1, scripts/sync-endpoint-alert-heartbeat.ps1, scripts/sync-grafana-alerting-slack.ps1, scripts/sync-observability-grafana-content.ps1, scripts/sync-pagerduty-endpoint-alert.ps1, scripts/sync-slack-alert-webhooks.ps1, scripts/test-git-safe-ops-matrix.ps1, scripts/test-post-commit-doc-check.ps1, scripts/test/scan-local-config-for-secrets.Tests.ps1, scripts/verify-aoresume-archive.ps1, scripts/verify-head-typecheck.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `check-smoke-tests.ps1` depends on an untracked SSH helper omitted from the reviewed diff
  scripts/check-smoke-tests.ps1:73 -> scripts/lib/ssh-deadline.ps1:27
  confidence  -> CONFIRMED
  scenario    -> A commit contains the modified `check-smoke-tests.ps1` but not untracked `scripts/lib/ssh-deadline.ps1`; line 74 skips loading it, line 174 throws, and Check 2b records `skip:exception` at lines 192–194. Client mail independently degrades to `skip:no_ssh_helper` at lines 387–391.
  why missed  -> `git diff` omits untracked files, while the conditional load makes the dependency appear optional even though Check 2b calls it unconditionally.

TOTAL: 1 finding
