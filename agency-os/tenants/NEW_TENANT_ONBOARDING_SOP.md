# New Tenant Onboarding SOP

## 目的
- 用固定流程建立新客戶公司（tenant），確保資料隔離、權限安全、可立即開案

## 命名規範
- 公司資料夾：`company-<slug>`
- 站點資料夾：`<brand-or-domain-slug>`
- 專案資料夾：`<YYYY-NNN>-<project-slug>`

## Step 1：建立公司骨架
1. 複製 `tenants/templates/tenant-template/`
2. 重新命名為 `tenants/company-<slug>/`
3. 確認以下檔案存在：
   - `PROFILE.md`
   - `SERVICE_CATALOG.md`
   - `SITES_INDEX.md`
   - `FINANCIAL_LEDGER.md`
   - `ACCESS_REGISTER.md`
   - `01_COMMANDER_SYSTEM_GUIDE.md`
   - `02_CLIENT_WORKSPACE_GUIDE.md`
   - `03_TOOLS_CONFIGURATION_GUIDE.md`
   - `04_OPERATIONS_AUTOMATION_GUIDE.md`
4. 從 `tenants/templates/core/` 複製以下必填控制文件到 `tenants/company-<slug>/core/`：
   - `ENVIRONMENT_REGISTRY.md`
   - `RELEASE_GATES_CHECKLIST.md`
   - `BACKUP_RESTORE_PROOF.md`
   - `DEPARTMENT_COVERAGE_MATRIX.md`（企業多部門時勾列；SMB 可標 `N/A`）
   - `DEPARTMENT_CLUSTER_CATALOG.md`（**選型參考**；與客戶對齊要啟用哪些能力模組）
   - `DEPARTMENT_SELECTION.example.json` → 複製為同目錄 **`DEPARTMENT_SELECTION.json`**，依約填 **`selected_cluster_ids`**／`excluded_explicit`；**日後擴部門**時只改此檔 + 本矩陣 Notes + 主檔
   - `CROSS_BORDER_GOVERNANCE.md`（跨國／多法人／強合規時填；純本地 SMB 可最小填）
5. 依產業複製 Overlay 到 `tenants/company-<slug>/industry/`：
   - 旅遊業：`tenants/templates/industry/travel/*`
   - 療癒/治療服務：`tenants/templates/industry/therapy/*`

## Step 2：填寫公司主檔
1. 更新 `PROFILE.md`：公司名稱、窗口、狀態、合作起始日
2. 更新 `SERVICE_CATALOG.md`：已購服務與不含項目
3. 更新 `SITES_INDEX.md`：至少新增 1 個站點規劃，補上 staging/prod URL 與備份日期欄位
4. 初始化 `FINANCIAL_LEDGER.md`：付款節點與條件
5. 初始化 `ACCESS_REGISTER.md`：補齊 MFA、Secret Location、Rotation Due、Approver、Audit Evidence
6. 建立 `OPERATIONS_SCHEDULE.json` 與 `OPS_QUEUE.json`（含 owner/retry/timeout/evidence_output）
7. 填寫 1-4 使用指南，對齊該客戶的角色、流程、工具與排程
8. 填寫 `core/ENVIRONMENT_REGISTRY.md`（staging/prod 必填）
9. 預先建立 `core/RELEASE_GATES_CHECKLIST.md` 與 `core/BACKUP_RESTORE_PROOF.md` 第一版
10. 依規模填寫 `core/DEPARTMENT_CLUSTER_CATALOG.md`（與客戶過選型）、`core/DEPARTMENT_SELECTION.json`、`core/DEPARTMENT_COVERAGE_MATRIX.md`、`core/CROSS_BORDER_GOVERNANCE.md`（與 `PROFILE`／`FINANCIAL_LEDGER` 幣別欄位對齊）；**未採購**的模組在矩陣 **Notes** 寫 `N/A — …`，並在 `DEPARTMENT_SELECTION.json` 的 `excluded_explicit` 或 `planned_future` 留痕

## Step 3：建立第一個站點
1. 於 `tenants/company-<slug>/sites/` 建立 `<site-slug>/`
2. 從 `tenants/templates/site-template/` 複製：
   - `SITE_PROFILE.md`
   - `SYSTEM_REQUIREMENTS.md`
   - `OPS_GROWTH_PLAN.md`
3. 在 `SITES_INDEX.md` 記錄 site 名稱、類型、階段、Owner

## Step 4：建立第一個專案
1. 建立 `tenants/company-<slug>/projects/<YYYY-NNN>-<project-slug>/`
2. 建立或複製以下文件：
   - `00_PROJECT_BRIEF.md`
   - `01_SCOPE_AND_CR.md`
   - `02_EXECUTION_PLAN.md`
   - `03_HANDOVER_CRITERIA.md`
   - `10_DISCOVERY.md`
3. 填入初版目標、角色、里程碑日期

## Step 5：權限與安全
1. 依 `docs/operations/tools-and-integrations.md` 確認所需整合與環境變數名稱
2. 憑證管理遵守 `docs/operations/security-secrets-policy.md`
3. 每客戶獨立憑證、最小權限、可輪替
4. 如發現明文外洩，立即依事件流程處理

## Step 6：營運同步
1. 在 `TASKS.md` 新增該客戶導入任務
2. 在 `WORKLOG.md` 記錄 tenant 建立完成
3. 在 `memory/daily/YYYY-MM-DD.md` 記錄當日導入脈絡
4. 若為重大里程碑，更新 `memory/CONVERSATION_MEMORY.md`
5. 註冊自動排程：
   - `powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_TENANT_TASKS.ps1 -TenantSlug <company-slug>`
6. 跑系統健康檢查：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1`

## Step 7：WordPress Factory（Lobster）銜接 — A10-2 前置

當該客戶將使用 **龍蝦工廠**（staging manifest、`create-wp-site` / `apply-manifest`）時，在專案內補齊並留證據：

1. **固定營運劇本**（本機可驗證順序 + 證據欄）：[`../../lobster-factory/docs/e2e/OPERABLE_E2E_PLAYBOOK.md`](../../lobster-factory/docs/e2e/OPERABLE_E2E_PLAYBOOK.md)
2. **Payload 與 UUID 約定**：[`../../lobster-factory/docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`](../../lobster-factory/docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md)（測試用固定 UUID；**真客戶**請改為實際 tenant／環境 id，並寫入 `ACCESS_REGISTER` / 專案 `02_EXECUTION_PLAN`）
3. **Artifacts**：本機 `LOCAL_ARTIFACTS_SINK` 或雲端 `remote_put` + [`PRESIGN_BROKER_MINIMAL`](../../lobster-factory/docs/operations/PRESIGN_BROKER_MINIMAL.md)；留存原則見 [`ARTIFACTS_LIFECYCLE_POLICY`](../../lobster-factory/docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md)
4. **A10-2 完成定義**：生產 Trigger（或約定之執行環境）跑通一輪 + `agency-os/reports/e2e/` drill 報告已填證據 + `WORKLOG`／`memory` 有 run id／分支／commit
5. **Run ID 對照規格**：`docs/operations/ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md`（workflow run、package run、logs_ref、commit 必須對齊）
6. **預檢與證據骨架**（建議先跑）：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\preflight-onboarding-a10-2-readiness.ps1`
   - `powershell -ExecutionPolicy Bypass -File .\scripts\init-onboarding-a10-2-evidence-skeleton.ps1 -TenantSlug <company-slug> -ProjectSlug <YYYY-NNN-project-slug>`

## 完成檢查清單（Go/No-Go）
- [ ] 公司骨架與核心檔案（含 1-4 使用指南）齊備
- [ ] 至少 1 個 site 建立完成且可維護
- [ ] 第 1 個專案已開立並有 Discovery 初版
- [ ] 權限與憑證已分離且可輪替
- [ ] `core/ENVIRONMENT_REGISTRY.md` 已填妥 staging/prod、備份、回滾責任人
- [ ] `core/RELEASE_GATES_CHECKLIST.md` 已建立首版（含 GO/NO-GO 欄位）
- [ ] `core/BACKUP_RESTORE_PROOF.md` 已建立首版（至少有備份紀錄）
- [ ] `core/DEPARTMENT_COVERAGE_MATRIX.md` 已備置（企業客戶勾列；SMB 可註記 `N/A`）
- [ ] `core/CROSS_BORDER_GOVERNANCE.md` 已備置（跨境／外包／外部審閱索引；無則最小填）
- [ ] 已套用至少 1 組產業 Overlay（`industry/*`）並完成必填 QA 場景
- [ ] 任務板、工作日誌、記憶文件已同步
- [ ] 每日/每週/每月/不定時任務排程已啟用
- [ ] 最新健康檢查分數 **100%**（與本 repo `AO-CLOSE`／`AGENTS.md` 預設一致）
- [ ] （若使用 Lobster）已依 Step 7 對齊 `OPERABLE_E2E_PLAYBOOK`，並記錄預計／實際執行證據路徑

## Related Documents (Auto-Synced)
- `docs/operations/tenant-scheduling.md`
- `README.md`
- `TASKS.md`
- `tenants/company-p1-pilot/01_COMMANDER_SYSTEM_GUIDE.md`
- `tenants/company-p1-pilot/02_CLIENT_WORKSPACE_GUIDE.md`
- `tenants/company-p1-pilot/03_TOOLS_CONFIGURATION_GUIDE.md`
- `tenants/company-p1-pilot/04_OPERATIONS_AUTOMATION_GUIDE.md`
- `tenants/README.md`
- `tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md`
- `tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md`
- `tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md`
- `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md`
- `WORKLOG.md`

_Last synced: 2026-04-02 06:26:32 UTC_

