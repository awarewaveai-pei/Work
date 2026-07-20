# 週報 2026-07-20

**期間**：2026-07-14 → 2026-07-20
**產生時間**：2026-07-20 01:05 UTC（遠端週報代理）

---

## 本週完成事項

**本週無操作者 session（2026-07-14 – 2026-07-20）。**

這是**連續第二週無活動**。07-14 至 07-20 的每日筆記均為空白的 `(fill in at AO-CLOSE)` 佔位符。WORKLOG 自 2026-07-05 AO-CLOSE 後無新紀錄。操作者正在旅行中（預計 8 月返回）。

最後完成工作（參考 — 承接自前幾週，最後活躍日期 2026-07-05）：
- Phase 4 `/intake` 公開表單 + `(shell)/(public)` route group 重構（commit `915245b0`）
- Phase 5 Cloudflare Turnstile 接入（commit `6306cd8e`）
- EU VPS ClickHouse OOM 根治：mem_limit 1536m→3072m，清除 20GB 崩潰日誌（commit `00ea2e03`）
- fix(trigger-build)：CF hairpin → `http://next-admin:3000` + fetchWithRetry（commit `11886d04`）
- migration 0059 repair_runs_source_check 補加 'deploy' 值（commit `b1d555e6`）
- Ops Inbox human_only incident 「已知悉」直接關閉路由（commit `70b17903`）
- 蒙古旅遊客戶 handoff 文件 ×4（commits `ef71b328`–`8d642e77`）
- nginx /start/ redirect 還原；FluentForm 接單流程恢復（commit `44da8365`）

---

## 開放任務

### 🔴 緊急 / 逾期

- **【資安複盤 逾期 33 天】Defender 木馬 `Trojan:Win32/PowhidSubExec.B` 善後** — 目標日期為 2026-06-17。暫存檔清理 + 排程任務驗證 + Hook 強化均未完成。
- **POD A2 金流紅線** — A2 草稿管線已上線但處於休眠；確認/自動履行階段尚未設計；需操作者明確核准才可推進。

### 🟠 閘控 / 等待操作者動作

- **一鍵架站 Stage 4 開閘** — 程式碼已完成；需 `HETZNER_STAGING_TOKEN` 存入 vault + SG .env 三個旗標（`SG_PROVISION_ENABLED`、`LOBSTER_EXECUTE_MANIFEST_STEPS`、`HETZNER_STAGING_ENABLED`）+ sg-deploy（高風險，等 go-ahead）
- **EU→Dedicated 搬機 + 退雲端**（閘控至 8 月）：FSN i7-7700/64GB/2×512SSD ~€48.70；需操作者刷卡
- **CS U6 Chatwoot**（閘控至 8 月）：U0–U5 軟體層已上 prod；Chatwoot 接線等待 dedicated 主機
- **Cold Outreach Workbench T10**：Gmail per-org OAuth（閘控高風險）；T1–T9、T11、T12 全部完成
- **公司桌機**：Cloudflare vault token 修復（`cfut_` → `cfat_` + `CLOUDFLARE_ACCOUNT_ID`）+ SystemGuard 重新註冊

### 🟡 人工任務

- POD Phase 4 真實 e2e：操作者瀏覽器 session 建立真實 Woo+Printful 商品
- Canvas 完整瀏覽器 e2e：Undo/Redo、genfill、Posterize、群組/解群組
- Postiz OAuth app：Meta IG+FB、Reddit、LinkedIn（需各平台 App Review）
- Postiz 測試草稿清理：刪除 `cmqo1wijz0005p58ncl1mtssr`
- Postiz → 客戶 Hub 帳號連結（Bluesky → client slug 社群分頁）
- soulfulexpression.org → Cloudflare DNS 遷移（先確認 Hostinger 帳單明細）
- Termius 手機 SSH 設定 + cheat sheet（出國前必做 — 可能已錯過）

### 基礎設施

- Hetzner dispatcher 上線前準備：M10 orphan reaper + partial index（啟用 `LOBSTER_EXECUTE_*` 前必做）
- Hetzner 一鍵租機嵌入 app.aware-wave.com（Phase 5，操作指引：`hosting/EMBED_PROVISION_INTO_APP.md`）
- smoke test `04-onboard` spec：需補 app session 登入步驟
- `app.aware-wave` onboarding/provisioning IA 重整（Phase 1 ops-console 退役）

### 資安 / Auto-Repair

- S2 多租戶隔離強化：`MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md` 已記錄約 20 個 IDOR 問題；S1 完成，S2–S5 尚未套用
- Auto-Repair M2 per-source HMAC + M4 fingerprint（Batch 3 完成；Phase 2 rollout 待推）

### 內容 / 工具

- Content Engine：RSS block + 第二批來源；`ContentStudioImageModels.tsx:1112` 來源清單硬編碼
- SEO/GEO Soulful：需真實資料（EdD/定價/IG/引用來源）才能發布文章
- Image Output Pipeline：Tarot/POD 色調 → WebP/CMYK PDF（Phase 1.5/2 剩餘）
- TASKS `[x]` 自動歸檔 + 重複行偵測閘（`archive-completed-tasks.ps1`，R0 方案 A 已核准）

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
| SG VPS (`5.223.93.113`) | ⚠️ 未驗證 | 最後健康記錄 100%（2026-07-05）；**已 15 天無監控** |
| EU VPS (`204.168.175.41`) | ⚠️ 未驗證 | ClickHouse OOM 根治於 2026-07-05；**已 15 天無監控** |
| Supabase (EU) | ✅ 最後已知健康 | Migrations 已套用至 0059 |
| Hook 系統 v2 | ✅ 已部署 | 54/54 測試通過；遠端接線腳本可用 |
| next-admin (SG) | ✅ 最後已知正常 | Turnstile 已 bake；599 測試通過；route group 正常 |
| Auto-Repair | ✅ A1+A2+A3 | 自修引擎最後已知運作中 |
| 建站流水線 | 🟡 Stage 4 閘控 | Stage 0–3 完成；Stage 4 等 token + 環境旗標 |
| 健康閘（最後收工） | ✅ 100% | 2026-07-05 362/362 |
| 操作者狀態 | 🟡 旅行中 | 2026-07-07 至 2026-07-20 無 session（2 週）；預計 8 月返回 |

> ⚠️ 距最後一次健康檢查已過 15 天（2026-07-05）。EU VPS ClickHouse 穩定性觀察期已結束但無人監控。返回後請立即執行 `/health` + `/smoke-test`。

---

## 風險與阻塞項

| 風險 | 嚴重度 | 狀態 |
|------|--------|------|
| Defender 木馬資安複盤 | 🔴 高 | **逾期 33 天**（目標 2026-06-17）；仍未處理 |
| POD A2 金流紅線 | 🔴 緊急 | 需人工明確核准才可推進；確認/自動履行階段未設計 |
| 長時間無監控 | 🟠 重大 | 15 天無活動；EU ClickHouse + SG next-admin 均未驗證；auto-repair 可能已靜默處理 |
| S2 多租戶隔離強化 | 🟠 重大 | 約 20 個 IDOR 問題；S1 完成，S2–S5 未套用 |
| Stage 4 一鍵架站 | 🟠 重大 | 程式碼完成；等待 `HETZNER_STAGING_TOKEN` + 操作者 go-ahead |
| EU→Dedicated 搬機 | 🟡 閘控 | 8 月；需操作者刷卡；EU 8GB RAM 不足以跑 Chatwoot |
| Intake flow sg-deploy 待推 | 🟡 次要 | `fix(trigger-build)` commit `11886d04` 在 07-05 session 結束前可能未完成 sg-deploy |
| soulful 部落格圖片遺失 | ℹ️ 已接受 | 2 張圖片永久遺失；客戶可能發現（2026-06-28 確認接受此取捨） |

---

## 記憶重點

- **操作者長期旅行**：系統自 2026-07-06 起閒置，現進入第 3 週。預計 8 月返回後處理 EU dedicated 主機購買及 CS U6 Chatwoot 接線。
- **Intake 流程決策（2026-07-05）**：`/start/` → `/intake` React redirect 已建立（Phase 5）並於同一 session 還原。正式接單路徑維持：FluentForm → MySQL+FluentCRM → webhook → Supabase → trigger-build。`/intake` 表單作為備用方案存在，但在 prod Turnstile 接入前維持 OFF。
- **CF hairpin 反模式**：在 server-side Next.js 中，禁止用 `new URL("/api/...", request.url)` 進行 Docker 內部呼叫。一律改用 `http://<container-name>:3000`。
- **ClickHouse OOM 修復模式**：系統日誌 TTL 從未執行，因為 OOM 在 TTL 能跑之前就殺掉 ClickHouse。正確修法：先提高 mem_limit → 手動刪除日誌目錄 → TTL 恢復正常運作。
- **Stage 4 需同時滿足 5 個條件**：`HETZNER_STAGING_TOKEN`（vault 目前為空）+ `SG_PROVISION_ENABLED=true` + `LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `HETZNER_STAGING_ENABLED=true` + sg-deploy。
- **sg-deploy 可能待推**：trigger-build CF hairpin 修復（`11886d04`）及其他 07-05 commits 可能在操作者離線前未完成 sg-deploy。返回時請先驗 drift。
