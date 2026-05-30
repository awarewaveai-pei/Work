# `reports/weekly/` — RETIRED 2026-05-30

This report stream is **no longer produced**. The `weekly-automation-*.md` files here are a
frozen historical archive (last generated 2026-05-11).

## Why it was retired

The reports were produced by a **machine-local Windows Task Scheduler job**
(`AgencyOS-WeeklyAutomation`, Monday 09:10) registered on a single desktop via
`scripts/register-weekly-automation-task.ps1`. It had:

- **no cross-machine guarantee** — the laptop never had the task; only the desktop did;
- **no freshness watchdog** — `system-health-check.ps1` only checked that the script *file*
  existed, never that a report had been produced recently.

Result: when the desktop was not running at the scheduled minute, the stream silently stopped
for 19 days (2026-05-11 → 2026-05-30) with health still reporting 100%.

## Where the work went

| Former job | New home |
|------------|----------|
| `weekly-system-review` (build gates + integrated status) | Already covered: `npm run validate` on every PR/push CI, and `ao-close.ps1` regenerates the integrated status report each close-out. Manual: `scripts/verify-build-gates.ps1`. |
| `workflows-security-audit` | GitHub Actions weekly cron: [`.github/workflows/weekly-workflows-security-audit.yml`](../../../.github/workflows/weekly-workflows-security-audit.yml) (Mon 01:30 UTC = 09:30 TPE). High/critical → auto-opens a `weekly-security-audit` issue. Report artifact + `agency-os/reports/security/workflows-npm-audit-LATEST.md`. |

## One-time cleanup on the desktop

The stale scheduled task may still be registered on the desktop. Run there once:

```powershell
Unregister-ScheduledTask -TaskName 'AgencyOS-WeeklyAutomation' -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'AgencyOS-WeeklySystemReview' -Confirm:$false -ErrorAction SilentlyContinue
```

Full context: [`agency-os/docs/operations/weekly-automation-framework.md`](../../docs/operations/weekly-automation-framework.md).
