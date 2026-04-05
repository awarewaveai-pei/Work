# Tenant Automation

## Purpose
- Run daily/weekly/monthly/adhoc tasks per tenant automatically.
- Keep operations simple, precise, and repeatable.

## Files
- `automation/TENANT_AUTOMATION_RUNNER.ps1`: executes tenant tasks
- `automation/REGISTER_TENANT_TASKS.ps1`: creates/removes Windows Scheduled Tasks
- `automation/ENQUEUE_TENANT_TASK.ps1`: enqueue irregular (adhoc) tasks
- `automation/REGISTER_SYSTEM_GUARD_TASKS.ps1`: register global guard tasks
- `tenants/<tenant>/OPERATIONS_SCHEDULE.json`: tenant task plan
- `tenants/<tenant>/OPS_QUEUE.json`: adhoc queue

## Quick Start
1. Copy schedule templates into a tenant folder.
2. Edit `OPERATIONS_SCHEDULE.json` for that tenant.
3. Register schedule:
   - `powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_TENANT_TASKS.ps1 -TenantSlug company-a`
4. For irregular tasks:
   - `powershell -ExecutionPolicy Bypass -File .\automation\ENQUEUE_TENANT_TASK.ps1 -TenantSlug company-a -Title "Hotfix deploy" -Command "powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect"`

## Output
- Run logs: `reports/automation/<tenant>/`
- Guard logs: `reports/guard/`

## Related Documents (Auto-Synced)
- `docs/operations/tenant-scheduling.md`
- `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md`

_Last synced: 2026-04-01 02:31:21 UTC_

