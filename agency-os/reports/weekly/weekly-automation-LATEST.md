# Weekly Summary 2026-07-27

**期間**：2026-07-21 → 2026-07-27
**產生時間**：2026-07-27 01:06 UTC（遠端週報代理）

---

## 本週完成事項

**本週無操作者 session（2026-07-21 – 2026-07-27）。**

這是**連續第三週無活動**。2026-07-21 至 2026-07-27 的每日筆記均為 `(fill in at AO-CLOSE)` 佔位符。WORKLOG 自 2026-07-20 自動週報後無新紀錄。操作者仍在旅行中（預計 8 月返回）。

本週唯一活動為自動排程（本份週報本身）。

### 上週（07-20）完成的工作（僅供參考，承接自前週報）：
- `AUTO_TASK_DONE` 遠端 session（2026-07-20）：
  - 影片系統全面修復（7 個 critic 問題修訖）：3 個 API 路由補 role gate、SSRF 修復、duration slider 改 derived computation、reconcile regex 修正、upsert 加 unique conflict guard
  - `packages/workflows` npm audit fix（high=3→0）
  - DB migration `0060_media_assets_object_key_unique.sql` 建立（尚未 apply EU prod）
  - 自動週報 `reports/weekly/weekly-summary-2026-07-20.md` 生成

---

## 開放任務

### 🔴 緊急 / 逾期

- **【資安複盤 逾期 40 天】Defender 木馬 `Trojan:Win32/PowhidSubExec.B` 善後** — 目標日期 2026-06-17。暫存檔清理 + 排程任務驗證 + Hook 強化均未完成。
- **【待套用｜DB migration 0060】`media_assets.object_key` unique index** — `recordVideoAsset()` upsert 在沒有此 index 前可能靜默降級為 insert；影片歷史可能重複。需 SSH 進 EU VPS 套用。

### 🟠 閘控 / 等待操作者動作

- **一鍵架站 Stage 4 開閘** — 程式碼完成、idle 已驗；需 `HETZNER_STAGING_TOKEN`（vault 現空）+ SG .env 三 flag（`SG_PROVISION_ENABLED` / `LOBSTER_EXECUTE_MANIFEST_STEPS` / `HETZNER_STAGING_ENABLED`）+ sg-deploy（High risk，等 go-ahead）
- **EU→Dedicated 搬機 + 退雲端**（閘控至 8 月）：FSN i7-7700/64GB/2×512SSD ~€48.70；需操作者刷卡；§7 gate 5 項未達
- **CS U6 Chatwoot**（閘控至 8 月）：U0–U5 軟體層已上 prod；Chatwoot 接線等待 dedicated 主機
- **Cold Outreach Workbench T10**：Gmail per-org OAuth（High risk）；T1–T9 / T11 / T12 全部完成
- **公司桌機**：Cloudflare vault token 修復（`cfut_` → `cfat_` + `CLOUDFLARE_ACCOUNT_ID`）+ SystemGuard 重新註冊

### 🟡 人工任務

- POD Phase 4 真實 e2e：操作者瀏覽器 session 建立真實 Woo+Printful 商品
- Canvas 完整瀏覽器 e2e：Undo/Redo、genfill、Posterize、群組/解群組
- Postiz OAuth app：Meta IG+FB、Reddit、LinkedIn（需各平台 App Review）
- Postiz 測試草稿清理：刪除 `cmqo1wijz0005p58ncl1mtssr`
- Postiz → 客戶 Hub 帳號連結（Bluesky → client slug 社群分頁）
- soulfulexpression.org → Cloudflare DNS 遷移（先確認 Hostinger 帳單明細）
- Soulful Day 1 §1.1 帳號層級確認（需操作者登入）
- Scenery Travel Mongolia：與客戶確認素材與頂級網域

### 基礎設施

- Hetzner dispatcher 上線前準備：M10 orphan reaper + partial index（啟用 `LOBSTER_EXECUTE_*` 前必做）
- Hetzner 一鍵租機嵌入 app.aware-wave.com（Phase 5，`hosting/EMBED_PROVISION_INTO_APP.md`）
- smoke test `04-onboard` spec：補 app session 登入步驟
- `app.aware-wave` onboarding/provisioning IA 重整（Phase 1 ops-console 退役）

### 資安 / Auto-Repair

- S2 多租戶隔離強化：`MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md` 記錄約 20 個 IDOR 問題；S1 完成，S2–S5 未套用
- Auto-Repair M2 per-source HMAC + M4 fingerprint（Batch 3 完成；Phase 2 rollout 待推）

### 內容 / 工具

- Content Engine：RSS block + 第二批來源；`ContentStudioImageModels.tsx:1112` 來源清單硬編碼修正
- SEO/GEO Soulful：需真實資料（EdD/定價/IG/引用來源）才能發布文章
- Image Output Pipeline：Tarot/POD 色調→WebP/CMYK PDF（Phase 1.5/2 剩餘）
- TASKS `[x]` 自動歸檔 + 重複行偵測閘（`archive-completed-tasks.ps1`，R0 方案 A 已核准）
- Mockup Studio 功能異常：server-side 已排除；卡操作者提供症狀截圖

### wp-bridge

- `/product` dry_run 支援（`RestController:167`；bump AWBRIDGE_VERSION + release flow）
- Featured image sideload + update-existing-post + product update/delete
- wp-bridge → app.aware-wave.com Ops Dashboard + 商業化

### 客戶 / 網站

- Soulful Expression Art Therapy：Day 1 帳號交接（等待操作者）
- Scenery Travel Mongolia：新站 Day 1 + Day 2（等待客戶刷卡 + 網域確認）
- Next-Gen 試點：雲端 staging 實機驗收（兩案）

---

## 系統健康

| 元件 | 狀態 | 備註 |
|------|------|------|
| SG VPS (`5.223.93.113`) | ⚠️ 未驗證 | 最後健康記錄 100%（2026-07-05）；**已 22 天無監控** |
| EU VPS (`204.168.175.41`) | ⚠️ 未驗證 | ClickHouse OOM 根治於 2026-07-05；**已 22 天無監控** |
| Supabase (EU) | ✅ 最後已知健康 | Migrations 已套用至 0059；0060 待手動 apply |
| Hook 系統 v2 | ✅ 已部署 | 遠端接線腳本可用 |
| next-admin (SG) | ✅ 最後已知正常 | 599 測試通過；route group 正常 |
| Auto-Repair | ✅ A1+A2+A3 | 最後已知運作中 |
| 建站流水線 | 🟡 Stage 4 閘控 | Stage 0–3 完成；Stage 4 等 token + 環境旗標 |
| 健康閘（最後收工） | ✅ 100% | 2026-07-05 362/362 |
| 操作者狀態 | 🟡 旅行中 | 2026-07-06 至今約 3 週無 session；預計 8 月返回 |
| Video API | ✅ 已修復 | 7 個 critic 問題於 2026-07-20 遠端 session 修訖 |

> ⚠️ 距最後一次實際健康檢查已過 **22 天**（2026-07-05）。EU VPS ClickHouse 穩定性觀察期早已結束但無人確認。返回後請立即執行 `/health` + `/smoke-test`。

---

## 風險與阻塞項

| 風險 | 嚴重度 | 狀態 |
|------|--------|------|
| Defender 木馬資安複盤 | 🔴 高 | **逾期 40 天**（目標 2026-06-17）；仍未處理 |
| migration 0060 未套用 | 🔴 功能風險 | 影片資產重複寫入風險；需 SSH EU VPS |
| 長時間無監控 | 🟠 重大 | **22 天**無活動；SG+EU VPS 均未驗證 |
| POD A2 金流紅線 | 🟠 重大 | A2 草稿管線 dormant；confirm/自動履行未設計；需操作者明確核准 |
| S2 多租戶隔離強化 | 🟠 重大 | 約 20 個 IDOR 問題；S1 完成，S2–S5 未套用 |
| Stage 4 一鍵架站 | 🟠 重大 | 程式碼完成；等待 `HETZNER_STAGING_TOKEN` + 操作者 go-ahead |
| EU→Dedicated 搬機 | 🟡 閘控 | 8 月；需操作者刷卡；EU 8GB RAM 不足以跑 Chatwoot |
| npm moderate vulns | ℹ️ 接受 | opentelemetry 鏈 via @trigger.dev/sdk；18 個 moderate；等上游修復 |

---

## 記憶重點

- **操作者旅行第三週**：系統自 2026-07-06 起閒置。預計 8 月返回後優先：① `/health` + `/smoke-test` 確認兩台 VPS 狀態 ② migration 0060 apply EU prod ③ 購買二手 dedicated 主機（EU→Dedicated 搬機，High risk，需刷卡）④ Chatwoot U6 接線。
- **遠端週報 agent 2026-07-20 額外完成**：影片 API 系統 7 個安全/功能問題已修（role gate × 5 + SSRF × 1 + upsert conflict × 1）。這是本次遠端 session 自主判斷的附加工作，未在任務清單中。
- **CF hairpin 反模式（記憶）**：server-side Next.js 禁止 `new URL("/api/...", request.url)` 做 Docker 內部呼叫；一律用 `http://<container-name>:3000`。
- **Stage 4 需同時滿足 5 個條件**：`HETZNER_STAGING_TOKEN`（vault 空）+ `SG_PROVISION_ENABLED=true` + `LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `HETZNER_STAGING_ENABLED=true` + sg-deploy。
- **n8n 橋接 Stage 2 完成（2026-07-03）**：workflow `RbrHNu3BUEmpNWeT` active，e2e 驗過；剩 WP 端裝 Fluent Forms + 建表單 + webhook feed + FluentCRM。
