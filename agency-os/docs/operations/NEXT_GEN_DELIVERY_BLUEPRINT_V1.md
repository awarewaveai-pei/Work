# Next-Gen 升級藍圖 v1（跨機零重工）

> 目標：把目前可用流程升級成「更高階、可規模化」版本。  
> 對象：你（營運者）、AI 代理、工程協作者。  
> 成功定義：你在桌機/筆電/新機都能無痛續接，且每位客戶都可穩定 staging -> production。

> **對齊說明（避免矛盾）**：本檔是 Next-Gen 升級藍圖；若涉及「Next.js 控制台 v1 功能範圍與 DoD」，以 `docs/operations/NEXTJS_INTERNAL_OPS_CONSOLE_V1.md` 為正本。  
> 流程主權仍以 `MCP_TOOL_ROUTING_SPEC.md` 為準（Trigger durable owner / n8n glue）。

## 0) 執行摘要（你先看這段）

- 現況可用，但仍有手工判斷與個案差異。
- v1 升級方向：**環境標準化 + 自動 gate + 自動回報 + 回滾證據化**。
- 交付節奏：**3 個里程碑，2-4 週可落地**（不一次爆改）。

## 1) v1 架構原則（不可妥協）

1. **Cloud Staging 為跨機真相**（桌機/筆電都操作同一雲端站）。
2. **Production 僅受控變更**（先過 gate 再 promote）。
3. **Local WP 為可選快測層**（非真相，故障可重建）。
4. **流程證據化**（每次變更可追溯到備份、驗證、回滾點）。

## 1.1 與「20 部門跨國企業」目標的對齊

- 本藍圖 **不是縮小目標**，而是把大目標拆成可落地節奏。
- `20 部門`屬於企業級模板與營運能力目標，在本藍圖內對應：
  - **M1**：先把每客戶的環境與交付流程標準化（先止血重工）
  - **M2**：把放行/回滾自動化，形成跨部門可稽核流程
  - **M3**：控制台化後，再擴展到 20 部門模板與責任矩陣
- 判斷原則：若沒有 M1/M2 的穩定底座，直接擴 20 部門只會放大重工與風險。

## 2) 三里程碑（M1 -> M3）

## M1：全客戶環境標準化（Week 1）

### 目標
- 每個客戶都明確標記 `staging` 與 `production`。
- 新案與舊案都套同一份交付模式。

### 交付物
- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`（已建立，作為主 SOP）
- 客戶層級環境台帳模板（新增到 tenants templates）
- 「此客戶是否有 staging」檢查欄位（可機器判斷）
- 產業 Overlay 套件（首批：travel、therapy）

### 建議檔案改動
- `tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `agency-os/TASKS.md`（加入 M1 驗收點）
- `tenants/templates/industry/travel/*`
- `tenants/templates/industry/therapy/*`

### 驗收標準（DoD）
- 100% 活躍客戶都有 `staging/prod` 標記。
- AO-RESUME 回覆可指出當前客戶主操作環境（staging/local）。
- 首批產業 Overlay（travel、therapy）已可直接套用到新 tenant。

---

## M2：部署與回滾自動化（Week 2-3）

### 目標
- 讓變更從「靠人腦記」變成「靠 gate 放行」。
- AO-CLOSE 可自動顯示當日 WP 變更風險與回滾狀態。

### 交付物
- 新增腳本（建議）：
  - `scripts/wp-change-preflight.ps1`：檢查目標環境、備份可用性、版本相容。
  - `scripts/wp-change-postcheck.ps1`：驗證核心路徑（登入/首頁/關鍵流程）。
  - `scripts/wp-backup-proof.ps1`：輸出備份證據（時間戳、檔名、位置、摘要）。
- AO-CLOSE 報告新增欄位：
  - `WP 本機執行：有/無/不確定`
  - `雲端 staging 變更：有/無`
  - `回滾點：已建立/未建立（原因）`

### 建議檔案改動
- `scripts/ao-close.ps1`
- `agency-os/docs/operations/end-of-day-checklist.md`
- `CLAUDE.md` + `agency-os/AGENTS.md`（同步收工治理；只加必要的軟提醒，不加硬阻擋）

### 驗收標準（DoD）
- 任一 production 變更都有對應備份證據與 postcheck。
- AO-CLOSE 不需你手動判斷是否碰過 WP 流程。

---

## M3：營運控制台化（Week 3-4）✅ 2026-05-13 完成

### 目標
- 你不用翻多份文件就能決策。
- 以紅黃綠顯示客戶風險、最近備份、最近部署結果。
- **M3 擴充（Next-Gen 對齊）**：控制台輸出映射到「20 部門」責任矩陣，避免試點與跨國企業目標脫鉤。

### 已交付（2026-05-13）
- ~~`scripts/generate-customer-delivery-status.ps1` → `reports/status/customer-delivery-status-LATEST.md`~~ — 已刪（2026-10-14）：沒有任何程式讀這份報告，控制台客戶頁的部門覆蓋面板讀同一份 Supabase 資料（`ops/clients/[slug]` DepartmentCoveragePanel）
- `GET /api/ops/clients/:slug/department-summary` — 機器可讀部門摘要 API（回傳 tier / byGroup / matrixRows）
- `DepartmentCoveragePanel` — 客戶詳情頁 20 部門覆蓋率面板（按 group 分組、進度條、必填模板清單）
- `ClientCard` — 列表頁顯示 `X/20 部門` badge（綠≥8，黃<8，無設定黃警示）
- `organizations.metadata.client_config.department_selection: ClusterId[]` — 無 migration JSONB 擴充
- `DEPARTMENT_COVERAGE_MATRIX.md`（templates + 3 tenant 副本）— 均已更新含 M3 設定說明與建議 JSON

### 驗收標準（DoD）✅
- 你能在 3 分鐘內回答：
  - 哪些客戶本週可安全上線？（ClientCard 健康 badge + WP 更新數）
  - 哪些客戶沒有可用回滾點？（Workflow runs + Release Gates）
  - 哪些客戶 staging/prod 漂移？（`verify-tenant-staging-sites-index-ssot.ps1`）
  - **哪些客戶已啟用幾個企業部門、屬於哪個 tier？**（`DepartmentCoveragePanel` + `/department-summary`）

## 3) 風險與對策（先寫死，避免反覆討論）

- **風險：只改流程不改習慣，落不了地**  
  對策：AO-RESUME/AO-CLOSE 輸出欄位強制帶出關鍵狀態（可軟提醒）。

- **風險：所有客戶一次改，造成壓力過大**  
  對策：先選 2 個客戶試點（1 既有站接手 + 1 新站建置）再擴展。

- **風險：本機與雲端混用造成誤判**  
  對策：每日回報固定顯示「今日主路徑：staging/local」。

## 4) 你只要做的決策（其他我可代辦）

1. 指定 2 個試點客戶（既有站 1、新站 1）。
2. 同意 M1 -> M2 -> M3 節奏（不跳步）。
3. 同意 AO-CLOSE 增加「WP 變更狀態」軟欄位。

## 5) 建議啟動順序（本週）

- Day 1：鎖定試點客戶 + 補齊環境台帳
- Day 2：落地 M1 文件/模板
- Day 3：新增 M2 preflight/postcheck 腳本骨架
- Day 4：串 AO-CLOSE 狀態欄位
- Day 5：跑一次完整演練（staging -> production 模擬）

## 6) 本輪已指定試點客戶（2026-04-01；狀態補記 **2026-05-07**）

### 既有站接手：Soulful Expression Art Therapy
- **客戶名稱**：Soulful Expression Art Therapy
- **類型**：既有網站代操（Production 已運行）
- **地理/營運**：台灣辦公，規劃跨國組織
- ~~**Canonical staging URL（repo／ENVIRONMENT_REGISTRY）**：**https://staging.soulfulexpression.org/** — **2026-05-07**：書面台帳與 lifecycle=`provision_pending` 已登記；**雲端實機**仍須操作者依 Pilot A Runbook §2 建立並驗收。~~ ⛔ **作廢（2026-08-16）**：Hostinger staging 決策已取消；Soulful 已於 2026-08-28 切換至 `ks-aw-01`。現行主線以 `tenants/company-soulful-expression/core/ENVIRONMENT_REGISTRY.md`、`SITE_MIGRATION_RUNBOOK.md` 為準。
- **M1 首要動作**：
  1. 建立/確認雲端 `staging`（若 Hostinger 有 staging 功能優先使用）
  2. 盤點 production 版本與外掛，建立 baseline 台帳
  3. 寫入 tenant 環境欄位（staging/prod、備份策略、維護窗）

### 新站從零：Scenery Travel Mongolia
- **客戶名稱**：Scenery Travel Mongolia
- **類型**：新客戶（目前僅 IG，尚無正式站）
- **地理/營運**：公司與團隊在蒙古，客群國際化
- **Canonical staging URL（repo／提案）**：**https://staging.scenery-travel.mn/** — 網域／主機商拍板後若調整須同步改 registry／SITE_PROFILE；**2026-05-07**：書面已登記；**雲端實機**待 Pilot B Runbook §2。
- **M1 首要動作**：
  1. 建立 tenant/site/project 骨架 ✅（骨架已完成）
  2. 建立雲端 `staging` 站（多語與時區需求先納入） 🟡 書面就緒，實機待建立
  3. 補 Discovery：國際客群、語系、付款/法遵、旅遊季節波動

### 試點成功判定（M1）
- [ ] Soulful Expression **書面** staging／prod 台帳齊備（✅ **staging canonical URL 已入 ENVIRONMENT_REGISTRY**）；**baseline（WP／外掛）**仍待 Day 1 盤點；**staging 實機可用**仍待 Runbook §2
- [ ] Scenery Travel Mongolia tenant 啟動 ✅；**staging 實機可用**仍待 Runbook §2；Discovery 國際欄位仍待客戶訪談
- [ ] AO-RESUME 可直接回報兩案「今日主路徑」（staging/local）（仍部分依賴本機／隊列敘述）

### 上線級 Runbook（已建立）
- `docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md`
- `docs/operations/PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md`
- **索引對齊**：各試點 `SITES_INDEX.md`、會寫入 HTTPS 之 `sites/*/SITE_PROFILE.md`（**Staging URL** 行）須與 `core/ENVIRONMENT_REGISTRY.md` 一致；§2 具「Repo 對齊」摘錄（**2026-05-07**）。閘道：`scripts/verify-tenant-staging-sites-index-ssot.ps1`。

## Related

- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- `docs/operations/MARIADB_MULTI_MACHINE_SYNC.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `docs/operations/end-of-day-checklist.md`
- `docs/overview/EXECUTION_DASHBOARD.md`

## Related Documents (Auto-Synced)
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`

_Last synced: 2026-10-25 21:42:01 UTC_

