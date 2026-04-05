# Release Gates Checklist — P1 Pilot

## Context

- Tenant: P1 Pilot Tenant
- Site: pilot-main
- Release ID:
- Target environment: staging -> production（production **N/A** for drill）
- Change owner: Agency OS Operator
- Planned window:

## Pre-Deployment Gates (must be PASS)

- [ ] **Backup Gate**: fresh DB + uploads backup exists and is restorable（若 drill 無 DB 則註記 N/A + 原因）
- [ ] **Security Gate**: admin access, MFA，secrets 依 `security-secrets-policy`
- [ ] **Compatibility Gate**: WP/theme/plugins（若適用）
- [ ] **Function Gate**: key flows on staging
- [ ] **Rollback Gate**: rollback steps or evidence

## Deployment Decision

- Decision: GO / NO-GO
- Approver:
- Timestamp:
- Reason:

## Post-Deployment Checks

- [ ] Primary path（依 `SYSTEM_REQUIREMENTS.md`）
- [ ] Error logs — no critical spikes

## Evidence Links

- Backup proof: `core/BACKUP_RESTORE_PROOF.md`
- Preflight/postcheck: `reports/e2e/`
