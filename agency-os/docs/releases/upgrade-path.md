# Upgrade Path

## Objective
- Provide a safe, repeatable path to upgrade Agency OS without losing consistency.

## Upgrade Levels
- Patch Upgrade (`vX.Y.Z -> vX.Y.Z+1`)
  - Bug fixes and document/script hardening.
- Minor Upgrade (`vX.Y.Z -> vX.Y+1.0`)
  - New features, no intentional breaking changes.
- Major Upgrade (`vX.Y.Z -> vX+1.0.0`)
  - Breaking changes possible; migration plan required.

## Standard Upgrade Flow
1. Read `docs/releases/release-notes.md`
2. Read `docs/releases/migration-checklist.md`
3. Backup workspace (`tenants/`, `docs/`, `reports/`, scripts)
4. Apply upgrade files
5. Run:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect`
   - `powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1`
   - `powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`
6. Review:
   - `LAST_SYSTEM_STATUS.md`
   - `ALERT_REQUIRED.txt` (must not exist)
7. Re-register scheduled tasks if scripts changed

## Rollback Rules
- If health score falls below threshold or guard reports FAIL:
  - Stop release rollout
  - Restore from backup
  - Re-run health/guard checks

## Tenant Upgrade Order
1. Templates
2. Internal governance docs
3. Low-risk tenant
4. Remaining tenants in batches

## Related Documents (Auto-Synced)
- `docs/releases/migration-checklist.md`
- `docs/releases/release-notes.md`
- `README.md`
- `scripts/system-guard.ps1`
- `scripts/system-health-check.ps1`

_Last synced: 2026-03-20 04:57:16 UTC_

