# Production Runbook - New Site Build (Scenery Travel Mongolia)

> 類型：新客戶從零建站（目前僅 IG）  
> 目標：以 production-ready 標準建立 staging -> production 路徑，首版可安全上線。  
> 狀態：Execution Ready（可直接照單執行）

## 0) Go/No-Go 原則

- **No-Go**：未完成 staging 驗證、未有備份路徑、未定義回滾，不可上 production。
- **Go**：staging 全 gate 通過 + 上線窗口確定 + 回滾演練完成。

## 1) Day 1：新客戶啟動

- [ ] 建立 tenant/site/project 骨架
- [ ] 補 `10_DISCOVERY.md`（國際客群、語系、時區、付款/法遵）
- [ ] 設定商務目標與第一版 KPI（詢問、預約、轉換）

## 2) Day 2：建立雲端 Staging 基底

- [ ] 建立 staging 網址（可公開測試但需保護）
- [ ] 安裝 WP + 必要外掛基線
- [ ] 設定語系策略（至少 EN + 目標語系計畫）
- [ ] 設定時區、郵件、基礎 SEO、分析碼策略

### 驗收
- [ ] 可登入後台
- [ ] 首頁/關鍵頁可正常渲染
- [ ] 內容上傳與發布流程可用

## 3) Day 3：內容與轉換路徑驗證

- [ ] 建立最小可上線頁（首頁、行程頁、聯絡/詢問頁、隱私條款）
- [ ] 設定 CTA/詢問表單路徑
- [ ] 驗證跨國訪客基礎體驗（語系切換、時區、聯絡方式）

## 4) Day 4：Pre-Production Gate

- [ ] 備份 Gate：staging DB + uploads 備份可回復
- [ ] 功能 Gate：關鍵路徑 smoke test 通過
- [ ] 相容 Gate：主題/外掛/版本相容
- [ ] 安全 Gate：管理權限、密碼政策、必要安全設定
- [ ] 法遵 Gate：基本隱私與聯絡資訊聲明
- [ ] 回滾 Gate：首版部署回滾步驟已演練

## 5) Day 5：Production 首次上線

- [ ] 先做上線前備份
- [ ] 在維護窗執行首次上線
- [ ] 上線後 24-48 小時監看

### 上線後必驗
- [ ] 首頁可達
- [ ] 表單可送出
- [ ] 重要頁面無 404/500
- [ ] 行動裝置體驗可接受

## 6) AO-CLOSE 回報模板（本案）

- 今日環境：`staging` / `production`
- 今日進度：`build / validate / deploy`
- 備份證據：`已建立/未建立（原因）`
- 回滾點：`可用/不可用`
- 上線判定：`可上線/不可上線`

## Related

- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
