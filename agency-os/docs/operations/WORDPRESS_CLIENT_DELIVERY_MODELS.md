# WordPress 客戶交付雙模式 SOP（既有站接手 + 新站從零）

> 目的：用一份可執行 SOP，統一你兩種業務模式，避免每案重想流程。  
> 讀者：營運者（可不懂技術細節），AI 代理，工程協作者。  
> 原則：**雲端 Staging 優先**、**Production 受控變更**、**跨機同一真相**。

## 1) 一句話版本（先記這個）

- **新客戶從零建站**：先建 Staging，再上 Production。
- **既有網站代操（如 Hostinger）**：先補 Staging 副本，再改 Production。
- **桌機/筆電/新機同步**：都操作同一個雲端 Staging（不是同步本機 MariaDB）。

## 2) 名詞定義（避免溝通歧義）

- **Production**：對外服務中的真實站點（客戶正在使用）。
- **Staging**：雲端測試站，結構盡量貼近 Production，用於先測後上線。
- **Local WP（可選）**：本機 WordPress + MariaDB，用於快測與故障演練，不是跨機真相。
- **SoR（System of Record）**：
  - 平台營運資料：Supabase（Postgres）
  - WordPress 內容真相：該客戶對應的雲端 WP（staging/prod）

## 3) 兩種客戶模式與決策樹

### 3.1 模式 A：既有站接手（客戶已有網站在跑）

適用：你提到的 Hostinger 既有個站、任何正在營運中的客戶站。

流程：
1. 盤點 Production（版本、外掛、主題、備份、流量時間窗）
2. 建/補 Staging（與 Production 相同主要版本）
3. 所有變更先在 Staging 驗證
4. 通過 gate 後，在維護窗套用到 Production
5. 上線後觀測 + 回滾窗監看

### 3.2 模式 B：新客戶從零建站（AO + 龍蝦）

適用：新租戶、新專案、新站點。

流程：
1. 建立 Staging 環境與基底（WP + DB + 基本安全）
2. 套用模板/manifest（先 dry-run，再受控 execute）
3. 驗證內容、效能、權限、備份
4. 準備 Production 並做首次佈署
5. 交付後進入維運節奏

## 4) 統一的雲端優先架構（建議）

每個客戶固定三層：

1. **Cloud Staging WP（主要操作層）**
2. **Cloud Production WP（對外服務層）**
3. **Optional Local WP（本機快測層，可丟棄）**

資料一致策略：
- 日常跨機協作看 Staging/Production，不看本機。
- 本機資料只在必要時 dump/import，不做「檔案層硬拷」。

## 5) 標準放行 Gate（Staging -> Production）

任何上 Production 的變更，至少通過下列 Gate：

1. **備份 Gate**：有當日可還原備份（DB + uploads）
2. **功能 Gate**：關鍵流程 smoke test（登入、核心頁、表單/購物流程）
3. **相容 Gate**：WP/外掛/主題版本相容，無致命錯誤
4. **安全 Gate**：管理帳號、權限、機密配置正確
5. **可回滾 Gate**：回滾步驟已演練或已確認可執行

## 6) 既有站接手（模式 A）詳細清單

### 6.1 交接日（Day 0）必做

- 收到並驗證：
  - 網域/DNS 管理權限
  - 主機與資料庫管理權限
  - WP 管理員（最小必要權限）
  - 備份機制現況與最近可還原點
- 盤點輸出：
  - WP 版本、PHP 版本、主題、外掛清單
  - 客製程式碼位置（theme/mu-plugin/plugin）
  - 排程任務（cron）與第三方整合

### 6.2 建立 Staging（最小要求）

- URL：使用 staging 子網域（如 `staging.client-domain.com`）
- 內容來源：由 Production 複製
- 訪問控制：至少密碼保護/白名單
- 外部服務保護：避免寄真實信、避免污染正式分析

### 6.3 正式接手後 7 日內

- 完成第一輪健康修補：
  - 更新可安全更新的外掛/主題
  - 補齊備份與還原演練
  - 建立重大變更 SOP 與維護窗
- 產出：
  - 客戶交接摘要
  - 風險清單（高/中/低）
  - 下階段優先級（P1/P2/P3）

## 7) 新站從零（模式 B）詳細清單

### 7.1 啟動

- 建立 tenant/site/project 基本資料
- 建立 Staging 站與資料庫
- 設定版本基線（WP/PHP/主要外掛）

### 7.2 建置

- 先 dry-run（不改動）確認計畫
- 再 execute（受控）套用變更
- 逐步驗證，每步可回退

### 7.3 上線前

- 跑完整 gate（第 5 節）
- 驗證 DNS / SSL / 快取
- 準備 rollback 路徑

### 7.4 上線後 48 小時

- 監看錯誤與性能
- 驗證訂單/表單/轉換事件
- 固定時段回報客戶

## 8) 你最在意的：跨機「同步」怎麼不重工

### 8.1 每日操作規則（桌機與筆電都一樣）

1. `git pull --ff-only origin main`
2. 以雲端 Staging 做當日變更（主路徑）
3. `AO-CLOSE` 時記錄今天是否觸及 WP 變更與備份狀態

### 8.2 什麼不該做

- 不要把本機 MariaDB data folder 當同步工具
- 不要在 Production 直接試驗未驗證變更
- 不要用聊天或文件保存實際 token/密碼

### 8.3 本機資料真的要帶去另一台時

- 用 dump/import（DB）+ uploads 同步（檔案）
- 完成後仍以雲端 Staging 為主，不把本機升級成真相

## 9) AO-RESUME / AO-CLOSE 行為準則（給代理）

### 9.1 AO-RESUME

- 先對齊 Git
- 若雙機對齊未完成，提醒執行工作站 §1.5 / §1.5.1
- 明確回覆當日主路徑：`Cloud Staging` 或 `Local Quick Test`

### 9.2 AO-CLOSE

- 不強制 MariaDB 成為硬 gate
- 但需回報 WP 操作狀態（有/無/不確定）
- 若有高風險變更，附備份/回滾狀態

## 10) 你可以直接照抄的「最小工作節奏」

### 新客戶（從零）
- Day 1：建 Staging + 基線安裝
- Day 2：dry-run + execute + 驗證
- Day 3：上線準備 + 回滾演練
- Day 4：Production 上線 + 觀測

### 舊客戶（接手）
- Day 1：盤點 + 權限交接 + 建 staging
- Day 2：修補高風險 + 測試
- Day 3：受控維護窗變更 + 觀測

## 11) 例外情境處理

- **只有 Production、沒有 Staging**：暫停大改，先建立 Staging。
- **客戶拒絕 Staging 成本**：書面確認風險；變更縮小並保留回滾窗。
- **緊急修復（高影響事故）**：可先修 Production，但必須補回 Staging 對齊。

## 12) 成功判定（Definition of Done）

做到以下才算「真正不重工」：

1. 每個客戶都有明確環境分層（至少 Prod + Staging）
2. 跨機工作不依賴本機 DB 搬運
3. 上線前後都有可驗證的 gate 與回滾
4. AO-RESUME/AO-CLOSE 的回報可讓非技術決策者看懂

## Related

- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `docs/operations/MARIADB_MULTI_MACHINE_SYNC.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/end-of-day-checklist.md`
- `../lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md`

_Last synced: 2026-04-01_
