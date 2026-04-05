# Migration Checklist

## Pre-Migration
- [ ] Confirm current system status is PASS (`LAST_SYSTEM_STATUS.md`)
- [ ] Ensure `ALERT_REQUIRED.txt` does not exist
- [ ] Export/backup current workspace snapshot
- [ ] Notify stakeholders of migration window

## During Migration
- [ ] Apply release files
- [ ] Update `docs/change-impact-map.json` if new governance docs were added（步驟細項：`docs/operations/new-doc-linkage-checklist.md`）
- [ ] Update `docs/CHANGE_IMPACT_MATRIX.md` for new dependencies
- [ ] Update `README.md` and `docs/README.md` indexes
- [ ] Run document sync (`scripts/doc-sync-automation.ps1 -AutoDetect`)

## Validation
- [ ] Run health check (`scripts/system-health-check.ps1`)
- [ ] Health score >= 100%（與 AO-CLOSE / system-guard 預設一致）
- [ ] Run guard (`scripts/system-guard.ps1 -Mode manual`)
- [ ] Confirm PASS in `LAST_SYSTEM_STATUS.md`
- [ ] Confirm no `ALERT_REQUIRED.txt`

## Post-Migration
- [ ] Register/re-register scheduled tasks (tenant and guard)
- [ ] Update `TASKS.md` status
- [ ] Update `WORKLOG.md` decisions
- [ ] Update memory files for milestone traceability

## Go/No-Go
- [ ] GO only if all checks pass
- [ ] NO-GO if any critical check fails

## Related Documents (Auto-Synced)
- `docs/releases/release-notes.md`
- `docs/releases/upgrade-path.md`

_Last synced: 2026-03-30 05:16:43 UTC_

