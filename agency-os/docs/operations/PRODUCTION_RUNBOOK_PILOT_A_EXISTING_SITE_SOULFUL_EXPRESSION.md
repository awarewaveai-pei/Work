# Production Runbook - Existing Site Handover (Soulful Expression Art Therapy)

> 類型：既有網站接手（Production 已運行）  
> ~~目標：在不影響現行營運前提下，建立 staging、完成首批受控變更、具備可回滾證據。~~
> ⛔ **staging 路線作廢（2026-08-16）**：Hostinger staging 不再建立；Soulful 已於 2026-08-28 切換至 `ks-aw-01`。現行主線請讀 `tenants/company-soulful-expression/core/SITE_MIGRATION_RUNBOOK.md` 與 `CUTOVER_RUNBOOK.md`。
> 狀態：Historical / superseded

## 0) Go/No-Go 原則

- **No-Go**：沒有可還原備份、無維護窗、無回滾路徑時，不可變更 production。
- **Go**：備份證據已產生 + staging 驗證通過 + 維護窗已確認。

## 1) Day 1：接手盤點（必做）

## 1.1 權限盤點（最小必要）
- [ ] Hostinger 帳號管理權限
- [ ] 網域與 DNS 管理權限
- [ ] WordPress 管理員權限（非共用帳號）
- [ ] DB 存取（或主機端備份/還原權限）

## 1.2 基線盤點（留檔）
- [ ] WP 版本
- [ ] PHP 版本
- [ ] 主題名稱 + 版本
- [ ] 外掛清單 + 版本
- [ ] 排程/cron 與第三方整合（Email、Analytics、Webhook）

## 1.3 輸出證據
- [ ] 在 `WORKLOG.md` 留「接手基線摘要」
- [ ] 在客戶台帳留「目前風險 Top 3」

## 2) Day 2：建立 Staging（必做）

> ~~**Repo 對齊（2026-05-07）**：canonical staging URL 已登記於 `tenants/company-soulful-expression/core/ENVIRONMENT_REGISTRY.md` — **`https://staging.soulfulexpression.org/`**，目前 **`lifecycle=provision_pending`**。下列為實作步驟；**驗收通過後**請於該檔將 lifecycle 改為 **`live`**，並回填 WP／PHP／備份等欄位（與 `SITES_INDEX.md` 同步）。~~ ⛔ 已作廢；以現行搬站主線為準。

- ~~[ ] 建立 staging 子網域（**應對齊 registry**：`staging.soulfulexpression.org`；若主機商限制再開 CR 修 registry／DNS）~~ ⛔ 已取消，不得在 Hostinger 建置。
- [ ] 由 production 複製內容到 staging
- [ ] 啟用存取保護（密碼/白名單）
- [ ] 關閉 staging 對正式分析/正式寄信污染

### 驗收
- [ ] 可登入 staging 後台
- [ ] 關鍵頁可開啟（首頁、關鍵內頁、表單頁）

## 3) Day 3：首批安全變更包（低風險）

只做低風險項目（先建立穩定節奏）：
- [ ] 安全性小更新（不改架構）
- [ ] 外掛小版本更新（先 staging）
- [ ] 明顯錯誤修補（文案/連結/輕量 UI）

### Gate（全部通過才可上 production）
- [ ] 備份 Gate：有當日可還原備份
- [ ] 功能 Gate：登入/首頁/核心互動正常
- [ ] 相容 Gate：無致命錯誤
- [ ] 回滾 Gate：已確認可回上一版

## 4) Day 4：Production 維護窗上線

- [ ] 先建立上線前備份（含時間戳）
- [ ] 在維護窗執行已通過的變更包
- [ ] 上線後 30-60 分鐘監看

### 上線後必驗
- [ ] 前台主要頁面
- [ ] 後台登入
- [ ] 表單/轉換路徑
- [ ] 速度與錯誤日誌無重大異常

## 5) 回滾條件（先定義再上線）

任一條件命中立即回滾：
- 關鍵頁 5xx 持續
- 付款/表單主流程失效
- 重大樣式錯亂影響轉換

## 6) AO-CLOSE 回報模板（本案）

- 今日環境：`staging` / `production`
- 今日變更：`low-risk patch bundle`（是/否）
- 備份證據：`已建立/未建立（原因）`
- 回滾點：`可用/不可用`
- 上線判定：`可上線/不可上線`

## Related

- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- `docs/operations/end-of-day-checklist.md`
