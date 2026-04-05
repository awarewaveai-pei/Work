# Release Gates Checklist — Soulful Expression Art Therapy

> 任一 production 變更前使用；staging 為預設驗證環境（見 `ENVIRONMENT_REGISTRY.md`）。

## Context

- Tenant: Soulful Expression Art Therapy
- Site: soulfulexpression.org（production）；staging **待建**
- Release ID:
- Target environment: staging -> production
- Change owner:
- Planned window:

## Pre-Deployment Gates (must be PASS)

- [ ] **Backup Gate**: fresh DB + uploads backup exists and is restorable.
- [ ] **Security Gate**: admin access, MFA policy, secret handling verified.
- [ ] **Compatibility Gate**: WP/theme/plugins version compatibility confirmed.
- [ ] **Function Gate**: key user flows pass on staging.
- [ ] **Rollback Gate**: rollback steps tested or validated with evidence.

## Deployment Decision

- Decision: GO / NO-GO
- Approver:
- Timestamp:
- Reason:

## Post-Deployment Checks

- [ ] Homepage available
- [ ] Admin login works
- [ ] Primary conversion path works（聯絡／預約 — 依實際站點定義）
- [ ] Error logs show no critical spikes

## Evidence Links

- Backup proof: `core/BACKUP_RESTORE_PROOF.md`
- Preflight result:
- Postcheck result:
- Rollback procedure:
