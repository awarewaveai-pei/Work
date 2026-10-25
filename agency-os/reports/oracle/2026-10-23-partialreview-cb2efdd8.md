# codex-oracle review -- 2026-10-23 14:42:21 +08:00

- mode: `review`
- scope: -Path scripts/lib/process-deadline.ps1, scripts/lib/ssh-deadline.ps1, scripts/check-mcp-runtime.ps1, scripts/ao-resume.ps1, scripts/system-health-check.ps1, scripts/lib/smoke-status-digest.ps1, tests/smoke-status-digest.test.ps1, scripts/check-vps-auto-reboot-health.ps1, scripts/check-backup-health.ps1, scripts/check-capacity-health.ps1, scripts/check-clickhouse-health.ps1, scripts/check-site-watch-health.ps1, scripts/check-staging-orphans.ps1, scripts/check-ci-health.ps1, scripts/check-smoke-tests.ps1, scripts/lib/post-commit-doc-check.ps1, scripts/refresh-cf-origin-ips.ps1, scripts/command-plane-smoke.ps1, scripts/ops-console-smoke.ps1, scripts/detector-contract-legacy.txt  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Detector contract Phase 2 + MCP detector rewrite. (1) Every status writer now emits via Write-DetectorArtifact (overall, integer measured = what this run actually measured, ISO generated_utc; measured=0 never PASS), keeping every existing JSON field for readers (smoke-status-digest.ps1, ao-resume.ps1). (2) check-mcp-runtime.ps1 now reads claude mcp list per governed server instead of desktop main.log init_mcp totals (which counted claude.ai connectors and unauthorised plugins). (3) process-deadline.ps1: generic native-process hard deadline with tree kill; ssh-deadline.ps1 now a thin wrapper. (4) ao-resume monthly: cf_ip_refresh verdict from cf-iprefresh-LATEST.json overall (script always exits 0). (5) digest auto-reboot reads ISO generated_utc (contract) and the obsolete unzoned parser is deleted. (6) auto-reboot no longer crashes on a failed probe. Report only real defects: a run that measured nothing reported as healthy, a reader broken by the shape change, a deadline that does not hold.
- exit: 0 | elapsed: 359799ms | answer: 1000B
- files-reviewed: scripts/ao-resume.ps1, scripts/check-backup-health.ps1, scripts/check-capacity-health.ps1, scripts/check-ci-health.ps1, scripts/check-clickhouse-health.ps1, scripts/check-mcp-runtime.ps1, scripts/check-site-watch-health.ps1, scripts/check-smoke-tests.ps1, scripts/check-staging-orphans.ps1, scripts/check-vps-auto-reboot-health.ps1, scripts/command-plane-smoke.ps1, scripts/detector-contract-legacy.txt, scripts/lib/post-commit-doc-check.ps1, scripts/lib/smoke-status-digest.ps1, scripts/lib/ssh-deadline.ps1, scripts/ops-console-smoke.ps1, scripts/refresh-cf-origin-ips.ps1, scripts/system-health-check.ps1, tests/smoke-status-digest.test.ps1, scripts/lib/process-deadline.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: CI reports PASS when every workflow has no concluded run
  scripts/check-ci-health.ps1:280,344-347 -> scripts/lib/smoke-status-digest.ps1:184-205
  confidence  -> CONFIRMED
  scenario    -> All workflows are `none` or `pending` -> producer writes `measured=0`, top-level `overall=UNKNOWN`, but preserves `verdictLabel=PASS`; digest reads `verdictLabel` and reports CI PASS.
  why missed  -> The producer contract was updated, but the reader still trusts the legacy verdict field.

FINDING 2: Monthly Cloudflare refresh still has no hard deadline
  scripts/refresh-cf-origin-ips.ps1:44-45 -> scripts/ao-resume.ps1:984-989
  confidence  -> CONFIRMED
  scenario    -> SSH completes handshake, then the remote refresh hangs -> `Start-Process -Wait` blocks AO-RESUME indefinitely; `ConnectTimeout=30` does not bound the established session.
  why missed  -> The new deadline helper was applied to `ssh-deadline.ps1` and MCP, but this separate raw SSH path remained unchanged.

TOTAL: 2 findings
