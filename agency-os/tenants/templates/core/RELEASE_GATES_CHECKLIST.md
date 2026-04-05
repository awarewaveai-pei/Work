# Release Gates Checklist (Required)

> Use this checklist before any production deployment.

## Context

- Tenant:
- Site:
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
- [ ] **Data / multi-tenant Gate**（**僅當**本次釋出含 Supabase schema、RLS、Clerk↔租戶對照或 API 越戶風險時 **必勾**）：staging 已套用對應 migration；以 **兩個不同租戶** 身分（JWT／session）做 **讀寫不得越戶** 抽測 **PASS**；IdP JWT 之 **org claim** 與執行環境一致。詳 **ADR 006** 與 `lobster-factory/packages/db/migrations/0010_clerk_org_mapping_and_rls_expansion.sql`。

## Deployment Decision

- Decision: GO / NO-GO
- Approver:
- Timestamp:
- Reason:

## Post-Deployment Checks

- [ ] Homepage available
- [ ] Admin login works
- [ ] Primary conversion path works
- [ ] Error logs show no critical spikes

## Evidence Links

- Backup proof:
- Preflight result:
- Postcheck result:
- Rollback procedure:

## Related (monorepo / long-term)

- **30 年級紀律**（含 **§9 AI／MCP 邊界**、**§10 執行節奏**：閘道、ADR、雙機）：[`docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`](../../../docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md)。
- **備份還原證據模板**：同層 [`BACKUP_RESTORE_PROOF.md`](BACKUP_RESTORE_PROOF.md)。
- **變更牽涉 Supabase／多租戶**：對照 [`docs/architecture/decisions/006-supabase-tenant-isolation-and-clerk-mapping.md`](../../../docs/architecture/decisions/006-supabase-tenant-isolation-and-clerk-mapping.md)；合併前 monorepo 根跑 `.\scripts\verify-build-gates.ps1`。
