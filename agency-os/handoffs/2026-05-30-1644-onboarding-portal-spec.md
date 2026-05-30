---
slug: onboarding-portal-spec
created_utc: 2026-05-30T16:44:10Z
hint: "下次開工提醒：研究並設計「客戶網站建置系統」(Lobster Factory Client Onboarding Portal) — 取代零散的 app.aware-wave.com。客戶填完整 onboarding form → 系統自動選 WP package/plugin manifest → Claude 生成完整網站規格與建站執行計畫 → 整合 Sentry/Netdata/Uptime Kuma monitoring + Slack/Telegram alert + repair-agent 自動修復(staging only)。輸出 14 段完整規格。"
source_session_summary: "使用者下達一份大型研究/設計需求，要 Claude 產出 Client Onboarding Portal 完整規格（非實作，是規格文件）。"
---

# 客戶網站建置系統 — Client Onboarding Portal 完整規格（研究 + 設計）

## 1. 任務目標
產出一份可直接交給工程師/AI 實作的「客戶網站建置系統」完整規格文件（14 段），作為 Lobster Factory 的 Client Onboarding Portal，取代目前零散的 https://app.aware-wave.com/。

## 2. 為什麼做
使用者認為現行 app.aware-wave.com 太零散、無法真正被使用；需要一個「客戶填表 → 自動選 package → Claude 生成建站規格 → staging 建站 → monitoring + 自修復」的完整閉環系統。**這是規格設計任務，不是當場實作。**

## 3. 已試過
尚未開始。**但先盤點既有資產避免重工**（見段 6）：plugin 包設置/外掛 manifest 之前可能已討論過；`client-onboarding` subagent、`site-builder` agent、`build-tenant` skill、`repair-agent`、WP Plugin Auto-Install 系統均已存在；Sentry/PostHog/Netdata/Uptime Kuma 已在 stack。

## 4. 卡在哪
無阻礙 — 純研究/設計任務。唯一風險：直接憑空寫規格而沒先讀既有 lobster-factory packages / wp-bridge / plugin-autoinstall 既有設計 → 重工或自相矛盾。

## 5. 下一步指令（核心）

**先盤點（避免重工），再設計，最後產出單一規格文件。**

0. **先讀 `$WORK_ROOT/agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md`** — §0 是 reading list，§1/§2 已把 build 側 + ops 側全部 file:line 與精確 schema 摘要完（研究 2026-05-30 已完成，**不必重跑 Explore agent**）。

1. **讀既有資產**（並行 Grep/Read，禁止憑空設計）：
   - `$WORK_ROOT/lobster-factory/packages/` 與 `$WORK_ROOT/lobster-factory/workflows/` — 既有 package / manifest / workflow 結構
   - `$WORK_ROOT/agency-os/handoffs/2026-05-30-1641-tomo-164100.md` — **今日另一個相關 packet**：aware-wave-wp-bridge（clean-room WP/Kadence/Woo 控制平面），本任務與它高度相關，必須對齊不可分叉
   - memory `project_wp_plugin_autoinstall.md`（WP Plugin Auto-Install 系統現況：core logic done, sg-deploy + Trigger.dev re-deploy pending）
   - `$WORK_ROOT/agency-os/tenants/<slug>/core/` — 既有 tenant 設定結構（多客戶資料模型參考）
   - Grep `plugin.manifest|plugin_manifest|package.*manifest` across `lobster-factory/` 確認是否已有 manifest schema
   - repair-agent 既有流程：`incident → triage → backup → repair run → health gate → auto-rollback → GitHub issue`（見 AGENTS.md §Auto-Repair 紅線）

2. **參考站點分析**（WebFetch）：`https://sc-icg.com/` 與 `https://yangsheep.art/` — 抽取資訊架構 / form 流程 / 視覺方向當設計輸入。

3. **產出規格文件**到 `$WORK_ROOT/agency-os/docs/architecture/client-onboarding-portal-spec.md`（新檔；若 lobster-factory 有更合適 docs 目錄則放那），**必含 14 段**：
   1. onboarding form 欄位清單
   2. 欄位分類（公司/品牌/網站需求/功能需求/素材/參考網站/技術需求/維運需求）
   3. 每欄資料型別 + 必填與否
   4. 依產業/需求自動選 package / plugin manifest 的規則（decision tree）
   5. package / manifest 的 JSON 結構範例
   6. Claude 如何依 form 生成完整網站規格（sitemap/頁面結構/首頁文案/設計風格/圖片需求/外掛包選擇邏輯/Kadence·Woo·FluentCRM·FluentForms·RankMath·FluentSMTP·SiteKit·LiteSpeed 配置）
   7. WordPress Factory staging-first 建站流程
   8. Sentry / Netdata / Uptime Kuma monitoring 整合設計（監聽 error/health/uptime/perf/SSL/checkout/form/CRM webhook/plugin fatal）
   9. Slack / Telegram / Email alert workflow
   10. repair-agent 自動修復流程（讀 logs → 判因 → staging 套修 → smoke test → PR/approval；**不可改 prod**）
   11. 自動 vs 必須人工 approval 的分界表
   12. Supabase 資料表設計（多客戶/多專案/多網站）
   13. n8n / Trigger.dev workflow 設計
   14. 最小 MVP 應先做哪一版

4. **遵守限制條件**（寫進規格的每個流程都要體現）：prod 不可自動改 / 全程 staging-first / 每個重要操作有 logs·run_id·status·rollback / 高風險 approval / 多客戶·多專案·多網站 / 輸出格式可直接交給工程師或 AI 實作。

5. 完成後：規格文件本身就是交付物；commit + 在 TASKS.md 對應行打勾。

## 6. 相關資源
- **★ 先讀**：`$WORK_ROOT/agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md` — 完整 codebase map + reading list（build 側 + ops 側全部 file:line + 精確 schema，研究已完成）
- `$WORK_ROOT/lobster-factory/packages/`、`$WORK_ROOT/lobster-factory/workflows/` — 既有 package/workflow（**先讀**）
- `$WORK_ROOT/agency-os/handoffs/2026-05-30-1641-tomo-164100.md` — 姊妹任務 wp-bridge，**必須對齊**
- `$WORK_ROOT/agency-os/AGENTS.md` §Auto-Repair 紅線 / §AwareWave Stack — repair-agent 既有紅線 + monitoring stack 現況
- `$WORK_ROOT/agency-os/tenants/<slug>/core/ENVIRONMENT_REGISTRY.md` — 多客戶資料模型現況
- memory `project_wp_plugin_autoinstall.md`、`reference_aware_wave_credentials.md`
- **landmine**：① 這是規格設計，**不是當場建站/deploy**，別誤觸 SG/EU prod ② 別與 wp-bridge packet 分叉成兩套設計 ③ 別憑空發明 manifest schema — 先確認 lobster-factory 是否已有
