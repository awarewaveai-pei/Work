---
name: check-drift
description: Run the deploy drift checker against production and report what differs from the repo.
---

Run the deploy drift checker against ks-aw-01 production and report.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-deploy-drift.ps1
```

Optional flags (pass after `/check-drift`):
- `-AppCodeOnly` — count only commits that touch next-admin/nginx/docker-compose (ignores governance/tooling commits; default in health check and AO-CLOSE)
- `-SkipFetch` — use cached `origin/main` instead of fetching
- `-Strict` — treat any drift as FAIL (exit 2) instead of WARN (exit 1); use this in CI
- `-Json` — emit JSON instead of human-readable

After running, summarize:
- Status: PASS / WARN / FAIL / ERROR
- `behind` count and what specific commits are missing on production (run `git log --oneline <deployedCommit>..origin/main` to enumerate)
- Whether any of those missing commits affect `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/` (excluding `docker-compose.yml` itself — see next bullet) — if yes, recommend `/sg-deploy next-admin`
- Whether any missing commits touch `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml` — if yes, **`/sg-deploy` will NOT apply them**: that file is machine-local on the server (2026-09-20 finding), and the fix is `scripts/safe-infra-patch.sh compose <file> <service>`, run manually on the server. `composeVarDrift` in this check's own output (non-null when the two files declare different env-var names) is the direct, independent signal for this — check it even when `behind` is 0.
- Whether any missing commits are in `lobster-factory/packages/workflows/` — if yes, that's a Trigger.dev EU deploy, separate flow (see `lobster-factory/infra/trigger/README.md`)

Owner doc: `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` §2.2.

Risk tier: **Low** (read-only SSH probe). No confirmation needed.
