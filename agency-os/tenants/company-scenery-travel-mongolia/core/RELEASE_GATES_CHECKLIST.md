# Release Gates Checklist — Scenery Travel Mongolia

> 任一 production 變更前使用；staging 為預設驗證環境（見 `ENVIRONMENT_REGISTRY.md`）。  
> 首次上線使用「Day 4: Pre-Production Gate」完整版；後續維運使用縮版。

## Context

- Tenant: Scenery Travel Mongolia
- Site: scenery-travel-mn（production）
- Release ID:
- Target environment: staging -> production
- Change owner:
- Planned window:

## Pre-Deployment Gates (must be PASS)

- [ ] **Backup Gate**: fresh DB + uploads backup exists and is restorable.
- [ ] **Security Gate**: admin access, MFA policy, secret handling verified.
- [ ] **Compatibility Gate**: WP/theme/plugins version compatibility confirmed.
- [ ] **Function Gate**: key user flows pass on staging（首頁、詢問表單、關鍵頁）.
- [ ] **Legal Gate**: 隱私政策、取消/退款政策、聯絡資訊頁面存在且可達.
- [ ] **Rollback Gate**: rollback steps tested or validated with evidence.
- [ ] **International Gate**: 國際 Email / 聯絡方式可用；日期/時區顯示無歧義.

## Deployment Decision

- Decision: GO / NO-GO
- Approver:
- Timestamp:
- Reason:

## Post-Deployment Checks

- [ ] Homepage available
- [ ] Admin login works
- [ ] Inquiry form submittable（測試 email 接收）
- [ ] Mobile experience acceptable
- [ ] Error logs show no critical spikes

## Evidence Links

- Backup proof: `core/BACKUP_RESTORE_PROOF.md`
- Industry QA: `industry/travel/MANDATORY_QA_SCENARIOS.md`
- Preflight result:
- Postcheck result:
- Rollback procedure:
