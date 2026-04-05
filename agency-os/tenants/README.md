# Tenants v2

此目錄用於管理多家公司（tenant）與其網站/系統資產。

> **別和** 上層 `platform-templates/` 混淆：該目錄是 **Woo 堆疊／專案骨架**；本目錄下的 `templates/` 才是 **每家 `company-*` 複製用** 的租戶範本。其他 `docs/templates` 等見 [`docs/overview/repo-template-locations.md`](../docs/overview/repo-template-locations.md)。

## 結構
- `templates/`: 建立新 tenant 或新 site 時複製的範本
- `templates/core/`: 全客戶必填控制模板（環境台帳、放行 gate、備份還原證據、**多部門路由矩陣**、**跨境治理索引**）
- `templates/industry/`: 產業 Overlay（travel / therapy 等）
- `company-p1-pilot/`: 目前啟用中的公司資料夾

## 規則
- 每家公司資料、憑證、排程、報表必須隔離
- 每家公司至少維護：
  - `PROFILE.md`
  - `SERVICE_CATALOG.md`
  - `SITES_INDEX.md`
  - `FINANCIAL_LEDGER.md`
  - `ACCESS_REGISTER.md`
  - `01_COMMANDER_SYSTEM_GUIDE.md`
  - `02_CLIENT_WORKSPACE_GUIDE.md`
  - `03_TOOLS_CONFIGURATION_GUIDE.md`
  - `04_OPERATIONS_AUTOMATION_GUIDE.md`
  - `OPERATIONS_SCHEDULE.json`
  - `OPS_QUEUE.json`

## 新增公司流程
1. 複製 `templates/tenant-template/`
2. 重新命名資料夾為 `company-<slug>`
3. 複製 `templates/core/*` 到 `company-<slug>/core/` 並完成必填欄位（含 `DEPARTMENT_COVERAGE_MATRIX.md`、`CROSS_BORDER_GOVERNANCE.md`；SMB 可最小填並註記 `N/A`）
4. 依客戶產業選用 `templates/industry/<industry>/*` 到 `company-<slug>/industry/`
5. 更新 `PROFILE.md` 與 `SITES_INDEX.md`
6. 建立至少一個 `sites/<site-slug>/` 子目錄

## 建議操作
- 完整步驟請依 `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- 自動排程註冊請用 `automation/REGISTER_TENANT_TASKS.ps1`

## Related Documents (Auto-Synced)
- `docs/operations/tenant-scheduling.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md`
- `tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md`
- `tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md`
- `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md`

_Last synced: 2026-04-02 06:26:32 UTC_

