# Automation (this machine)

## Purpose
- Windows Task Scheduler registrars for the system's own jobs on this laptop. Per-client routine work does NOT live here (tenant automation retired 2026-10-14, see `docs/operations/tenant-scheduling.md`).

## Files
- `automation/REGISTER_SYSTEM_GUARD_TASKS.ps1`: registers the nightly system guard (`AgencyOS-SystemGuard-Daily`)
- `automation/REGISTER_AUTOPILOT_PHASE1_TASKS.ps1`: autopilot registrar (startup / 10-min alert / optional logoff closeout; not registered on this laptop)
- `automation/claude-routines/`: SSOT for Anthropic cloud Claude routines (different scheduling primitive — see subdir README for rubric)
- Monthly review registrar: `../scripts/register-monthly-system-review-task.ps1`

## Output
- Guard logs: `reports/guard/`; launcher transcripts: `%LOCALAPPDATA%\AgencyOS\scheduled-logs\`

## Related Documents (Auto-Synced)
- `docs/operations/tenant-scheduling.md`
- `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md`

_Last synced: 2026-10-17 07:05:49 UTC_

