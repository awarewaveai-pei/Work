# Tenant Scheduling and Automation

## Goal
- Let each company define daily/weekly/monthly tasks and run them automatically.
- Support irregular tasks through an adhoc queue.

## Configuration
- `tenants/<company>/OPERATIONS_SCHEDULE.json`
  - `scheduler.daily_time`
  - `scheduler.weekly_day`, `scheduler.weekly_time`
  - `scheduler.monthly_day`, `scheduler.monthly_time`
  - `scheduler.adhoc_interval_minutes`
- `tenants/<company>/OPS_QUEUE.json`

## Runtime
- Runner: `automation/TENANT_AUTOMATION_RUNNER.ps1`
- Register Windows tasks: `automation/REGISTER_TENANT_TASKS.ps1`
- Enqueue irregular tasks: `automation/ENQUEUE_TENANT_TASK.ps1`

## Commands
- Register:
  - `powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_TENANT_TASKS.ps1 -TenantSlug company-a`
- Run once manually:
  - `powershell -ExecutionPolicy Bypass -File .\automation\TENANT_AUTOMATION_RUNNER.ps1 -TenantSlug company-a -Frequency daily`
- Enqueue adhoc:
- `powershell -ExecutionPolicy Bypass -File .\automation\ENQUEUE_TENANT_TASK.ps1 -TenantSlug company-a -Title "Hotfix" -Command "powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect"`

## Output
- Reports: `reports/automation/<company>/run-*.md`
- JSON logs: `reports/automation/<company>/run-*.json`

## Related Documents (Auto-Synced)
- `automation/README.md`
- `docs/architecture/agency-command-center-v1.md`
- `docs/international/global-delivery-model.md`
- `README.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `tenants/README.md`
- `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md`

_Last synced: 2026-04-01 02:31:21 UTC_

