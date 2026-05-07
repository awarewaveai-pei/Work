Run the deploy drift checker against SG production and report.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-deploy-drift.ps1
```

Optional flags (pass after `/check-drift`):
- `-SkipFetch` — use cached `origin/main` instead of fetching
- `-Strict` — treat any drift as FAIL (exit 2) instead of WARN (exit 1); use this in CI
- `-Json` — emit JSON instead of human-readable

After running, summarize:
- Status: PASS / WARN / FAIL / ERROR
- `behind` count and what specific commits are missing on production (run `git log --oneline <deployedCommit>..origin/main` to enumerate)
- Whether any of those missing commits affect `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/` — if yes, recommend `/sg-deploy next-admin`
- Whether any missing commits are in `lobster-factory/packages/workflows/` — if yes, that's a Trigger.dev EU deploy, separate flow (see `lobster-factory/infra/trigger/README.md`)

Owner doc: `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` §2.2.

Risk tier: **Low** (read-only SSH probe). No confirmation needed.
