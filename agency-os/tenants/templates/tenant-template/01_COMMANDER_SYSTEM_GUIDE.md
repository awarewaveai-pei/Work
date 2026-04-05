# Commander System Guide

## 目的
- 給 Agency owner（總司令）用來掌控此客戶公司的全貌、風險與一鍵操作。

## 你每天看什麼（5-10 分鐘）
1. `PROFILE.md`：客戶狀態與商業重點
2. `SITES_INDEX.md`：各站點目前階段
3. `FINANCIAL_LEDGER.md`：收款、毛利、逾期
4. `ACCESS_REGISTER.md`：權限盤點是否過期
5. `LAST_SYSTEM_STATUS.md`：系統 PASS/FAIL

## 你每週要做什麼
- 檢查 `projects/*/02_EXECUTION_PLAN.md` 是否落後
- 檢查 `SERVICE_CATALOG.md` 是否有超範圍需求
- 針對高風險客戶執行風險降級動作（CR、排程、資源）

## 你可一鍵做的事
- 重新註冊此客戶自動排程：
  - `powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_TENANT_TASKS.ps1 -TenantSlug <company-slug>`
- 手動執行每日任務：
  - `powershell -ExecutionPolicy Bypass -File .\automation\TENANT_AUTOMATION_RUNNER.ps1 -TenantSlug <company-slug> -Frequency daily`
- 全局守護檢查：
  - `powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`

## 決策邊界
- 超範圍需求：走 `docs/operations/scope-change-policy.md`
- 憑證事件：走 `docs/operations/security-secrets-policy.md`
- 事故事件：走 `docs/operations/incident-response-runbook.md`

## Related Documents (Auto-Synced)
- `docs/overview/agency-os-complete-system-introduction.md`
- `README.md`
- `tenants/company-p1-pilot/01_COMMANDER_SYSTEM_GUIDE.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `tenants/README.md`

_Last synced: 2026-04-02 06:26:32 UTC_

