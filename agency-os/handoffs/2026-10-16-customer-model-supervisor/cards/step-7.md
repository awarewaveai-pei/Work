# 第 7 項：轉售（代理商版；等第一個轉售客戶）

**風險** Medium　**模型** Opus 5.5　**前置** 第 5 項　**正本** ADR 017 順序 7（`max_tenants` 數根組織）

## Decision
- 授權檔 `max_tenants`＝客戶根組織數（`organizations.parent_organization_id is null and kind = 'customer'`；`internal` 不算，Codex M17）。一家公司或一個集團（含子公司、分公司、部門）＝1，不另收；代理商替多家不相干客戶代操 ＝ >1，另訂價，隔離責任在客戶主機，合約寫明。
- 安裝內建立根組織的唯一入口（`lib/organizations/create-root.ts`）先數現有根組織，≥ `max_tenants` 拒絕 `{"code":"max_tenants"}`。
- 我方替買斷客戶代操不算租戶數（維運加購，產品決定 Q6）。

## Files
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/licence.ts`（讀 `max_tenants`）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/organizations/create-root.ts`、`__tests__/create-root.test.ts`
- `scripts/issue-licence.mjs`（`--max-tenants`）

## Acceptance
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/organizations lib/entitlements
```
→ 綠；測試名含 `the second customer root organisation is refused under max_tenants=1`、`a child organisation never counts`、`an internal organisation never counts`（M18：本項才驗 max_tenants）。
突變：拔掉根組織計數 → 指名測試紅；還原綠。

## Rollback
`git revert`；授權檔欄位預設 1，舊授權檔無此欄視為 1。
