# Weekly Automation Framework

This framework is the single place for all weekly automated jobs.

## Canonical files

- Config: `scripts/weekly-automation-config.json`
- Runner: `scripts/run-weekly-automation.ps1`
- Scheduler registration: `scripts/register-weekly-automation-task.ps1`

## Reports

- Folder: `agency-os/reports/weekly/`
- Latest: `agency-os/reports/weekly/weekly-automation-LATEST.md`
- Historical: `agency-os/reports/weekly/weekly-automation-YYYYMMDD-HHMMSS.md`

## Current default weekly jobs

1. `weekly-system-review`
   - Runs `scripts/weekly-system-review.ps1`
   - Produces integrated status and gate checks.
2. `workflows-security-audit`
   - Runs `npm run audit:workflows-security` in `lobster-factory/`
   - Produces security report in `agency-os/reports/security/`.

## Add or remove weekly jobs

Edit only `scripts/weekly-automation-config.json`:

- `enabled: true/false` to turn jobs on/off.
- remove object to delete a weekly job.
- add object to extend weekly automation.

Supported job types:

- `powershellFile`
- `process`

## Register/update scheduler (once per machine)

From monorepo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-weekly-automation-task.ps1 -DisableLegacyTask
```

This will register `AgencyOS-WeeklyAutomation` and disable old `AgencyOS-WeeklySystemReview`.

## Run once manually (smoke test)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-weekly-automation.ps1
```

## Conflict-avoidance rules

- Keep all weekly jobs in one config file.
- Keep one scheduled task only (`AgencyOS-WeeklyAutomation`).
- Add reports only under `agency-os/reports/weekly/`.
