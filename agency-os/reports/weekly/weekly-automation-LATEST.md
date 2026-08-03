# Weekly Summary 2026-08-03

**期間**：2026-07-28 → 2026-08-03  
**產生時間**：2026-08-03 01:06 UTC（遠端週報代理）

---

## 本週完成事項

**本週無操作者 session（2026-07-28 – 2026-08-03）。**

這是**連續第四週無活動**。2026-07-28 至 2026-08-03 的每日筆記均為 `(fill in at AO-CLOSE)` 佔位符。操作者仍在旅行中。

### 本週唯一自動化活動

- **2026-08-01 01:00 UTC**：`remote-monthly-agent` 自動生成 2026-07 月度回顧報告
  - 輸出：`reports/monthly/monthly-review-2026-07.md` + `reports/monthly/monthly-review-LATEST.md`
  - 注：governance drift 檢查因無 PowerShell 環境跳過（WARN，RoutingSpec 約 113 天 stale）

### 上週（07-27 前）已完成事項（承接自前週報）

- ✅ 2026-07-20 遠端 session：影片 API 7 個安全/功能問題修訖（role gate × 5 + SSRF × 1 + upsert conflict × 1）
- ✅ `packages/workflows` npm audit fix（high=3→0）
- ✅ DB migration `0060_media_assets_object_key_unique.sql` 建立（**尚未 apply EU prod**）
- ✅ 自動週報 `reports/weekly/weekly-summary-2026-07-27.md` 生成（上週）
- ✅ 自動月報 `reports/monthly/monthly-review-2026-07.md` 生成（2026-08-01）

---

## 開放任務

### 🔴 緊急 / 逾期

- **【資安複盤 逾期 47 天】Defender 木馬 `Trojan:Win32/PowhidSubExec.B` 善後** — 目標日期 2026-06-17。暫存檔清理、排程任務驗證、Hook 強化均未完成。每週繼續逾期。

- **【待套用｜DB migration 0060】`media_assets.object_key` unique index** — `recordVideoAsset()` upsert 在無此 index 前靜默降級為 insert，影片歷史可能重複。需 SSH 進 EU VPS 套用：`docker exec supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < lobster-factory/packages/db/migrations/0060_media_assets_object_key_unique.sql`

### 🟠 閘控 / 等待操作者動作

- **一鍵架站 Stage 4 開閘** — 需 `HETZNER_STAGING_TOKEN`（vault 空）+ SG .env 三 flag + sg-deploy（High risk）
- **EU→Dedicated 搬機 + 退雲端**（gated 8月）：FSN i7-7700/64GB/2×512SSD ~€48.70；需操作者刷卡
- **CS U6 Chatwoot**（gated 8月）：U0–U5 軟體層已 prod live；接線等待 dedicated 主機
- **Cold Outreach Workbench T10**：Gmail per-org OAuth（High risk）；T1–T9/T11/T12 全完成
- **公司桌機**：Cloudflare vault token 修復（`cfut_` → `cfat_` + `CLOUDFLARE_ACCOUNT_ID`）+ SystemGuard 重新註冊

### 🟡 人工任務

- POD Phase 4 真實 e2e：操作者瀏覽器 session 建立真實 Woo+Printful 商品（Phases 0–3 程式全 live）
- Canvas 完整瀏覽器 e2e：Undo/Redo、genfill、Posterize、群組/解群組（程式已部署，待操作者點測）
- Postiz OAuth app：Meta IG+FB（App Review）、Reddit、LinkedIn；callback = `https://postiz.aware-wave.com/integrations/social/<slug>`
- Postiz 測試草稿清理：刪除 draft ID `cmqo1wijz0005p58ncl1mtssr`
- Postiz → 客戶 Hub 帳號連結（Bluesky soulfulexpression.bsky.social → client slug 社群頻道 tab）
- soulfulexpression.org → Cloudflare DNS 遷移（先確認 Hostinger 帳單明細 line items）
- Soulful Day 1 §1.1 帳號層級確認（需操作者登入）
- Scenery Travel Mongolia：與客戶確認素材與頂級網域

### 基礎設施

- Hetzner dispatcher 上線前準備：M10 orphan reaper + partial index（啟用 `LOBSTER_EXECUTE_*` 前必做）
- 一鍵架站 Phase 5：Hetzner 租機嵌入 app.aware-wave.com（`hosting/EMBED_PROVISION_INTO_APP.md`，`provisionClient()` 已驗證，只需加 API route）
- smoke test `04-onboard` spec：補 app session 登入步驟（或改 `x-ops-sync-key` header）
- `app.aware-wave` onboarding IA 重整（Phase 1 ops-console 退役）

### 資安 / Auto-Repair

- S2 多租戶隔離強化：`MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md` 記錄約 20 個 IDOR 問題；S1 完成，S2–S5 未套用
- Auto-Repair M2 per-source HMAC + M4 fingerprint（Batch 3 完成；Phase 2 rollout 待推）

### 內容 / 工具

- Content Engine：RSS block + 第二批積木來源；`ContentStudio.tsx:1112` 來源清單硬編碼修正
- SEO/GEO Soulful：填真實資料（EdD/定價/IG/學術引用）才能發布文章
- Image Output Pipeline：Tarot/POD 色調→WebP/CMYK PDF（Phase 1.5/2 剩餘）
- TASKS `[x]` 自動歸檔 + 重複行偵測閘（`archive-completed-tasks.ps1`，R0 方案 A 已核准但未實作）
- Mockup Studio 功能異常：server-side 已排除；卡操作者提供 F12 截圖

### wp-bridge

- `/product` dry_run 支援（`RestController:167`；bump AWBRIDGE_VERSION + release flow）
- Featured image sideload + update-existing-post + product update/delete（v0.7.0 只做 CREATE）
- wp-bridge → app.aware-wave.com Ops Dashboard + 商業化展示

---

## 系統健康

| 元件 | 狀態 | 備註 |
|------|------|------|
| SG VPS (`5.223.93.113`) | ⚠️ 未驗證 | 最後健康記錄 100%（2026-07-05）；**已 29 天無監控** |
| EU VPS (`204.168.175.41`) | ⚠️ 未驗證 | ClickHouse OOM 根治於 2026-07-05；**已 29 天無監控** |
| Supabase (EU) | ✅ 最後已知健康 | Migrations 套用至 0059；0060 待手動 apply |
| next-admin (SG) | ✅ 最後已知正常 | 599 vitest 全過；Turnstile widget 可見；/intake 可訪問 |
| Hook 系統 v2 | ✅ 已部署 | 遠端接線腳本可用（`wire-remote-hooks.sh`） |
| Auto-Repair | ✅ A1+A2+A3 | 最後已知運作中 |
| 建站流水線 | 🟡 Stage 4 閘控 | Stage 0–3 完成；n8n 橋接（Stage 2）active；Stage 4 等 token |
| 健康閘（最後收工） | ✅ 100% | 2026-07-05 362/362 |
| 月報自動化 | ✅ 正常 | 2026-08-01 月報生成成功 |
| 操作者狀態 | 🟡 旅行中 | 2026-07-06 至今約 4 週無 session；預計 8 月初返回 |

> ⚠️ 距最後一次實際健康檢查已過 **29 天**（2026-07-05）。返回後請立即執行 `/health` + `/smoke-test`。

---

## 風險與阻塞項

| 風險 | 嚴重度 | 狀態 |
|------|--------|------|
| Defender 木馬資安複盤 | 🔴 高 | **逾期 47 天**（目標 2026-06-17）；每週繼續逾期 |
| migration 0060 未套用 | 🔴 功能風險 | 影片資產 upsert 靜默降級；需 SSH EU VPS |
| 長時間無監控 | 🟠 重大 | **29 天**無活動；SG+EU VPS 均未驗證 |
| POD A2 金流紅線 | 🟠 重大 | draft-only 管線 dormant；confirm/自動履行未設計；等操作者明確核准 |
| S2 多租戶隔離 | 🟠 重大 | 約 20 個 IDOR 問題；S1 完成，S2–S5 未套用 |
| Stage 4 一鍵架站 | 🟠 重大 | 程式完成；等 `HETZNER_STAGING_TOKEN` + 操作者 go-ahead |
| EU→Dedicated 搬機 | 🟡 閘控 | 8月；需操作者刷卡；EU 8GB RAM 不足以跑 Chatwoot |
| Governance drift | 🟡 注意 | RoutingSpec 約 113 天 stale（月報 WARN）；PowerShell 環境限制致無法自動修 |
| npm moderate vulns | ℹ️ 接受 | opentelemetry 鏈 via @trigger.dev/sdk；18 個 moderate；等上游修復 |

---

## 記憶重點

- **操作者旅行第四週**：系統自 2026-07-06 起閒置 29 天。預計 8 月初返回。
- **返回後優先動作**（依急迫度）：
  1. `/health` + `/smoke-test` 確認 SG+EU VPS 狀態
  2. migration 0060 apply EU prod（SSH EU，一行 psql 指令）
  3. Defender 資安複盤（暫存檔清理 + 排程任務驗證，逾期 47 天）
  4. 購買二手 dedicated 主機（FSN，€48.70，刷卡 High risk）→ Chatwoot U6 接線
  5. Stage 4 一鍵架站開閘（`HETZNER_STAGING_TOKEN` + SG .env 三 flag + go-ahead）
- **自動化週報正常運作**：第四週連續正確生成；月報 2026-08-01 亦正常。
- **CF hairpin 反模式（永久記憶）**：Next.js server-side 禁止 `new URL("/api/...", request.url)` 做 Docker 內部呼叫；一律用 `http://<container-name>:3000`。
- **Stage 4 需同時滿足 5 個條件**：`HETZNER_STAGING_TOKEN`（vault 空）+ `SG_PROVISION_ENABLED=true` + `LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `HETZNER_STAGING_ENABLED=true` + sg-deploy（High risk）。
- **n8n 橋接 Stage 2 完成（2026-07-03）**：workflow `RbrHNu3BUEmpNWeT` active；剩 WP 端裝 Fluent Forms + 建表單 + webhook feed + FluentCRM。
- **Cold Outreach Phase 1 全完成**（ungated T1–T9/T11/T12）：僅 T10 Gmail per-org OAuth 未做（High risk gate）。
- **CS 系統 U0–U5 已上 prod live**：client-service engine、CIS tab、cs-config、eval harness、widget 程式全部完工；唯一剩 U6 Chatwoot 載體（等 dedicated 機）。
