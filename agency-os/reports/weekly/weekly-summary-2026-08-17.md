# Weekly Summary 2026-08-17

**期間**：2026-08-11 → 2026-08-17  
**產生時間**：2026-08-17 自動生成（遠端週報代理）

---

## 本週完成事項

**操作者本週從旅行返回後連續兩天高強度作業（2026-08-15、2026-08-16）**，解決了五週無人值守期間積累的基礎設施問題與監控缺口。

### 2026-08-15（重大基礎設施修復週）

- ✅ **EU 主機凍結根因排除**：ClickHouse telemetry 外掛導致 CPU 101.79%、系統表 16.89 GiB；修復後 CPU 降至 4.46%、系統表縮至 79.65 MiB。新增永久防復發設定（`override.xml`）。
- ✅ **EU netdata 通知修復**：outlet 配置空白導致告警無法送出；補設後告警管道恢復。
- ✅ **EU Trigger.dev 工作流程部署**：所有 lobster-factory/packages/workflows 成功部署至 EU 自架 Trigger.dev。
- ✅ **Resolve-Path bug class 修復**：跨 170 個站點 / 96 個檔案的路徑解析 bug 全面修正。
- ✅ **MCP routing 治理漂移歸零**：Routing 三件套（RoutingSpec + workflow-risk-matrix + ROUTING_MATRIX）差異補齊。
- ✅ **Soulful nameserver → Cloudflare 遷移**：CF zone 建立 + 12 筆 DNS 記錄移入；nameserver 已切換。

### 2026-08-16

- ✅ **Session 歷史消失修復**：`cleanupPeriodDays: 365`（前值過短導致對話記錄被清除）。
- ✅ **FluentSMTP host 修復**：`pop.hostinger.com:587`（錯誤）→ `smtp.hostinger.com:587`；2026-08-03 至 08-16 郵件靜默失敗 13 天，mail-tester.com 測試 10/10 pass。
- ✅ **站外 client_mail 監控建立**：`ao-resume.ps1` 已納入外站定期收信監控，確保 wp_mail 失效不再靜默無聲。
- ✅ **Soulful 備份還原演練 Drill #1 PASS**：EU 三份備份（769 MB）→ 演練機還原成功；新增 code backup 一份。
- ✅ **Soulful 搬機 Runbook 撰寫**：`tenants/company-soulful-expression/core/SITE_MIGRATION_RUNBOOK.md` 完整 §0.5–§6 + 回滾方案。

---

## 開放任務

### 🔴 緊急 / 逾期

- **【資安複盤 逾期 ~61 天】Defender 木馬 `Trojan:Win32/PowhidSubExec.B` 善後** — 目標日期 2026-06-17。暫存檔清理、排程任務驗證、Hook 強化仍未完成。每週繼續逾期。

- **【憑證外洩待善後】前公司桌機憑證洩漏** — 前員工離職後桌機退場前曾同步 `user-env.ps1` 明文 tokens + 三把 SSH 私鑰。涉及憑證：`TURSO_*`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`（及 SSH key）。需輪換或稽核是否已外流。

- **【待套用｜DB migration 0060】`media_assets.object_key` unique index** — `recordVideoAsset()` upsert 靜默降級為 insert，影片歷史可能重複。SSH EU VPS 一行 psql 即可套用。

### 🟠 閘控 / 等待操作者動作

- **Soulful 搬機 §3→§6**（**硬死線 2026-11-12**）：CF DNS 已切、備份已驗、Runbook 已寫；下一步 EU Hetzner dedicated 申購 + WordPress 搬移。
- **EU→Dedicated 搬機**（gated 8月）：FSN i7-7700/64GB/2×512SSD ~€48.70；需操作者刷卡。Chatwoot U6 接線依賴此機。
- **CS U6 Chatwoot**（gated）：U0–U5 軟體層已 prod live；接線等待 dedicated 主機。
- **一鍵架站 Stage 4 開閘**：`HETZNER_STAGING_TOKEN`（vault 空）+ SG .env 三 flag + sg-deploy（High risk）。
- **Cold Outreach T10**：Gmail per-org OAuth（High risk）；T1–T9/T11/T12 全完成。

### 🟡 人工任務

- POD Phase 4 真實 e2e：操作者瀏覽器 session（Woo+Printful 真實商品；Phases 0–3 程式全 live）
- Canvas 完整瀏覽器 e2e：Undo/Redo、genfill、Posterize、群組/解群組（程式已部署）
- Postiz OAuth app：Meta IG+FB（App Review）、Reddit、LinkedIn
- Soulful Day 1 §1.1 帳號層級確認（需操作者登入）
- Scenery Travel Mongolia：與客戶確認素材與頂級網域

### 基礎設施

- **Soulful 搬機 Runbook §3–§6 執行**：WordPress 實際搬移（EU Hetzner dedicated 到手後）
- 一鍵架站 Phase 5：Hetzner 租機嵌入 app.aware-wave.com（只需加 API route 呼叫 `provisionClient()`）
- Hetzner dispatcher 上線前：M10 orphan reaper + partial index（啟用 `LOBSTER_EXECUTE_*` 前必做）
- smoke test `04-onboard` spec：補 app session 登入步驟

### 資安 / Auto-Repair

- S2 多租戶隔離強化：約 20 個 IDOR 問題；S1 完成，S2–S5 未套用
- 前桌機憑證輪換（`TURSO_*` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / SSH keys）
- Auto-Repair M2 per-source HMAC + M4 fingerprint（Batch 3 完成；Phase 2 rollout 待推）

### 內容 / 工具

- Content Engine：RSS block + 第二批積木來源
- SEO/GEO Soulful：填真實資料（EdD/定價/IG/學術引用）才能發布文章
- TASKS `[x]` 自動歸檔 + 重複行偵測（R0 方案 A 已核准但未實作）
- Mockup Studio 功能異常：server-side 已排除；需操作者 F12 截圖

### wp-bridge

- `/product` dry_run 支援（bump AWBRIDGE_VERSION + release flow）
- Featured image sideload + update-existing-post + product delete
- wp-bridge → app.aware-wave.com Ops Dashboard 展示

---

## 系統健康

| 元件 | 狀態 | 備註 |
|------|------|------|
| SG VPS (`5.223.93.113`) | ✅ 健康 | Health 100% (372/372)；disk 55% |
| EU VPS (`204.168.175.41`) | ✅ 健康 | ClickHouse 修復；disk 56%；load 0.63 |
| ClickHouse | ✅ 穩定 | CPU 4.46%（修復前 101.79%）；系統表 79.65 MiB（修復前 16.89 GiB）|
| Supabase (EU) | ✅ 最後已知健康 | Migrations 套用至 0059；0060 待手動 apply |
| next-admin (SG) | ✅ 正常 | 599 vitest 全過 |
| Hook 系統 v2 | ✅ 已部署 | 接線腳本可用 |
| Auto-Repair | ✅ A1+A2+A3 | 運作中 |
| 建站流水線 | 🟡 Stage 4 閘控 | Stage 0–3 完成；Stage 4 等 token |
| 健康閘（最後驗證） | ✅ 100% | 2026-08-15 372/372 |
| Soulful 站 | ✅ CF DNS live | nameserver 已切，備份還原演練 PASS |
| 客戶外寄信監控 | ✅ 已建立 | 站外 client_mail 監控納入 ao-resume |
| 週報自動化 | ✅ 正常 | 第六週連續生成 |
| 操作者狀態 | 🟢 已返回 | 2026-08-15 結束 ~6 週旅行；本週高強度作業 |

---

## 風險與阻塞項

| 風險 | 嚴重度 | 狀態 |
|------|--------|------|
| Defender 木馬資安複盤 | 🔴 高 | **逾期 ~61 天**（目標 2026-06-17）|
| 前桌機憑證外洩 | 🔴 高 | 3 類憑證待輪換；桌機已退場但暴露時間未知 |
| migration 0060 未套用 | 🔴 功能風險 | upsert 靜默降級；需 SSH EU VPS 一行指令 |
| Soulful 搬機硬死線 | 🟠 重大 | **2026-11-12**；CF DNS 已切，搬移本體待執行 |
| POD A2 金流紅線 | 🟠 重大 | draft-only；confirm/自動履行等操作者核准 |
| S2 多租戶隔離 | 🟠 重大 | 約 20 個 IDOR；S2–S5 未套用 |
| Stage 4 一鍵架站 | 🟠 重大 | 程式完成；等 `HETZNER_STAGING_TOKEN` |
| EU→Dedicated 搬機 | 🟡 閘控 | 需操作者刷卡；EU 8GB RAM 不足跑 Chatwoot |
| npm moderate vulns | ℹ️ 接受 | 18 個 moderate；等上游修復 |

---

## 記憶重點

- **操作者已返回（2026-08-15 起）**：結束 ~6 週旅行，本週密集修復 EU 基礎設施。
- **EU 主機凍結已根治**：ClickHouse telemetry CPU 101.79%→4.46%、系統表 16.89 GiB→79.65 MiB；`override.xml` 防復發設定已套用。
- **Soulful CF DNS 切換完成**：CF zone + 12 筆記錄 live；還原演練 PASS；搬機 Runbook 完備；下一步是 §3 實際搬移。
- **FluentSMTP 靜默失敗 13 天已修**：pop→smtp 已修；站外監控已建；wp_mail 恢復正常。
- **單機運作模式**：前員工離職，公司桌機退場；憑證善後是本階段高優先事項。
- **下週優先動作**（依急迫度）：
  1. Migration 0060 apply（SSH EU，一行 psql）
  2. 前桌機憑證輪換（`TURSO_*` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / SSH keys）
  3. Defender 資安複盤（暫存檔清理 + 排程任務驗證，逾期 61 天）
  4. EU dedicated 申購（FSN ~€48.70）→ Chatwoot U6 + Soulful 搬機
  5. Stage 4 一鍵架站開閘（`HETZNER_STAGING_TOKEN` + SG .env）
- **CF hairpin 反模式（永久記憶）**：Next.js server-side 禁止 `new URL("/api/...", request.url)` 做 Docker 內部呼叫；一律用 `http://<container-name>:3000`。
- **Stage 4 需同時滿足 5 個條件**：`HETZNER_STAGING_TOKEN` + `SG_PROVISION_ENABLED=true` + `LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `HETZNER_STAGING_ENABLED=true` + sg-deploy（High risk）。
- **ClickHouse 復發前兆（永久記憶）**：system/app 資料比是共同前兆（2026-08-15 修復前為 345:1）；禁止用「調高 mem_limit / 清資料」了事，override.xml 才是根治。
