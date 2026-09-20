---
name: wp-maintenance
description: WordPress client maintenance: backup status, MainWP sync review, update planning, and backup-gated safe updates.
argument-hint: [status|backup-status <client>|update-plan|maintain]
---

Run WordPress maintenance status, backup checks, update planning, or a backup-gated safe update workflow.

## Usage

```
/wp-maintenance status
/wp-maintenance backup-status <client>
/wp-maintenance update-plan <client>
/wp-maintenance mainwp-sync
/wp-maintenance storage-audit
/wp-maintenance safe-update <client> <wave1|wave2|wave3>
```

## Dispatch

For anything beyond a trivial file lookup, use the `wordpress-maintenance-agent`.

The agent must read:

1. `agency-os/docs/operations/MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md`
2. `agency-os/docs/operations/WP_MANAGED_UPDATES.md`
3. `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` §10

## Rules

- Default to read-only status when the request is ambiguous.
- Never print or request credentials, passwords, tokens, app passwords, or SSH private keys.
- Do not run production plugin/theme/core updates without recent backup proof and matching backup scope.
- DB-only backup does not satisfy file-changing plugin/theme/core update safety unless a separate file rollback path exists and the risk is explicitly accepted.
- Treat `/wp_safe_update` as an approval-gated future Telegram command, not as a live direct-update path.

## Expected Output

For status/planning:

```
Client:
Health:
MainWP:
WPvivid:
Update plan:
Blocks:
Next action:
```

For safe update:

```
Client:
Requested wave:
Backup gate:
Execution path:
Changes:
Post-check:
Evidence:
```

## Post safe-update: automatic client verification

After a **successful** `safe-update`, **always** run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 `
  -Mode client -ClientSlug <slug> -SkipInstall
```

This checks: homepage 200, no PHP errors, no broken JS, wp-admin accessible,
and captures full-page + mobile screenshots as update evidence.
Evidence is archived to `agency-os/reports/e2e/YYYY-MM-DD/client/`.

## Owner Doc

`agency-os/docs/operations/MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md`
