# Next-Gen 升級藍圖 v1（雲端優先、跨機零重工）

> 目標：把目前可用流程升級成「更高階、可規模化」版本。  
> 對象：你（營運者）、AI 代理、工程協作者。  
> 成功定義：你在桌機/筆電/新機都能無痛續接，且每位客戶都可穩定 staging -> production。

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
- `.cursor/rules/40-shutdown-closeout.mdc`（只加軟提醒，不加硬阻擋）

### 驗收標準（DoD）
- 任一 production 變更都有對應備份證據與 postcheck。
- AO-CLOSE 不需你手動判斷是否碰過 WP 流程。

---

## M3：營運控制台化（Week 3-4）

### 目標
- 你不用翻多份文件就能決策。
- 以紅黃綠顯示客戶風險、最近備份、最近部署結果。

### 交付物
- 客戶狀態彙整（可先 markdown，後續升級成可視化）
- 最小控制台檔案（建議）：
  - `reports/status/customer-delivery-status-LATEST.md`
  - 每日自動生成腳本：`scripts/generate-customer-delivery-status.ps1`

### 建議檔案改動
- `agency-os/docs/overview/EXECUTION_DASHBOARD.md`（新增入口與判讀）
- `agency-os/README.md`（首頁入口）
- `scripts/generate-integrated-status-report.ps1`（串接新狀態檔）

### 驗收標準（DoD）
- 你能在 3 分鐘內回答：
  - 哪些客戶本週可安全上線？
  - 哪些客戶沒有可用回滾點？
  - 哪些客戶 staging/prod 漂移？

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

## 6) 本輪已指定試點客戶（2026-04-01）

### 既有站接手：Soulful Expression Art Therapy
- **客戶名稱**：Soulful Expression Art Therapy
- **類型**：既有網站代操（Production 已運行）
- **地理/營運**：台灣辦公，規劃跨國組織
- **M1 首要動作**：
  1. 建立/確認雲端 `staging`（若 Hostinger 有 staging 功能優先使用）
  2. 盤點 production 版本與外掛，建立 baseline 台帳
  3. 寫入 tenant 環境欄位（staging/prod、備份策略、維護窗）

### 新站從零：Scenery Travel Mongolia
- **客戶名稱**：Scenery Travel Mongolia
- **類型**：新客戶（目前僅 IG，尚無正式站）
- **地理/營運**：公司與團隊在蒙古，客群國際化
- **M1 首要動作**：
  1. 建立 tenant/site/project 骨架
  2. 建立雲端 `staging` 站（多語與時區需求先納入）
  3. 補 Discovery：國際客群、語系、付款/法遵、旅遊季節波動

### 試點成功判定（M1）
- [ ] Soulful Expression 完成 staging/prod 台帳與 baseline
- [ ] Scenery Travel Mongolia 完成 tenant 啟動與 staging 可用
- [ ] AO-RESUME 可直接回報兩案「今日主路徑」（staging/local）

### 上線級 Runbook（已建立）
- `docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md`
- `docs/operations/PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md`

## Related

- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- `docs/operations/MARIADB_MULTI_MACHINE_SYNC.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `docs/operations/end-of-day-checklist.md`
- `docs/overview/EXECUTION_DASHBOARD.md`

_Last synced: 2026-04-01_

## Related Documents (Auto-Synced)
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`

_Last synced: 2026-04-09 09:29:25 UTC_

