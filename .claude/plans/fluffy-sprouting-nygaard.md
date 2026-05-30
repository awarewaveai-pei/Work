# app.aware-wave.com 功能徹底分析

> 來源：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`（Next.js 15 App Router，port 3002）
> 線上實測時間點：6 筆未結事件、Gemini 配額 0/1400、probe ok、Slack+Telegram 通道全開、2 個 active tenant。

## 一句話定位
這不是「給客戶看的網站」，而是你整個 **AwareWave 多租戶 SaaS 工廠的營運中樞（Ops Nerve Center）**——把監控告警、自動修復、客戶佈建、WordPress 維運、Telegram 指揮全部收斂到一個 Admin Console。

---

## 七大功能模組

### 1. 統一事件收件匣 Ops Inbox（Incident Engine）
- 7 個來源 webhook 收斂成單一 `ops_incidents` 表：Sentry / Uptime Kuma / Grafana / Netdata / PostHog / deploy events / 手動。
- 每筆告警算 **fingerprint（指紋去重雜湊）** → 判定 new / duplicate / escalation / reopen。
- AI 自動分類（Gemini/Claude）標 severity、service、建議修復策略，含 cost 追蹤 + 每日配額閘。
- 頁面：`/ops/inbox`（可依 status/severity/source 過濾 + 全文搜尋）、`/ops/inbox/[id]`（原始 payload、AI 診斷史、通知派送 log）。

### 2. 自動修復編排 Repair Center
- 狀態機：`detected → triage_needed →(核准閘)→ approved → backing_up → repairing → pr_ready → deploy_pending → deploying → resolved/rolled_back`。
- 依來源套用 policy（auto_repair / analysis_only / human_only / triage_needed）；備份未驗證不修；自動開 GitHub PR。
- Integration blocker：客戶整合不健康時自動擋修復。
- 頁面：`/ops/repairs`。

### 3. 客戶生命週期管理
- `/onboard`：4 步精靈（客戶資料 → M3 部門選擇 → 服務帳號佈建 → Build Console 自動帶入）。
- `/ops/clients`：客戶卡片 + **即時健康探測（HEAD 請求測延遲/狀態碼）** + WP 外掛更新狀態。
- `/ops/clients/[slug]`：SSH 連線跑 WP-CLI，**波次更新外掛（wave1 高風險逐一 / wave2 中風險續錯 / wave3 低風險批次）**，SSE 串流進度。

### 4. 基礎設施佈建 Build Console
- `/build`：plan_only（預覽 terraform plan）vs enqueue（送 Trigger.dev 真執行）。
- 佈建 sentry/posthog/uptime_kuma/n8n/github/trigger/supabase 等服務帳號。
- Blocker 檢查（備份閘、GitHub token）。

### 5. 永遠在線指揮平面 Command Plane（Telegram）
- Telegram webhook → 驗 secret + 白名單 user/chat id → 解析指令 → 路由 handler。
- high/critical 風險指令進 `command_requests` 佇列，需人工核准。
- `/ops/approvals`：核准/駁回佇列（owner/admin 才能批）。

### 6. 系統模式 / 緊急煞車 Kill Switch
- `/ops/system-modes`：normal / maintenance / read_only / emergency_stop，可設過期自動恢復。
- 全域擋下 Repair / Build / Command 執行。

### 7. 整合登錄 + 診斷工具
- `/ops/integrations`：所有 tenant↔外部系統綁定（13 種 provider）健康狀態 + asset 登錄。
- `/ops-console`：tenant 設定、媒體邊界規則、AI job 佇列、Trigger.dev workflow runs。
- `/ops/tools`：AI 工具與通知通道參考。
- `/api-check`、`/api-check-client`：server/browser 兩側健康檢查。

---

## 技術骨架
- **權限 RBAC**：owner > admin > operator > viewer；header 解析（x-ops-claims-role 等）。
- **Auth 模型**（middleware.ts）：`/ops/*`、`/api/ops/*` 需角色 header + 信任代理（`x-ops-proxy-auth` = `OPS_PROXY_SHARED_SECRET`）；production 無代理驗證即 403。webhook 走 Bearer token（`OPS_INBOX_INGEST_TOKEN`）或 HMAC 簽章（GitHub/Telegram）。公開豁免：`/api/ops/summary`、`/api/ops/inbox/health|digest`、`/api/webhooks/*`。
- **資料庫**（Supabase）：organizations、repair_runs、ops_incidents、command_requests、system_modes、tenant_integration_bindings、assets、ops_health_probes、build_runs 等。
- **外部整合**：Trigger.dev（背景任務）、7 監控源 webhook、Slack/Telegram（通知+指令）、GitHub（PR/merge）、WordPress（SSH+WP-CLI）。

---

## 觀察到的可深入方向（待使用者選擇是否展開）
1. **健康度/Bug 稽核**：對 45 個 route 跑 critic + db-expert，找 RBAC 漏洞、webhook 驗證缺口、N+1。
2. **安全審查**：webhook token/HMAC、redactSecrets 覆蓋面、middleware 繞過面。
3. **未完成功能盤點**：Slack 指令仍是 placeholder、dispatch route 回 501、Templates「coming soon」。
4. **文件化**：產出一份 Admin 操作手冊 / 架構圖。
5. **UX/前端**：盤點 15 頁的實際畫面與互動缺口。
