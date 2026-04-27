# Ops Observability Inbox — 路線 B 實作計畫

> Version: **v2.0 — Day 1 ready**
> Status: 規格已凍結（spec frozen）；待綠燈即可動工。
> Parent reference: `docs/Ops_Observability_OS_Master_Blueprint.md`（藍圖完整版）
>
> **執行版（給 AI / 人接力動手做）住** [`docs/Ops_Observability_PathB_Implementation.md`](./Ops_Observability_PathB_Implementation.md)。
> 本檔 = **設計版**（為什麼這麼做、衝突分析、風險、附錄）。
> 執行版 = 6 個獨立工作包（B-0 ~ B-5），每個 self-contained，可單獨複製給任一 AI 執行。
> 兩檔不一致時 → **本檔（設計版）優先**，立即同步執行版。
> Positioning: 藍圖的「壓縮 + 個人化」版本
> Build estimate: 5 個工作日（單人）
> AI 工具盤: ChatGPT Plus / Claude Pro / Gemini Free / Cursor Pro / Copilot
> Last audit against codebase: 2026-04-27（已對齊 `next-admin` middleware、`packages/db/migrations`、`lib/supabase-server`、`lib/ops-role`、`app/layout.tsx`）

> **30-year invariants（30 年內都不能違反）**
> 1. **不裝 Clerk、不裝 Supabase Auth**：沿用 `next-admin/middleware.ts` 的 trusted-proxy + role header 模型。
> 2. **不裝 OpenAI / Anthropic SDK**：吃使用者既有 ChatGPT Plus / Claude Pro / Cursor Pro 訂閱，零 API 邊際成本。
> 3. **不混流**：`#alerts-infra`（Tier 1 firehose，Netdata/Kuma 直連）與 `#ops-incidents`（Tier 2 curated，Inbox 專用）永不混流。
> 4. **不撞既有 schema / route**：Inbox 全部用 `ops_incidents`、`ops_inbox_*`、`/api/webhooks/*`、`/ops/inbox*` 命名，不動既有 `ops_console` / `ops_action_*` / `media_assets` / `ai_image_jobs` 表，不動既有 `/api/ops/*` 路由。
> 5. **抽象先行**：`Notifier` interface 即使只有 1 個實作也要寫，這是 30 年內唯一不需重做的決策。

---

## 0. Executive Summary

把 **Sentry / Uptime Kuma / Grafana(Loki) / Netdata / PostHog** 的所有告警，全部聚合到一個 Next.js 頁面（單一收件夾），每筆事件可以一鍵丟給對應的 AI agent 做診斷或派工。

**這不是藍圖那套全自動 AIOps 平台**——這是「**集中看、按需問、由人決策**」的最小可用版本。

核心原則：

```txt
集中收件 (Inbox)
+ 多 AI 分工診斷 (Multi-AI Dispatch, read-only)
+ 一鍵跳到 Cursor 修 (Human Driver)
- 沒有自動修復
- 沒有 production approval workflow
- 沒有 SafeMode / dry-run / rollback 機制
- 沒有自動 PR / 自動 deploy
```

---

## 0.1 Day 0 Readiness Checklist（動工前 60 分鐘必做）

> 這是 **Day 1 之前的「動工前體檢」**。任何一項沒過 → 不要動 Day 1，先把它修好，否則整個 5 天會在底層問題上鬼打牆。

### 0.1.1 環境變數（本機 + production VPS 都要對齊）

```ps1
# 必須已存在於本機 setx（user-env.ps1 已寫入，請 verify）
SUPABASE_URL                       # 已存在（next-admin 共用）
SUPABASE_SERVICE_ROLE_KEY          # 已存在（next-admin 共用）
GEMINI_API_KEY                     # 已存在（free tier 1500/day）
OPS_PROXY_SHARED_SECRET            # 已存在（既有 reverse proxy auth）

# 路線 B 新增（已寫入 user-env.ps1，driver 重開機後生效）
OPS_INBOX_INGEST_TOKEN             # webhook 共享密鑰（32 字元隨機，不入 git）
OPS_INBOX_PUBLIC_URL               # https://app.aware-wave.com
OPS_INBOX_SLACK_INCIDENTS_WEBHOOK  # #ops-incidents 專屬（已建頻道、已產 webhook）
OPS_INBOX_SLACK_INCIDENTS_CHANNEL  # "#ops-incidents"（顯示用）
OPS_INBOX_NOTIFY_ENABLED           # "true"（kill switch）
OPS_INBOX_GEMINI_ENABLED           # "true"
OPS_INBOX_POSTHOG_ENABLED          # "false"（v1 預設關）
```

驗證方式：

```powershell
# 應印出 10 個變數值
@(
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GEMINI_API_KEY','OPS_PROXY_SHARED_SECRET',
  'OPS_INBOX_INGEST_TOKEN','OPS_INBOX_PUBLIC_URL','OPS_INBOX_SLACK_INCIDENTS_WEBHOOK',
  'OPS_INBOX_SLACK_INCIDENTS_CHANNEL','OPS_INBOX_NOTIFY_ENABLED','OPS_INBOX_GEMINI_ENABLED'
) | ForEach-Object { "{0}={1}" -f $_, [Environment]::GetEnvironmentVariable($_,'User') }
```

### 0.1.2 既有系統健康度（不要在生病的系統上動工）

- [ ] `next-admin` 本地 `npm run dev` 起得來，`/api-check` 綠燈
- [ ] Supabase awarewave 連得上：`/rest/v1/` 能 GET、service role key 有效
- [ ] Slack `#alerts-infra` 過去 24h 內有 Netdata 訊息（驗證 Tier 1 firehose 仍正常）

**已知（2026-04-27 體檢結果，不擋路線 B）**：

| 觀察 | 影響 | 對策 |
| --- | --- | --- |
| `supabase.aware-wave.com` public schema 目前只有 `workflow_runs` 一張表 | 既有 0001–0012 從未套用；`/ops-console` 背後讀的表大多不存在 | **不在路線 B 範圍**。`0013_ops_inbox.sql` 是 self-contained（只用 `pgcrypto` extension，無 FK 到 0001–0012），可直接上。 |
| `OPS_PROXY_SHARED_SECRET` 本機 `User`/`Machine`/`Process` scope 都未設 | `middleware.ts` line 19 在 `NODE_ENV !== 'production'` 自動 bypass，**本機 dev 不擋** | production 部署前由 nginx + app 兩端對齊（`infra/.../nginx/system-sites/ops-proxy-headers.inc` 的 `__OPS_PROXY_SHARED_SECRET__`） |
| 既有 0001–0012 補回是否在路線 B 做？ | **不做**。屬於另一條獨立工單 | 路線 B 唯一新表 `ops_incidents` / `ops_inbox_gemini_quota`，跟 `workflow_runs` 不衝突 |
- [ ] Slack `#ops-incidents` 已建立、且 webhook smoke test 過（中文不亂碼）

### 0.1.3 路徑/命名衝突檢查（動工前最後 grep 一次）

下列 grep 應全部「找不到」，否則表示已有東西撞名，要先談清楚：

| 應該找不到 | 真的找不到？ | 撞了怎麼辦 |
|---|---|---|
| `app/ops/inbox/` | ✅ 整個 `/ops/` namespace 不存在 | — |
| `app/api/webhooks/` | ✅ 不存在 | — |
| `app/api/ai/` | ✅ 不存在 | — |
| `lib/ops-inbox/` | ✅ 不存在 | — |
| `table ops_incidents` 在既有 migrations | ✅ 0001–0012 都不含 | — |
| `OPS_INBOX_*` 環境變數已被別處讀 | ✅ 全 repo grep 無結果 | — |

驗證：

```powershell
rg --no-heading "ops_incidents|OPS_INBOX_|/api/webhooks|/ops/inbox|lib/ops-inbox" `
   lobster-factory/infra/hetzner-phase1-core/apps/next-admin `
   lobster-factory/packages
# 預期輸出：0 行
```

### 0.1.4 必改的既有檔（Day 1 第一件事）

| 檔 | 改什麼 | 為什麼必改（不改 = 整份計畫無法跑） |
|---|---|---|
| `apps/next-admin/middleware.ts` | matcher 從 `["/api/ops/:path*"]` 擴成 `["/api/ops/:path*", "/ops/:path*", "/api/ai/:path*"]` | 沒加 → `/ops/inbox` 頁面收不到 role header；`/api/ai/auto-classify` 沒做 role 驗證 |
| `apps/next-admin/tsconfig.json` | 加 `"baseUrl": "."`、`"paths": { "@/*": ["./*"] }` | 沒加 → 計畫裡所有 `import from '@/lib/ops-inbox/...'` 全失效 |
| `apps/next-admin/app/layout.tsx` | sidebar 「Overview」區塊內，`Ops Console v1` 與 `API Health` 之間插一行 `<Link href="/ops/inbox">Ops Inbox</Link>` | 沒加 → UI 找不到入口（functional 不影響，但 UX 死掉） |

> 這 3 個改動加總 < 15 行 diff，但是路線 B 的 5 天能不能跑得動的命脈。**Day 1 第一個 commit 必須只做這 3 個改動 + migration**，避免和功能 commit 混在一起被回滾。

### 0.1.5 一次性手動操作（5 分鐘）

- [ ] Slack workspace → 新建 `#ops-incidents` 頻道、Incoming Webhook、複製 webhook URL → 寫進 env（§12.1）
- [ ] Sentry → Settings → Integrations → Internal Integrations → 新增 `Ops Inbox Ingest`、scope `event:read issue:read`、設一條 Webhook URL = `https://app.aware-wave.com/api/webhooks/sentry`、Authorization header `Bearer <OPS_INBOX_INGEST_TOKEN>`
- [ ] Uptime Kuma → 每個 monitor 的 Notification 加 webhook → `https://app.aware-wave.com/api/webhooks/uptime-kuma`
- [ ] Grafana → Alerting → Contact points → 加 webhook 同上
- [ ] Netdata → 每台主機的 `health_alarm_notify.conf` 改用 `webhook` provider 指到 `/api/webhooks/netdata`
- [ ] PostHog → v1 跳過（feature flag 預設關）

> 有任一項今天無法做（例：Sentry 整合審核要等），對應的 webhook 路由仍要寫，先空轉。

---

## 1. Goals & Non-Goals

### 1.1 Goals（要做到）

1. **單一頁面**看完所有監測來源的告警（不再切 6 個分頁）。
2. **去重 + 集中**：同一個錯誤連續觸發 100 次，inbox 只有 1 筆（含計數）。
3. **多 AI 分工**：依事件類型自動推薦適合的 AI（ChatGPT 看程式錯誤、Claude 寫 RCA、Gemini 掃日誌 pattern）。
4. **一鍵跳轉**：從 incident 直接 deeplink 到 Cursor，並自動帶入錯誤 context。
5. **狀態追蹤**：open / investigating / resolved / ignored 四態，自己手動更新。
6. **可升級**：表結構與 webhook 格式設計為「未來能升路線 C（藍圖）」而不打掉重來。

### 1.2 Non-Goals（明確不做）

- ❌ AI 自動執行修復（不寫 SafeMode、不寫 approval、不寫 dry_run）
- ❌ AI 自動開 PR / 自動 deploy（最多生成「建議的 PR 描述」給人類用）
- ❌ Production / staging 環境差別治理
- ❌ 多租戶 RLS（單人/單組織用，先不做 organization_id 切割）
- ❌ Runbook factory / feedback loop / status page
- ❌ 14 張表的 schema（藍圖 §7）

---

## 2. 與其他路線的差異（一頁速查）

| 維度 | 路線 A（純 Grafana） | **路線 B（本文件）** | 路線 C（完整藍圖） |
|---|---|---|---|
| 程式碼量 | 0 | ~800 LOC | ~10,000 LOC |
| Supabase 表 | 0 | 1 張 | 14 張 |
| Webhook 端點 | 0 | 5 個 | 7 個（含簽章驗證） |
| AI 自主性 | 無（人工複製貼上） | 顧問（人決策） | 駕駛（人審批） |
| 安全防線 | N/A | 不需要 | 4 層（SafeMode/approval/dry_run/rollback） |
| 升級路徑 | 死胡同 | **可升 C** | — |
| 實作工時 | 半天 | 3–5 天 | 4–6 週 |

---

## 3. 高階架構

```txt
┌─────────────────────────────────────────────────────────┐
│                  Observability Sources                   │
│ Sentry | Uptime Kuma | Grafana Alerts | Netdata | PostHog│
└──────────────────────────┬──────────────────────────────┘
                           │ webhook
                           ▼
┌─────────────────────────────────────────────────────────┐
│              /api/webhooks/{source}                      │
│   - 驗證共享密鑰（Bearer token，不做 HMAC）              │
│   - 抽 external_id                                       │
│   - 算 fingerprint（去重用）                             │
│   - 標準化成 Incident                                    │
│   - upsert 進 Supabase                                   │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                Supabase: incidents (1 張表)              │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│            Next.js Dashboard：/ops/inbox                 │
│  [紅] Sentry: TypeErr in cart.tsx        ×17  [Diagnose]│
│  [黃] Kuma: scenery-mongolia.com down    ×3   [Diagnose]│
│  [紅] Netdata: vps-1 CPU 98%             ×42  [Diagnose]│
│  [灰] PostHog: signup drop -40%          ×1   [Diagnose]│
└──────────────────────────┬──────────────────────────────┘
                           │ click [Diagnose]
                           ▼
┌─────────────────────────────────────────────────────────┐
│              AI Dispatch Selector                        │
│  根據 signal_type 自動推薦：                             │
│  - error    → ChatGPT (Codex)                            │
│  - uptime   → Claude                                     │
│  - resource → Claude + Gemini (logs)                     │
│  - business → Claude                                     │
│  並提供：[Open in Cursor] 直接帶 context 跳轉            │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Tech Stack（全部用現有的）

| 元件 | 選用 | 理由 |
|---|---|---|
| 後端框架 | Next.js 15 App Router | 你 `lobster-factory/.../next-admin` 已有 |
| 部署位置 | `lobster-factory/infra/hetzner-phase1-core/apps/next-admin` 內加 `/ops/inbox` 路由 | 不另開 app，直接掛現有 admin |
| 對外網址 | `https://app.aware-wave.com/ops/inbox` | 沿用既有 `app.aware-wave.com`（即 next-admin 對外網域） |
| Sidebar 位置 | Overview 區塊，Ops Console v1 的兄弟節點 | 與 Dashboard / Ops Console v1 / API Health 並列 |
| 資料庫 | Supabase (`awarewave` project) | 你已有，且 Sentry/PostHog 都已經連這個 |
| Auth | **沿用 next-admin 既有：trusted reverse proxy + role header**（`x-ops-proxy-auth` + `x-ops-claims-role`，由 `OPS_PROXY_SHARED_SECRET` 驗證） | 你**沒裝 Clerk**；目前 admin 的 middleware 已是這個模型，路線 B 不引進新 auth 系統 |
| Slack 通知 | 兩層拓撲（§6.6）：`#alerts-infra` 既有 firehose、`#ops-incidents` 新建 curated | 已有 webhook |
| Tier 1 自動分類 | Google Gemini Flash（Free Tier，1500 req/day） | 已有 `GEMINI_API_KEY`，**零** API 邊際成本 |
| Tier 2/3 深度診斷 | 「複製 prompt + 開新分頁」吃 ChatGPT Plus / Claude Pro / Cursor Pro 訂閱 | **不裝** OpenAI / Anthropic SDK |
| Cursor deeplink | `cursor://anysphere.cursor-deeplink/prompt?text=` | 已支援 |

**完全不引進新工具，不新增 npm dependency 除了 `@google/generative-ai`**。

### 4.1 Auth 邊界（明確一次，避免誤裝 Clerk）

路線 B 有**兩個獨立的 auth 邊界**，不混用、不引進 Clerk：

| 邊界 | 路徑 | 驗證方式 | 來源 env |
|---|---|---|---|
| Webhook 入口（外部 → 你） | `POST /api/webhooks/{source}` | `Authorization: Bearer <OPS_INBOX_INGEST_TOKEN>` | DPAPI vault |
| Dashboard / AI 觸發（你 → 系統） | `GET /ops/inbox*` 與 `POST /api/ai/*` | **沿用 `next-admin/middleware.ts` 既有模型**：可信 reverse proxy 帶 `x-ops-proxy-auth: <OPS_PROXY_SHARED_SECRET>` + `x-ops-claims-role: <owner\|admin\|operator\|viewer>` | 既有環境變數 |

> 不裝 Clerk、不裝 Supabase Auth、不寫新的 middleware。  
> 既有 `next-admin/middleware.ts` 的 matcher 是 `["/api/ops/:path*"]`。

**Day 1 必須改 middleware（這是 §0.1.4 的第一件事）**：

```diff
 export const config = {
-  matcher: ["/api/ops/:path*"],
+  matcher: ["/api/ops/:path*", "/ops/:path*", "/api/ai/:path*"],
 };
```

擴張後行為：

| 路徑 | 是否走 middleware | 行為 |
|---|---|---|
| `/api/webhooks/*` | ❌（不在 matcher） | route handler 內**自己**驗 `Authorization: Bearer <OPS_INBOX_INGEST_TOKEN>` |
| `/ops/inbox*` | ✅ | middleware 清/帶入 `x-ops-claims-role` → page Server Component 用 `readOpsRole(headers())` 判 role |
| `/api/ai/*` | ✅ | 同上，`viewer` 直接 403 |
| `/api/ops/*` | ✅（既有，不動） | 既有 ops console，不影響 |

> Middleware 只是**淨化 header**（沒帶 trusted-proxy auth → 把所有 claim header 刪掉），它本身**不拒絕請求**。實際 role 檢查在 page / route handler 內，呼叫 `readOpsRole()` 後決定 200 / 403 / 唯讀。

### 4.2 與既有系統的整合點檢核（衝突矩陣）

> **30 年的關鍵承諾**：路線 B 不該動既有任何一個檔的功能行為，只能「加」不能「改」。下表是所有接觸點的衝突檢核。

| 接觸點 | 既有狀況 | 路線 B 動作 | 衝突風險 | 緩解 |
|---|---|---|---|---|
| `apps/next-admin/middleware.ts` | matcher = `["/api/ops/:path*"]`，僅淨化 header | 擴 matcher 加 `/ops/:path*`、`/api/ai/:path*` | 既有 `/api/ops/*` 行為**不變**（matcher 是聯集） | Day 1 第一個 commit 單獨改這個檔，可獨立驗證 |
| `apps/next-admin/lib/supabase-server.ts` | 讀 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | **直接重用** `getSupabaseWriteClient()` | 不引入第二套 Supabase 連線 | 不新增 `OPS_INBOX_SUPABASE_*` 變數（**第一版 plan 的設計錯誤已修正**） |
| `apps/next-admin/lib/ops-role.ts` | 提供 `readOpsRole()` / `resolveOpsRole()` / `canCreateAiImageJob()` | **直接 import** `readOpsRole()`；新增 `canTriggerAiDiagnose()` 到既有檔 | 不另做 auth 系統 | 新函式單純判斷，無副作用 |
| `apps/next-admin/lib/ops-contracts.ts` | `OpsRole` 等 type 集中地 | **不動**；新 type 放 `lib/ops-inbox/types.ts` | 防止此檔變垃圾桶 | 新 type 隔離在新檔 |
| `app/api/ops/*` | 5 個既有路由 | **不動** | 名稱層完全不重疊 | grep 已驗證（§0.1.3） |
| `app/api-check*` | 健康檢查端點 | **不動** | — | — |
| `app/ops-console/page.tsx` | 既有 UI 入口 | **不動**；Inbox 在新 namespace `app/ops/inbox/` | 注意：`/ops-console` ≠ `/ops/inbox`，URL 層也不重疊 | — |
| `app/layout.tsx` sidebar | Overview 區塊有 4 條連結 | **加 1 條** Ops Inbox（在 Ops Console v1 與 API Health 之間） | 純加，不刪不改 | < 5 行 diff |
| `packages/db/migrations/` | 已到 `0012_seed_ops_console_minimal.sql` | 新增 `0013_ops_inbox.sql` | 編號連續，無撞號 | 採用既有編號慣例（§5、§10） |
| `packages/shared/src/types/` | 只有 `v3-skeleton.ts` | **不放這裡**。Inbox 型別放 `apps/next-admin/lib/ops-inbox/types.ts` | `next.config.ts` 的 `outputFileTracingRoot` 限制在 next-admin，跨 packages 在 Docker build 會痛 | 型別隨 app 走 |
| 既有 Slack `#alerts-infra` | Netdata / Kuma 直連 | **完全不動** | Inbox 通知改發到 `#ops-incidents`（§6.6） | 兩層拓撲分流 |
| 既有 `getSupabaseWriteClient()` 呼叫者 | `app/api/ops/*` 的 5 個路由 | 共用同一 client，但讀寫不同表 | 表名 `ops_incidents` 與 `ops_action_*` / `ops_audit_events` / `media_assets` 完全不重疊 | grep 已驗證（§0.1.3） |
| 既有 Sentry `@sentry/nextjs` | next-admin 已掛 | webhook handler 失敗時用 `Sentry.captureException()` | 不重複 instrument | 沿用既有 SDK 實例 |
| 既有 `@supabase/supabase-js@^2.49.8` | next-admin 已用 | Inbox 沿用同版 | 無新依賴 | — |
| **新增依賴** | `@google/generative-ai`（唯一新增） | Tier 1 Gemini Flash | 跟既有不衝突 | 只在 server route 用，不打進 client bundle |

> **檢核結論**：路線 B 全部以「新檔 + 一個 middleware 改 + 一個 layout 改 + 一支 migration」收斂；**不修改任何既有 lib 函式的簽章或行為**。

### 4.3 Path / Symbol Namespace 約定（30 年都用同一套）

```txt
DB schema:    ops_incidents, ops_inbox_*           （加 ops_inbox 前綴的小表，例 ops_inbox_quota）
URL（API）:   /api/webhooks/{source}, /api/ai/*    （webhooks 不要塞進 /api/ops 內）
URL（UI）:    /ops/inbox, /ops/inbox/[id]
Files:        apps/next-admin/lib/ops-inbox/**
Env vars:     OPS_INBOX_*                           （所有 inbox 專屬變數一律此前綴）
TS types:     apps/next-admin/lib/ops-inbox/types.ts（不放 packages/shared）
Slack:        #ops-incidents                        （和 #alerts-infra 永不混流）
```

> 違反這套命名 → PR reviewer 直接 reject。30 年內這份命名不能改，因為改了就會出現「半 ops_incidents 半 ops_inbox_incidents」的歷史包袱。

---

## 5. 資料模型（1 張表 + 1 張配額表）

```sql
-- lobster-factory/packages/db/migrations/0013_ops_inbox.sql
-- 採用既有 numbered migration 慣例（0001-0012 之後接 0013），不另開 supabase/migrations 目錄

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────
-- 主表：ops_incidents
-- ─────────────────────────────────────────────────────────
create table if not exists ops_incidents (
  id              uuid primary key default gen_random_uuid(),

  source          text not null
                    check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual')),
  external_id     text not null,
  fingerprint     text not null,

  signal_type     text not null
                    check (signal_type in ('error','uptime','latency','resource','business','deployment')),
  severity        text not null default 'medium'
                    check (severity in ('low','medium','high','critical')),

  service         text,
  environment     text not null default 'production'
                    check (environment in ('development','staging','production')),

  title           text not null,
  message         text,

  occurrence_count integer not null default 1,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),

  status          text not null default 'open'
                    check (status in ('open','investigating','resolved','ignored')),

  -- 升級時讓人寫一句 triage 結論用，路線 B 也用得上
  notes           text,
  -- 自我管理 SLA，路線 C 升級時可接 status page
  due_at          timestamptz,
  -- 重新打開的次數（reopen 計數，分析「沒修乾淨」的案件用）
  reopen_count    integer not null default 0,
  resolved_at     timestamptz,
  resolved_by     text,

  ai_provider_suggested text,
  ai_diagnoses    jsonb not null default '[]'::jsonb,
  cursor_deeplink text,

  -- 30-year safety: 通知歷史與真相同源，可重放、可審計
  notification_log jsonb not null default '[]'::jsonb,

  raw             jsonb not null default '{}'::jsonb,
  tags            jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (source, external_id),
  unique (fingerprint, environment)
);

create index if not exists ops_incidents_status_idx       on ops_incidents(status);
create index if not exists ops_incidents_severity_idx     on ops_incidents(severity);
create index if not exists ops_incidents_last_seen_idx    on ops_incidents(last_seen_at desc);
create index if not exists ops_incidents_source_idx       on ops_incidents(source);
create index if not exists ops_incidents_service_idx      on ops_incidents(service);
-- 給「最近 24h 待處理列表」這個熱查詢用
create index if not exists ops_incidents_open_recent_idx
  on ops_incidents (last_seen_at desc)
  where status in ('open','investigating');

create or replace function ops_incidents_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists ops_incidents_touch_updated on ops_incidents;
create trigger ops_incidents_touch_updated
before update on ops_incidents
for each row execute function ops_incidents_touch_updated_at();

-- ─────────────────────────────────────────────────────────
-- 配額表：ops_inbox_gemini_quota（每日 free tier 計數）
-- ─────────────────────────────────────────────────────────
create table if not exists ops_inbox_gemini_quota (
  date           date primary key,
  count          integer not null default 0,
  last_call_at   timestamptz,
  last_error     text,
  updated_at     timestamptz not null default now()
);

-- 原子遞增（避免 race），Day 4 quotaGuard 透過此函式呼叫
create or replace function ops_inbox_gemini_quota_increment(p_max integer)
returns table (allowed boolean, current_count integer)
language plpgsql as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_count integer;
begin
  insert into ops_inbox_gemini_quota (date, count)
  values (v_today, 0)
  on conflict (date) do nothing;

  update ops_inbox_gemini_quota
     set count = count + 1,
         last_call_at = now(),
         updated_at = now()
   where date = v_today
     and count < p_max
  returning count into v_count;

  if v_count is null then
    select count into v_count from ops_inbox_gemini_quota where date = v_today;
    return query select false, v_count;
  end if;
  return query select true, v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────
-- RLS：路線 B 不做 multi-tenant，直接用 service role 讀寫；anon 完全擋
-- ─────────────────────────────────────────────────────────
alter table ops_incidents enable row level security;
alter table ops_inbox_gemini_quota enable row level security;
-- 故意不寫 policy，等於 service role bypass + anon 讀寫全擋（next-admin 用 service role 讀寫）
```

> **設計要點**：欄位名稱與型別**刻意對齊藍圖 §7.2 / §7.3**，方便未來升級到路線 C 時用 `ALTER TABLE` 加欄位即可，不需重新建表。
> **編號為什麼是 `0013`**：對齊 `lobster-factory/packages/db/migrations/` 既有 0001–0012 numbered 慣例（`0011_ops_console_control_plane.sql`、`0012_seed_ops_console_minimal.sql`）。**不要**用 `supabase/migrations/<timestamp>_*.sql` 格式（路線 B v1 規格錯誤已修正）。

### 5.1 TypeScript 型別（`apps/next-admin/lib/ops-inbox/types.ts`）

> 型別**不放** `packages/shared`，因為 `next.config.ts` 把 `outputFileTracingRoot` 鎖在 next-admin。跨 packages 在 Docker build 會痛。

```ts
// apps/next-admin/lib/ops-inbox/types.ts

export type IncidentSource =
  | 'sentry' | 'uptime_kuma' | 'grafana' | 'netdata' | 'posthog' | 'manual';

export type IncidentSignalType =
  | 'error' | 'uptime' | 'latency' | 'resource' | 'business' | 'deployment';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'ignored';

export type IncidentEnvironment = 'development' | 'staging' | 'production';

export interface AiDiagnosis {
  provider: 'gemini' | 'chatgpt' | 'claude' | 'cursor' | 'other';
  model?: string;
  role: 'auto-classify' | 'diagnosis' | 'rca' | 'manual-paste';
  summary: string;
  tokens?: number;
  cost_usd?: number;
  created_at: string;          // ISO8601
  created_by?: string;         // 'system' | <user id>
}

export type NotificationStatus = 'sent' | 'failed' | 'throttled';
export type NotificationRule =
  | 'new_incident_first_occurrence'
  | 'severity_escalation'
  | 'reopen'
  | 'critical_immediate';

export interface NotificationLogEntry {
  channel: string;             // e.g. 'slack:ops-incidents'
  rule: NotificationRule;
  status: NotificationStatus;
  ts: string;                  // ISO8601
  message_ts?: string;         // Slack message timestamp（用於回追訊息）
  reason?: string;             // throttle / fail 原因
  error?: string;
}

export interface Incident {
  id: string;
  source: IncidentSource;
  external_id: string;
  fingerprint: string;
  signal_type: IncidentSignalType;
  severity: IncidentSeverity;

  service: string | null;
  environment: IncidentEnvironment;

  title: string;
  message: string | null;

  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;

  status: IncidentStatus;
  notes: string | null;
  due_at: string | null;
  reopen_count: number;
  resolved_at: string | null;
  resolved_by: string | null;

  ai_provider_suggested: string | null;
  ai_diagnoses: AiDiagnosis[];
  cursor_deeplink: string | null;

  notification_log: NotificationLogEntry[];

  raw: Record<string, unknown>;
  tags: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

// Webhook handler 內部用，標準化 normalizer 的輸出
export type IncidentDraft =
  Pick<
    Incident,
    | 'source' | 'external_id' | 'fingerprint' | 'signal_type' | 'severity'
    | 'service' | 'environment' | 'title' | 'message' | 'raw' | 'tags'
  >;
```

### 5.2 `notification_log` 範例（每次發送通知都記錄，30 年都查得到）

```json
[
  {
    "channel": "slack:ops-incidents",
    "rule": "new_incident_first_occurrence",
    "status": "sent",
    "ts": "2026-04-27T11:30:00Z",
    "message_ts": "1745749800.001"
  },
  {
    "channel": "slack:ops-incidents",
    "rule": "severity_escalation",
    "status": "throttled",
    "ts": "2026-04-27T11:35:00Z",
    "reason": "within_15min_window"
  }
]
```

### 5.3 `ai_diagnoses` 範例（一筆 incident 可累積多個 AI 診斷）

```json
[
  {
    "provider": "gemini",
    "model": "gemini-2.0-flash",
    "role": "auto-classify",
    "summary": "Postgres 連線池疑似耗盡，建議查 /api/orders 的慢查詢。",
    "tokens": 320,
    "created_at": "2026-04-27T11:30:01Z",
    "created_by": "system"
  },
  {
    "provider": "chatgpt",
    "role": "diagnosis",
    "summary": "建議把 pool size 從 10 提到 50，並加 retry。",
    "created_at": "2026-04-27T11:32:18Z",
    "created_by": "USER"
  }
]
```

---

## 6. Webhook 標準化規格

### 6.1 路由表

```txt
POST /api/webhooks/sentry
POST /api/webhooks/uptime-kuma
POST /api/webhooks/grafana
POST /api/webhooks/netdata
POST /api/webhooks/posthog
```

### 6.2 通用驗證（簡化版）

每個端點檢查 header：

```http
Authorization: Bearer <OPS_INBOX_INGEST_TOKEN>
```

> 這是路線 B 的妥協：不做完整的各家 HMAC 簽章驗證（藍圖 §6.1 要求），而是用單一共享密鑰。把 token 存在 DPAPI vault，每家來源都共用同一個。
> **升級到路線 C 時**：替換成各家 signature verifier。

### 6.3 通用流程（兩段式 upsert，正確偵測 escalation 與 reopen）

> ❌ **第一版的單一 `upsert` 會丟資訊**：upsert 後拿不到「之前的 severity / status」，所以無法判斷「這次是升級了嗎？是 reopen 嗎？」。Day 5 的通知規則 (§6.6.4 `severity_escalation` / `reopen`) 會永遠不觸發。
> ✅ **兩段式**：先 SELECT 既存（如果有），再 UPSERT，diff 兩者得到 `transition`，傳給 dispatcher。

```ts
// apps/next-admin/app/api/webhooks/[source]/route.ts
import { headers } from 'next/headers';
import { getSupabaseWriteClient } from '@/lib/supabase-server';
import { verifyIngestToken } from '@/lib/ops-inbox/verifyIngestToken';
import { normalize<Source> } from '@/lib/ops-inbox/normalize/<source>';
import { computeFingerprint } from '@/lib/ops-inbox/fingerprint';
import { redactSecrets } from '@/lib/ops-inbox/redactSecrets';
import { dispatchNotifications } from '@/lib/ops-inbox/notify/dispatcher';
import { triggerAutoClassify } from '@/lib/ops-inbox/ai/triggerAutoClassify';

export async function POST(req: Request) {
  // ─── Step 1: Bearer 驗證 ─────────────────────────
  if (!verifyIngestToken(req)) {
    return new Response('unauthorized', { status: 401 });
  }

  // ─── Step 2: 解析 + redact + normalize ───────────
  const raw = redactSecrets(await req.json());      // 去除 password/token/cookie 等欄位
  const draft = normalize<Source>(raw);              // → IncidentDraft
  draft.fingerprint = computeFingerprint({           // 來源特定算法（§6.4.1）
    source: draft.source, service: draft.service,
    signal_type: draft.signal_type, title: draft.title,
    raw,
  });

  const supabase = getSupabaseWriteClient();         // 沿用既有 lib/supabase-server.ts
  if (!supabase) return new Response('db unavailable', { status: 503 });

  // ─── Step 3: 先 SELECT 既存 ──────────────────────
  const { data: existing } = await supabase
    .from('ops_incidents')
    .select('id, severity, status, occurrence_count, reopen_count')
    .eq('fingerprint', draft.fingerprint)
    .eq('environment', draft.environment)
    .maybeSingle();

  // ─── Step 4: 計算 transition ─────────────────────
  const transition = computeTransition(existing, draft);
  // {
  //   kind: 'new' | 'duplicate' | 'severity_escalated' | 'reopened',
  //   prevSeverity?, prevStatus?,
  // }

  // ─── Step 5: UPSERT（同 fingerprint + environment 唯一）────
  const isReopen = transition.kind === 'reopened';
  const { data: upserted, error } = await supabase
    .from('ops_incidents')
    .upsert(
      {
        ...draft,
        last_seen_at: new Date().toISOString(),
        occurrence_count: (existing?.occurrence_count ?? 0) + 1,
        reopen_count: (existing?.reopen_count ?? 0) + (isReopen ? 1 : 0),
        // reopen 時把 status 拉回 open
        ...(isReopen ? { status: 'open' as const, resolved_at: null, resolved_by: null } : {}),
        // severity 取 max(舊, 新)，避免從 critical 降回 medium
        severity: maxSeverity(existing?.severity, draft.severity),
      },
      { onConflict: 'fingerprint,environment' },
    )
    .select('*')
    .single();

  if (error) {
    Sentry.captureException(error, { tags: { route: 'ops-inbox-webhook' } });
    return new Response('db write failed', { status: 500 });
  }

  // ─── Step 6: fire-and-forget 副作用（不阻塞 webhook 回應）──
  Promise.allSettled([
    transition.kind === 'new' ? triggerAutoClassify(upserted.id) : null,
    dispatchNotifications({ incident: upserted, transition }),
  ]).catch((e) => Sentry.captureException(e));

  // ─── Step 7: 200 OK ─────────────────────────────
  return Response.json({
    incident_id: upserted.id,
    transition: transition.kind,
    occurrence_count: upserted.occurrence_count,
  });
}
```

> **為什麼 fire-and-forget 而非 await**：webhook 寄送方（Sentry/Kuma/...）對 5xx 會 retry，如果 Slack 慢或 Gemini 慢拖到 webhook timeout，會被重送 → 造成重複事件。固定 < 1 秒回 200，副作用在背景跑。
> **為什麼 severity 取 max**：避免一筆 incident 被 medium 告警「降級」覆蓋掉之前的 critical 狀態。藍圖 §7.2 也是這個語意。

### 6.4 各來源的 normalizer 重點

| Source | external_id 取自 | severity 推導 | service 欄位來源 |
|---|---|---|---|
| Sentry | `data.issue.id` | `level: 'fatal'` → critical / `'error'` → high / `'warning'` → medium / 其他 → low | `data.project_slug`，**用 §6.4.2 對應表轉成 SERVICE_REGISTRY key** |
| Uptime Kuma | `monitor.id + ":" + heartbeat.time` | 公開生產站 down → critical / staging → medium / cert 即將到期 → low | `monitor.tags` 找 `service:<key>`，否則 fallback 到 hostname → §6.4.2 對應 |
| Grafana | `alerts[0].fingerprint` | label `severity` 直接帶（critical/high/medium/low）；無 label 預設 medium | `alerts[0].labels.service`（事先在 alert rule 設好） |
| Netdata | `id + ":" + alarm` | `CRITICAL` → critical / `WARNING` → medium / `CLEAR` → 不入庫 | `host`（VPS 主機名）→ §6.4.2 host→service 表；通常 `service = null`，標 host |
| PostHog | `event.uuid` | 預設 medium，看 alert rule（cohort drop > 30% → high） | `event.properties.$service` 或 alert name |

每個 normalizer 是一個純函式，輸入 raw payload，輸出 `IncidentDraft` shape。寫成獨立函式好測試（vitest 用真實 payload sample，§附錄 C）。

#### 6.4.1 Fingerprint 演算法（依來源不同，**避免 title 飄移失效**）

> ❌ **第一版的 `sha256(source:service:signal_type:title)`** 對 Sentry 不可靠：Sentry title 經常含 line number / chunk hash / dynamic ID，每次小變動就產生新的 fingerprint，**去重失效 → 重複通知**。
> ✅ **善用各來源已經給好的穩定 ID**，自己算的當 fallback。

```ts
// lib/ops-inbox/fingerprint.ts
import { createHash } from 'node:crypto';

export function computeFingerprint(args: {
  source: IncidentSource;
  service: string | null;
  signal_type: IncidentSignalType;
  title: string;
  raw: any;
}): string {
  // 各來源優先吃自己的穩定 fingerprint
  const sourceFp = sourceSpecificFingerprint(args);
  if (sourceFp) return sourceFp;

  // Fallback：title 正規化後再 hash
  const normTitle = args.title
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hex>')         // 去除 chunk hash / commit sha
    .replace(/\b\d{2,}\b/g, '<n>')                  // 去除行號 / port / 大數字
    .replace(/['"`].*?['"`]/g, '<str>')             // 去除引號內動態字串
    .toLowerCase()
    .trim();
  return sha256(`${args.source}|${args.service ?? '_'}|${args.signal_type}|${normTitle}`);
}

function sourceSpecificFingerprint(args: { source: IncidentSource; raw: any }): string | null {
  switch (args.source) {
    case 'sentry':
      // Sentry issue.id 在同一 project 內穩定，跨 deploy 也一致
      return args.raw?.data?.issue?.id ? sha256(`sentry:${args.raw.data.issue.id}`) : null;
    case 'grafana':
      // Grafana 已自帶 fingerprint（每筆 alerts[]）
      return args.raw?.alerts?.[0]?.fingerprint
        ? sha256(`grafana:${args.raw.alerts[0].fingerprint}`)
        : null;
    case 'uptime_kuma':
      // Kuma 用 monitor.id（heartbeat 時間不放，否則每分鐘都新 fingerprint）
      return args.raw?.monitor?.id
        ? sha256(`kuma:${args.raw.monitor.id}:${args.raw.monitor?.type ?? 'http'}`)
        : null;
    case 'netdata':
      // Netdata 的 alarm name 在主機內穩定
      return args.raw?.host && args.raw?.alarm
        ? sha256(`netdata:${args.raw.host}:${args.raw.alarm}`)
        : null;
    case 'posthog':
      return args.raw?.alert_id
        ? sha256(`posthog:${args.raw.alert_id}`)
        : null;
    default:
      return null;
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
```

#### 6.4.2 Source → SERVICE_REGISTRY 對應表

每個來源送來的「服務識別字」格式都不同。Inbox 用一張小對應表把它映射到 §6.5 `SERVICE_REGISTRY` 的 key，**對不上就 `service = null`（host-level）**。

| Source | 來源欄位 | 範例值 | 對應到 `SERVICE_REGISTRY` key |
|---|---|---|---|
| Sentry | `project_slug` | `javascript-nextjs` | `javascript-nextjs`（直接相等） |
| Sentry | `project_slug` | `node-api` | `node-api` |
| Sentry | `project_slug` | `php` | `php` |
| Sentry | `project_slug` | `n8n` | `n8n` |
| Sentry | `project_slug` | `supabase` | `supabase` |
| Sentry | `project_slug` | `trigger-workflows` | `trigger-workflows` |
| Uptime Kuma | tag `service:` | `service:wordpress` | `php` |
| Uptime Kuma | hostname | `aware-wave.com` | `php`（fallback 表） |
| Uptime Kuma | hostname | `app.aware-wave.com` | `javascript-nextjs` |
| Uptime Kuma | hostname | `api.aware-wave.com` | `node-api` |
| Uptime Kuma | hostname | `n8n.aware-wave.com` | `n8n` |
| Grafana | `alerts[0].labels.service` | 已是 key | 直接用 |
| Netdata | `host` | `wordpress-ubuntu-4gb-sin-1` | `null`（標 `tags.host = 'sg'`） |
| Netdata | `host` | `awarewave-eu-hel1-cpx32` | `null`（標 `tags.host = 'eu'`） |
| PostHog | `event.properties.$service` | 任意 | 直接 lookup，找不到 → null |

> 對應表寫在 `lib/ops-inbox/registry/sourceMapping.ts`，**單一檔，新增來源只要加一行**。

#### 6.4.3 Environment 推導（保證所有來源都填得進 `production` / `staging` / `development`）

> ❌ 第一版只說「default 'production'」，但每個來源有自己的環境訊號，不利用就會把 staging 噪音和 production critical 混在一起。
> ✅ 統一推導規則，最後保證一定落在三選一。

| Source | 推導規則 | Fallback |
|---|---|---|
| Sentry | `raw.data.event.environment`（`'production'` / `'staging'` / `'development'`） | `production` |
| Uptime Kuma | `monitor.tags` 找 `env:<...>`；否則看 hostname：`*.staging.*` → staging | `production` |
| Grafana | `alerts[0].labels.environment` | `production` |
| Netdata | host map：`sg` / `eu` 都當 production | `production` |
| PostHog | `event.properties.environment` | `production` |
| 任意來源 | URL/title 含 `localhost` / `127.0.0.1` | `development` |

> 路線 B v1 的「先全部當 production 看」（§17）依然成立——但 normalizer 該抽的訊號要抽乾淨，否則 reopen 與 dedup 都會錯。

### 6.5 Service 註冊表（初始 v1，對齊真實架構）

對齊 `C:\Users\USER\AWARE_WAVE_CREDENTIALS.md` 的實際部署。`service` 欄位的合法值與 dispatch metadata 寫在 **`lib/ops-inbox/registry/services.ts`**：

```ts
// 三種 dispatch 型態：
// - local-repo  : 有本地 repo，Cursor deeplink 帶 cwd
// - remote-ui-n8n     : 沒有本地 code，要開 n8n web UI
// - remote-ui-supabase: 沒有本地 code，要開 Supabase Studio

export type ServiceTarget =
  | { type: 'local-repo'; repo_path: string; public_url?: string; host: 'sg' | 'eu' }
  | { type: 'remote-ui-n8n'; ui_url: string; ssh_path: string; host: 'eu' }
  | { type: 'remote-ui-supabase'; ui_url: string; ssh_path: string; host: 'eu' };

export const SERVICE_REGISTRY = {
  'javascript-nextjs': {
    type: 'local-repo',
    repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin',
    public_url: 'https://app.aware-wave.com',
    host: 'sg',
  },
  'node-api': {
    type: 'local-repo',
    repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/node-api',
    public_url: 'https://api.aware-wave.com',
    host: 'sg',
  },
  'php': {
    type: 'local-repo',
    repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/wordpress',
    public_url: 'https://aware-wave.com',
    host: 'sg',
  },
  'trigger-workflows': {
    type: 'local-repo',
    repo_path: 'lobster-factory/packages/workflows',
    public_url: 'https://trigger.aware-wave.com',
    host: 'eu',
  },
  'n8n': {
    type: 'remote-ui-n8n',
    ui_url: 'https://n8n.aware-wave.com/home/workflows',
    ssh_path: '/root/n8n/',         // compose 層問題用
    host: 'eu',
  },
  'supabase': {
    type: 'remote-ui-supabase',
    ui_url: 'https://studio.aware-wave.com',
    ssh_path: '/root/supabase/docker/',
    host: 'eu',
  },
} as const satisfies Record<string, ServiceTarget>;

export type KnownService = keyof typeof SERVICE_REGISTRY;
export const KNOWN_SERVICES = Object.keys(SERVICE_REGISTRY) as KnownService[];
```

#### 主機對應（給 Netdata / Grafana 用）

| host code | hostname | IP | 部署 |
|---|---|---|---|
| `sg` | `wordpress-ubuntu-4gb-sin-1` | 5.223.93.113 | WordPress / node-api / next-admin / Grafana / Loki / Promtail / Redis |
| `eu` | `awarewave-eu-hel1-cpx32` | 204.168.175.41 | Supabase / n8n / Trigger.dev / Uptime Kuma |

> Netdata webhook 進來時，從 `host` 反查屬於哪台主機，再把它歸到對應主機上**最常出問題**的 service（或留 `service = null`，標 host 即可）。
> 不在這個註冊表的事件 → `service = null`，inbox 顯示為 `(host-level)`，按主機篩選即可。

#### 為什麼要結構化（不只是字串清單）

| 動機 | 帶來什麼 |
|---|---|
| 知道哪個 service 有本地 repo | 決定 inbox 顯示 `[Open in Cursor]` 還是 `[Open n8n UI]` |
| 知道每個 service 的 SSH 路徑 | Cursor prompt 可以提示「如果要動 compose，SSH 進 EU 的 `/root/n8n/`」 |
| 知道 public_url | Slack 通知可附「線上服務當前狀態連結」|
| 知道 host | 跨來源關聯（Sentry n8n + Netdata EU vps cpu 100% → 高機率同一根因）|

---

### 6.6 通知拓撲（**30-year 決策**：兩層分流，永不混流）

> 這是整份文件「最重要的長期決策」。30 年內 Slack 可能改名、被 Discord 取代、頻道會重建——但**拓撲分層的職責**不會變。

#### 6.6.1 兩層拓撲（Two-tier Topology）

```txt
┌─────────────────────────────────────────────────────────────┐
│  Tier 1：Firehose（原始告警，高頻、低訊號雜訊比）             │
│  → Slack #alerts-infra（沿用既有，不動）                    │
│  → 來源：Netdata、Uptime Kuma、Grafana 直連                 │
│  → 觀眾：on-call、即時 SRE                                  │
│  → 保留理由：Inbox 掛了也不會看不到告警（故障隔離）         │
└─────────────────────────────────────────────────────────────┘

                          ↓（由各來源獨立發送，與 Inbox 解耦）

┌─────────────────────────────────────────────────────────────┐
│  Tier 2：Curated Incidents（已去重、已分類、可追蹤）         │
│  → Slack #ops-incidents（**新開**）                         │
│  → 來源：Ops Inbox 的 Notifier Dispatcher                   │
│  → 觀眾：你 / triage 者 / 之後的 ops team                   │
│  → 內容：incident URL、severity、AI 摘要、三軌按鈕連結        │
└─────────────────────────────────────────────────────────────┘
```

**為什麼必須分流（這是 30 年級的決策）**：

| 動機 | 混流的代價 | 分流的收益 |
|---|---|---|
| 訊號雜訊比 | Netdata 一晚刷 200 條 CPU spike，淹沒 Inbox 真正需要看的 5 條 critical | `#ops-incidents` 永遠只有「已去重、有 context、值得人看」的事件 |
| 故障隔離 | Inbox 程式有 bug 不發通知 → 連 Netdata 告警都看不到 | Tier 1 走原路，Inbox 是錦上添花 |
| 觀眾不同 | on-call 想看 raw、triage 想看 curated，混流兩邊都不滿意 | 每個頻道的訂閱者明確 |
| 重複通知 | 同一 outage Netdata 發到 #alerts-infra，Inbox 也發到 #alerts-infra | 永遠不重複 |
| 長期演進 | 之後想加 Discord / Email / PagerDuty，#alerts-infra 變成大雜燴 | 各層獨立路由，加減通道不互相影響 |

#### 6.6.2 Notifier 抽象（讓 Slack 隨時可換）

30 年內 Slack 不一定還在。**Notifier interface** 把通道當成 plugin：

```ts
// lib/ops-inbox/notify/types.ts
export interface NotificationContext {
  incident: Incident;
  rule: NotificationRule;       // 'new_incident' | 'severity_escalation' | 'reopen'
  publicUrl: string;            // app.aware-wave.com/ops/inbox/<id>
}

export interface Notifier {
  readonly id: string;          // 'slack:ops-incidents' | 'email:ops' | 'discord:ops'
  send(ctx: NotificationContext): Promise<NotificationResult>;
}

export interface NotificationResult {
  status: 'sent' | 'failed' | 'throttled';
  reason?: string;
  externalRef?: string;         // Slack message_ts、email message-id 等
}
```

```ts
// lib/ops-inbox/notify/slack.ts
export class SlackNotifier implements Notifier {
  constructor(
    public readonly id: string,
    private webhookUrl: string,
  ) {}

  async send(ctx: NotificationContext): Promise<NotificationResult> {
    // POST webhookUrl with Slack block kit message
    // 失敗回傳 { status: 'failed', reason: ... }
  }
}
```

```ts
// lib/ops-inbox/notify/dispatcher.ts
const NOTIFIERS: Notifier[] = [
  new SlackNotifier(
    'slack:ops-incidents',
    process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK!,
  ),
  // 未來加 email / discord / pagerduty 都在這裡擴
];

export async function dispatchNotifications(ctx: NotificationContext) {
  for (const notifier of NOTIFIERS) {
    if (!shouldNotify(notifier, ctx)) continue;     // throttle / dedup 規則
    const result = await notifier.send(ctx);
    await appendNotificationLog(ctx.incident.id, notifier.id, ctx.rule, result);
  }
}
```

> **為什麼這個抽象值得做**（即使路線 B 只有一個 notifier）：
> - 加新通道 = 寫一個 class，不動 dispatcher 或 webhook handler
> - 換掉 Slack（30 年後）= 把 `SlackNotifier` 換成 `DiscordNotifier`，DB 紀錄 schema 不變
> - 測試容易：fake notifier 可以單元測試所有 throttle / dedup 規則
> - **多寫的程式碼 < 100 行**，但把一個「會被改 30 年」的決策寫成介面

#### 6.6.3 Throttle / Dedup 三層保險

防止同一個問題刷 Slack 的三層保險（任一層失效還有下一層）：

| 層級 | 在哪裡 | 規則 |
|---|---|---|
| L1 入庫去重 | webhook handler | `unique(fingerprint, environment)` 約束，重複事件只 `occurrence_count++` |
| L2 通知節流 | `shouldNotify()` | 同一 fingerprint 15 分鐘內第二次起，不發 Slack（`severity` 升級例外） |
| L3 視覺去重 | Slack message 本身 | 含 fingerprint 短碼（`fp:abc12345`），人眼一看就知是同一根因 |

#### 6.6.4 通知規則表（路線 B v1）

| Rule ID | 觸發條件 | 目標通道 | 例外 |
|---|---|---|---|
| `new_incident_first_occurrence` | webhook upsert 後 `occurrence_count = 1` | `slack:ops-incidents` | 無 |
| `severity_escalation` | 同 fingerprint 從 medium → high/critical | `slack:ops-incidents` | 無 |
| `reopen` | status 從 `resolved` 重新變回 `open` | `slack:ops-incidents` | 無 |
| `critical_immediate` | `severity = 'critical'` | `slack:ops-incidents`（含 `<!here>`）| 無 |

> **不發 Slack 的情境**：occurrence_count > 1 且非升級、`status = 'ignored'`、`environment = 'development'`。

#### 6.6.5 30 年清單：為什麼這個拓撲撐得住

- ✅ Slack 換 Discord：改 `SlackNotifier` → `DiscordNotifier`，env 換 webhook URL，DB schema 完全不動
- ✅ 加 PagerDuty：在 `NOTIFIERS[]` 加一個，rule 表加一行 `critical_only_pagerduty`
- ✅ 頻道改名：env 換 webhook URL，code 完全不動
- ✅ 不想用 webhook 改用 Slack Bot Token API：替換 `SlackNotifier` 內部實作，外部介面不變
- ✅ 之後做 mobile push / email digest：再加一個 Notifier，throttle 規則獨立配置
- ✅ 想做「critical 才打電話」：未來 `TwilioNotifier` 加進來即可
- ✅ 升級到路線 C：`notification_log` jsonb 直接拆成獨立 `ops_notifications` 表，舊資料保留

---

## 7. Dashboard UI 規格

> **設計原則**：主內容**淺色**降低長時間盯視疲勞；sidebar **深色**保持資訊密度與既有 next-admin 設計一致。所有色票一次定，未來換 logo/品牌不影響資訊層級。

### 7.1 路由

| URL | 用途 | 受 middleware 保護 | role |
|---|---|---|---|
| `/ops/inbox` | 列表頁（依 status / severity / source 篩選） | ✅ | viewer 唯讀；operator+ 可動作 |
| `/ops/inbox/[id]` | 詳情頁（raw + 診斷 + 動作） | ✅ | viewer 唯讀；operator+ 可動作 |
| `/api/ai/auto-classify` | Tier 1 背景分類（Gemini Flash） | ✅（matcher 含 `/api/ai/`） | server only（從 webhook handler fire-and-forget） |
| `/api/ai/save-diagnosis` | 貼回 AI 結論的 server action endpoint | ✅ | operator+ |
| `/api/ops/inbox/health` | 健康檢查（最近 24h 收件數、Gemini 配額） | ✅ | viewer+ |

對外網址：`https://app.aware-wave.com/ops/inbox`

### 7.2 視覺色票（30 年定一次，後面只動值不動 token 名）

```css
/* light theme（main content）*/
--bg-canvas:        #f8fafc;   /* 整頁背景 */
--bg-card:          #ffffff;   /* 卡片底 */
--border-subtle:    #e5e7eb;   /* 卡片邊 / 分隔線 */
--text-primary:     #0f172a;   /* 主文字 */
--text-secondary:   #64748b;   /* 次文字、metadata */
--text-muted:       #94a3b8;   /* 灰階 placeholder */

/* dark sidebar（保留既有 next-admin 風格）*/
--sidebar-bg:       #0b0d12;
--sidebar-text:     #e2e8f0;
--sidebar-text-muted:#94a3b8;
--sidebar-active:   #1e293b;   /* active item 背景 */
--sidebar-badge-bg: #dc2626;

/* severity（同時用在 sidebar badge / 卡片左邊條 / 標籤 chip）*/
--severity-critical:#dc2626;   /* red-600 */
--severity-high:    #ea580c;   /* orange-600 */
--severity-medium:  #ca8a04;   /* yellow-600 */
--severity-low:     #0284c7;   /* sky-600 */

/* AI summary（Gemini）區塊 */
--ai-bg:            #e0f2fe;   /* sky-100 */
--ai-text:          #0369a1;   /* sky-700 */
--ai-icon:          #0284c7;

/* 主動作按鈕（filled）*/
--btn-primary-bg:   #2563eb;   /* blue-600 */
--btn-primary-hover:#1d4ed8;
--btn-primary-text: #ffffff;

/* 次動作按鈕（outlined）*/
--btn-secondary-bg: #ffffff;
--btn-secondary-border:#cbd5e1;
--btn-secondary-text:#0f172a;

/* status pills */
--status-resolved:  #16a34a;   /* green-600 */
--status-ignored:   #6b7280;
```

> **a11y**：所有 severity / 狀態都同時有 **顏色 + 文字 + icon** 三重訊號（不只靠顏色）。

### 7.3 Sidebar 整合（修改既有 `app/layout.tsx`）

把 inbox 加進 `Overview` section，位置：`Ops Console v1` 之後、`API Health` 之前。

```diff
   <div className="sidebar-section">
     <div className="sidebar-section-label">Overview</div>
     <Link href="/" className="sidebar-link">
       <span className="icon">◈</span> Dashboard
     </Link>
     <Link href="/ops-console" className="sidebar-link">
       <span className="icon">▣</span> Ops Console v1
     </Link>
+    <Link href="/ops/inbox" className="sidebar-link">
+      <span className="icon">📥</span> Ops Inbox
+      {/* 徽章在 client component 渲染，避免 layout 變 dynamic */}
+      <OpsInboxBadge />
+    </Link>
     <Link href="/api-check" className="sidebar-link">
       <span className="icon">⬡</span> API Health
     </Link>
```

`OpsInboxBadge` 是 client component，每 30 秒打 `/api/ops/inbox/health` 取 `{ critical, high }`，顯示紅色（critical）或黃色（high）徽章。**沒有 incident 時整個徽章不渲染**（避免空圈圈視覺噪音）。

### 7.4 列表頁佈局（mockup 對照）

> Mockup 圖：`assets/ops-inbox-list.png`（淺色主內容 + 深色 sidebar）

```txt
┌──────────────┬──────────────────────────────────────────────────────┐
│              │  Ops Inbox                          [All|Open|Ack..]  │
│  [logo]      │  Unified incident inbox …            [Search] [⟲]    │
│              ├──────────────────────────────────────────────────────┤
│  Overview    │  ┌─ Card ──┐  ┌─ Card ──┐                            │
│  ▸ Dashboard │  │ CRITICAL│  │ HIGH    │   2 cols (>=1024px)        │
│  ▸ Ops Conso │  │ ...     │  │ ...     │   1 col  (<1024px)         │
│  ▸ Ops Inbox │  └─────────┘  └─────────┘                            │
│    [12 red]  │  ...                                                 │
│  ▸ API Heal  │                                                      │
│              │                                                      │
│  Services    │                                                      │
│  ▸ n8n       │                                                      │
│  ▸ Kuma      │                                                      │
│              │                                                      │
│  USER admin  │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

**頂部 toolbar**：

| 元件 | 行為 |
|---|---|
| 標題 + 副標 | static |
| Filter chips：`All` / `Open` / `Acknowledged` / `Resolved` | URL searchParam `status=`，server 重新查 |
| Severity filter：`All` / `Critical+High` / `Critical only` | URL searchParam `severity=` |
| Source filter（multi-select dropdown）| URL searchParam `source=sentry,grafana` |
| Search box | full-text on `title` + `message`，去抖 300ms |
| `⟲ Refresh` | router.refresh() |

**Incident card 結構**：

```txt
┌───────────────────────────────────────────────────────────┐
│ ▎ [Severity chip] [Source chip] [service tag] [env tag]  │  ← 左 4px 邊條 = severity 顏色
│ ▎                              [time ago] [✓ ack] (opt)  │
│ ▎                                                         │
│ ▎ Bold title here, max 2 lines                            │
│ ▎                                                         │
│ ▎ ✨ Gemini: <one_line_summary>           ← 淡 cyan 區塊   │
│ ▎ Suggested: <action hint>                                │
│ ▎                                                         │
│ ▎ Occurrences: 47                                         │
│ ▎ [Open in Cursor]  [Ask ChatGPT]  [Ask Claude]          │  ← 第 1 顆 filled blue，其餘 outlined
└───────────────────────────────────────────────────────────┘
```

**狀態的視覺差異**：

| Status | 卡片視覺 |
|---|---|
| `open` | 100% 不透明、左邊條鮮明、按鈕全亮 |
| `investigating` | 100% 不透明、加 `🔧 in progress` pill |
| `resolved` | 50% 透明 + `✓ resolved` 綠 pill；預設**不顯示**（filter 切到 Resolved 才出現） |
| `ignored` | 30% 透明 + `⊘ ignored` 灰 pill；預設**不顯示** |

**互動**：

| 元素 | 行為 |
|---|---|
| 點卡片空白處 | 跳 `/ops/inbox/[id]` |
| 點按鈕 | 對應行為（不冒泡到 row click） |
| Hover | 卡片陰影由 `0 1px 2px` → `0 4px 12px`，cursor pointer |
| 鍵盤 | `Tab` 走 card → buttons；`Enter` on card = 進 detail；`R` shortcut = mark resolved |

### 7.5 詳情頁佈局（mockup 對照）

> Mockup 圖：`assets/ops-inbox-detail.png`

12-column grid，左主右側（main 8 / aside 4）；< 1024px 時 stack：

```txt
┌──────────────┬──────────────────────────────────────────────────────┐
│  sidebar     │  Breadcrumb：Ops Inbox › INC-2026-0427-014           │
│              │  ────────────────────────────────────────────        │
│              │  H1 Title                  [Acknowledge][Resolve]    │
│              │  [severity][src][service][env] · Opened 2m ago       │
│              ├───────────────────────────────┬──────────────────────┤
│              │ MAIN (col-8)                  │ ASIDE (col-4)        │
│              │                               │                      │
│              │ ┌── ✨ AI Summary ─────────┐  │ ┌── Service ──────┐  │
│              │ │ Gemini Flash auto card  │  │ │ name / type /   │  │
│              │ └─────────────────────────┘  │ │ repo / url /host│  │
│              │                               │ └─────────────────┘  │
│              │ ── Action - Choose your AI ── │ ┌── Occurrences ──┐  │
│              │ [Cursor][ChatGPT][Claude][Gem]│ │ 47 ×, sparkline │  │
│              │                               │ │ fp:abc12345     │  │
│              │ ── AI Diagnosis Timeline ──   │ └─────────────────┘  │
│              │ • Gemini auto 12:48           │ ┌── Notify Log ───┐  │
│              │ • ChatGPT USER 12:51 (paste)  │ │ ✓ #ops-incidents│  │
│              │ • Cursor USER 12:55 (in prog) │ │ ✓ Slack         │  │
│              │ [Paste AI conclusion ...] [💾]│ │ ⊘ Email throttle│  │
│              │                               │ └─────────────────┘  │
│              │ ▸ Raw payload (collapsed)     │                      │
│              │                               │                      │
└──────────────┴───────────────────────────────┴──────────────────────┘
```

**Action 按鈕區（4 顆，依 §8.4 排序）**：

| service.type | 第 1 顆（filled blue） | 第 2 顆 | 第 3 顆 | 第 4 顆 |
|---|---|---|---|---|
| `local-repo` | `Open in Cursor →` | `Ask ChatGPT` | `Ask Claude` | `Ask Gemini Pro` |
| `remote-ui-n8n` | `Open n8n UI →` | `Ask Claude` | `Ask ChatGPT` | `Ask Gemini Pro` |
| `remote-ui-supabase` | `Open Studio →` | `Ask Claude` | `Ask ChatGPT` | `Ask Gemini Pro` |
| `service = null` | `Ask Claude →` | `Ask ChatGPT` | `Ask Gemini Pro` | `Open in Cursor`（disabled，hint：「無 repo 對應」） |

**Timeline 視覺**：左側 vertical line + dots，每筆是一張小卡，依 provider 著色（Gemini = sky-cyan、ChatGPT = green、Claude = purple、Cursor = blue）。

**「貼回 AI 結論」textarea**：

```tsx
<form action={saveDiagnosis}>
  <select name="provider">
    <option value="chatgpt">ChatGPT</option>
    <option value="claude">Claude</option>
    <option value="cursor">Cursor</option>
    <option value="other">Other</option>
  </select>
  <textarea name="summary" placeholder="Paste AI conclusion here..." />
  <button type="submit">Save diagnosis</button>
</form>
```

server action 把這筆 push 進 `ai_diagnoses[]`，role = `'manual-paste'`，`created_by` = 從 `readOpsRole()` 取的角色。

**狀態動作（top-right）**：

| 按鈕 | 行為 | 必要 role |
|---|---|---|
| `Acknowledge` | status `open` → `investigating`；Slack thread 回 ✋ react | operator+ |
| `Mark resolved` | status → `resolved`，填 `resolved_at` / `resolved_by` | operator+ |
| `Mark ignored` | status → `ignored`（dropdown 內，避免誤點） | operator+ |
| `Reopen` | 只在 `resolved`/`ignored` 時顯示，回 `open` 並 `reopen_count++`，重發 `reopen` 通知 | operator+ |

### 7.6 Status / Transition 狀態機（30 年都一樣）

```txt
                   ┌──────────────┐
       webhook →   │   open       │ ──[ack]──→ investigating
                   └──────┬───────┘                 │
                          │                         │
                       [resolve]                 [resolve]
                          │                         │
                          ▼                         ▼
                   ┌──────────────┐          ┌──────────────┐
                   │  resolved    │ ◀────────│  resolved    │
                   └──────┬───────┘          └──────────────┘
                     [reopen 或 webhook 同 fingerprint 重來]
                          │
                          ▼
                       open（reopen_count++、發 'reopen' 通知）

       open / investigating ─[mark ignored]─→ ignored （隱藏，不發通知）
```

| Transition | 觸發 | 通知規則（§6.6.4） |
|---|---|---|
| `*` → `open`（初次建立） | webhook 第一次 | `new_incident_first_occurrence` |
| `open/investigating` 嚴重度升級 | webhook 帶來更高 severity | `severity_escalation` |
| `resolved/ignored` → `open` | webhook 又收到 / 手動 reopen | `reopen` |
| `open/investigating` → `resolved` | UI 動作 | 不發 |
| 任何 → `ignored` | UI 動作 | 不發 |

### 7.7 RBAC（沿用既有 `lib/ops-role.ts`）

```ts
// 加在 lib/ops-role.ts（既有檔，加新導出函式即可）
export function canTriggerAiDiagnose(role: OpsRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'operator';
}
export function canModifyIncidentStatus(role: OpsRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'operator';
}
```

| Role | 可看 | 可改 status | 可觸發 AI / 開 Cursor | 可看 raw payload |
|---|---|---|---|---|
| `owner`、`admin`、`operator` | ✅ | ✅ | ✅ | ✅ |
| `viewer` | ✅ | ❌（按鈕 disabled + tooltip） | ❌ | ✅ |

> **必須在 page Server Component 內呼叫 `readOpsRole(headers())`** 後決定 props 傳給 client component（按鈕的 `disabled` 屬性），不能只靠前端 hide。

### 7.8 載入 / 錯誤 / 空狀態

| 狀態 | UI |
|---|---|
| 初次載入 | skeleton 5 張卡（淺灰矩形脈動） |
| 沒有 incident | 大 illustration + 「All clear · 過去 24h 沒有未處理事件」 + 「上次同步：3s ago」 |
| Supabase 連不上 | 紅色 banner「無法連線到 Supabase（service role key 失效？）」+ 重試按鈕 |
| Webhook ingest token 401 | 不會出現在 UI（webhook 寄送方會看到），但 `/api/ops/inbox/health` 顯示 `last_401_at` |
| Gemini quota 已耗盡 | AI summary 區塊顯示 「Auto-classification disabled（today's free quota used）」灰色文字 |

### 7.9 響應式

| 寬度 | 列表 | 詳情 |
|---|---|---|
| ≥1280px | 卡片 2 欄 | main 8 / aside 4 grid |
| 1024–1279px | 卡片 2 欄 | main 8 / aside 4 grid |
| 768–1023px | 卡片 1 欄 | main 上、aside 下 |
| <768px | 卡片 1 欄、按鈕收進 `⋮` 選單 | 同上、aside 折疊成 accordion |

> 路線 B 不做行動裝置優化（§15 #7），但「不會壞」（按鈕收得進選單就好）。

---

## 8. AI Dispatch 設計（訂閱優先架構）

### 8.0 成本模型（最關鍵的設計決策）

你已經月付 **$60/月** 訂閱（Claude Pro $20 + ChatGPT Plus $20 + Cursor Pro $20）。這些訂閱**不能透過 API 觸發**，只能在各自的 chat UI / Cursor IDE 內使用。

→ **如果再接 OpenAI / Anthropic API，會被收第二次錢**。

路線 B 的設計原則：

```txt
零 API 邊際成本 = 已經付的訂閱用滿；新增成本只用「免費額度」
```

**三軌制**：

| 軌 | 用途 | 走哪個 AI | 成本 |
|---|---|---|---|
| **Tier 1 自動分類**（背景） | 每筆 incident 自動跑 1 句摘要 + 分類 | Google Gemini API（Free Tier，1500 req/day） | **$0** |
| **Tier 2 深度診斷**（你點按鈕） | 你想要 ChatGPT / Claude 認真分析時 | 開新分頁去 chatgpt.com / claude.ai，prompt 放剪貼簿 | **$0**（吃 Plus / Pro 訂閱） |
| **Tier 3 直接修**（你點按鈕） | 要動 code | `cursor://` deeplink → Cursor IDE | **$0**（吃 Cursor Pro） |

→ **完全不需要 OPENAI_API_KEY、不需要 ANTHROPIC_API_KEY**，只要一支 GOOGLE_API_KEY（free tier）。

> Copilot 訂閱是 IDE 內補完，不在 dashboard 流程內，自動在你跳到 Cursor 後待命。

### 8.1 Tier 1：背景自動分類（Gemini Free API）

每筆**新** incident 入庫後，fire-and-forget 呼叫 Gemini Flash：

```ts
// 模型：gemini-2.0-flash（免費額度 1500 req/day，每筆 < 1000 tokens）
// 用途：給 inbox 列表一個 1 行人話摘要 + 行動建議
{
  is_actionable: boolean,        // 是不是需要處理（過濾雜訊）
  guessed_category: string,      // 'code-bug' | 'config' | 'infra' | 'transient' | 'business'
  one_line_summary: string,      // 中文一句話：「Next.js cart 頁 product undefined，疑似 race」
  recommended_ai: string,        // 'chatgpt' | 'claude' | 'cursor'（決定按鈕順序）
}
```

結果寫進 `ai_diagnoses[0]`，列表顯示 `one_line_summary`，按鈕順序依 `recommended_ai` 排序。

**Free tier 護欄**：在 webhook handler 裡計數，每天超過 1400 次（保留 100 次緩衝）就不再呼叫，列表回退顯示原始 `title`。

### 8.2 Tier 2：深度診斷按鈕（吃訂閱）

每筆 incident 在列表 / detail 頁有 **3 顆按鈕**（依 §8.4 推薦順序，第一顆有 highlight）：

| 按鈕 | 行為 | 用到的訂閱 |
|---|---|---|
| `[Ask ChatGPT]` | 1. prompt 複製到剪貼簿 → 2. 開新分頁 `https://chatgpt.com/` → 3. toast「已複製，按 Cmd+V 貼」 | ChatGPT Plus |
| `[Ask Claude]` | 1. prompt 複製到剪貼簿 → 2. 開新分頁 `https://claude.ai/new` → 3. toast 同上 | Claude Pro |
| `[Open in Cursor]` | `cursor://anysphere.cursor-deeplink/prompt?text=<encoded>` | Cursor Pro |

> **為什麼用「複製 + 開分頁」而不是 URL 帶參數**：ChatGPT / Claude 的 URL prompt 參數會隨更新失效；剪貼簿方法 100% 可靠且未來不會壞。
> **回填**：detail 頁底下有一個「貼回 AI 結論」textarea + `[Save]`，把你看完 chat UI 的回覆貼回來，存進 `ai_diagnoses` 陣列（手動，不自動）。

### 8.3 Tier 3：跳 Cursor 直接修

`[Open in Cursor]` 不只是「問建議」，而是**把整包 incident context 連同建議的工作目錄、檔案路徑塞進 prompt**，讓 Cursor Agent 在本地 repo context 下動手修。

詳見附錄 A 的 `buildCursorDeeplink()` 模板。

### 8.4 推薦順序（決定按鈕排列）

由 Tier 1 的 `recommended_ai` 欄位決定，邏輯：

| signal_type | severity | 第一顆按鈕（highlight） | 第二顆 | 第三顆 |
|---|---|---|---|---|
| `error` | any | `[Open in Cursor]` | `[Ask ChatGPT]` | `[Ask Claude]` |
| `error` | critical | `[Ask Claude]` | `[Open in Cursor]` | `[Ask ChatGPT]` |
| `uptime` | any | `[Ask Claude]` | `[Open in Cursor]` | `[Ask ChatGPT]` |
| `latency` | any | `[Ask Claude]` | `[Open in Cursor]` | `[Ask ChatGPT]` |
| `resource` | any | `[Ask Claude]` | `[Open in Cursor]` | `[Ask ChatGPT]` |
| `business` | any | `[Ask Claude]` | `[Ask ChatGPT]` | `[Open in Cursor]` |
| `deployment` | any | `[Open in Cursor]` | `[Ask ChatGPT]` | `[Ask Claude]` |

理由：
- **程式碼相關（error / deployment）** → Cursor 第一，因為它能看 repo
- **架構/系統思考（uptime / latency / resource）** → Claude 第一，它擅長這個
- **商業指標** → Claude 第一，但 Cursor 退到第三（多半不是 code 問題）

### 8.5 Copilot 怎麼用？

Copilot 不在 dashboard 流程內。當你點 `[Open in Cursor]` 跳到 IDE 後，Copilot 在編輯器裡自然待命做 inline 補完。**dashboard 不主動呼叫 Copilot**。

### 8.6 為什麼這個架構不會崩

- **不需要 budgetGuard**：Tier 1 用 Gemini free quota，Tier 2/3 完全沒有 token-based 收費
- **不需要 API key 輪替**：Plus/Pro 訂閱掛在你帳號上，不會洩露
- **未來換 AI 不痛**：要換成本地模型只要改 `[Open in Cursor]` 的 deeplink；想接 API 只要新增一顆 `[Auto-diagnose]` 按鈕
- **如果 Gemini free 額度不夠**：升級到 Gemini Pro 訂閱（$20/月）或關掉 Tier 1，列表退回顯示原始 title

---

## 9. 實作計畫（5 天）

> 每天結束都要可 demo。**不允許跨天的「半成品」**。

### Day 1：基礎建設 + 資料層 + 1 個 webhook

> **Day 1 第一個 commit（< 15 行 diff）**：先把 §0.1.4 的 3 個既有檔小改 + migration 推上去。這個 commit 過了 CI 才開始寫 webhook 程式碼，避免功能 commit 被基礎問題卡住。

#### Day 1 上半（基礎建設 commit）

- [ ] 改 `apps/next-admin/middleware.ts`：matcher 擴成 `["/api/ops/:path*", "/ops/:path*", "/api/ai/:path*"]`
- [ ] 改 `apps/next-admin/tsconfig.json`：加 `"baseUrl": "."` 與 `"paths": { "@/*": ["./*"] }`
- [ ] 改 `apps/next-admin/app/layout.tsx`：sidebar 加 `Ops Inbox` 連結（§7.3 diff）
- [ ] 改 `apps/next-admin/lib/ops-role.ts`：加 `canTriggerAiDiagnose` / `canModifyIncidentStatus` 兩個導出函式（§7.7）
- [ ] 新增 `lobster-factory/packages/db/migrations/0013_ops_inbox.sql`（§5 完整 SQL）
- [ ] 在 Supabase awarewave 跑這支 migration（用既有 supabase CLI 或 Studio）
- [ ] 確認 §0.1 Day 0 readiness checklist 全綠
- [ ] **驗收**：`/ops-console` 仍正常打開（既有功能不壞）；`/ops/inbox` 回 404（route 還沒建，正確）；DB 有 `ops_incidents` 與 `ops_inbox_gemini_quota` 兩表

#### Day 1 下半（第一支 webhook commit）

- [ ] 新增 `apps/next-admin/lib/ops-inbox/types.ts`（§5.1）
- [ ] 新增 `apps/next-admin/lib/ops-inbox/{verifyIngestToken,redactSecrets,fingerprint,transition}.ts`
- [ ] 新增 `apps/next-admin/lib/ops-inbox/registry/{services,sourceMapping}.ts`（§6.5）
- [ ] 新增 `apps/next-admin/lib/ops-inbox/normalize/sentry.ts`
- [ ] 新增 `apps/next-admin/app/api/webhooks/sentry/route.ts`（§6.3 兩段式 upsert）
- [ ] 把 `OPS_INBOX_INGEST_TOKEN` 加進 DPAPI vault + `mcp/user-env.template.ps1`
- [ ] 在 Sentry 後台加一個 Internal Integration，指向這個端點（§0.1.5）
- [ ] **驗收**：
  - Sentry 故意丟一個 test error，DB `ops_incidents` 有一筆 row
  - 同 fingerprint 重複觸發 5 次：DB 仍只 1 筆，`occurrence_count = 5`
  - 帶錯 token 打 webhook：401

### Day 2：剩下 4 個 webhook + 去重

- [ ] `/api/webhooks/uptime-kuma`
- [ ] `/api/webhooks/grafana`
- [ ] `/api/webhooks/netdata`
- [ ] `/api/webhooks/posthog`
- [ ] 共用的 `redactSecrets(payload)` 函式（藍圖 §6.2 的子集）
- [ ] 去重測試：同一個 fingerprint 連送 5 次，DB 只有 1 筆且 `occurrence_count=5`
- [ ] **驗收**：5 個來源各跑一次測試 webhook，inbox 表收到 5 筆。

### Day 3：Dashboard UI（純列表 + 篩選）

- [ ] `/ops/inbox/page.tsx` Server Component（列表）
- [ ] `/ops/inbox/[id]/page.tsx` Detail 頁
- [ ] 篩選器：source / status / severity
- [ ] `[Mark resolved]` / `[Mark ignored]` action（Server Action）
- [ ] `[Cursor]` 按鈕（純 deeplink，不呼叫 API）
- [ ] **驗收**：能看到 Day 2 那 5 筆事件，能改狀態、能跳 Cursor。

### Day 4：AI 三軌制（訂閱優先）

- [ ] `lib/ops-inbox/ai/gemini.ts`：呼叫 Gemini Flash free API 的 wrapper（**唯一的 SDK 依賴**）
- [ ] `/api/ai/auto-classify/route.ts`：接 incident_id，跑 Tier 1 分類，寫回 `ai_diagnoses[0]`
- [ ] Webhook handler 在 upsert 完 fire-and-forget call auto-classify
- [ ] Free tier 每日計數器：`ops_inbox_gemini_quota` 表 + `ops_inbox_gemini_quota_increment(p_max)` RPC（§5）；`OPS_INBOX_GEMINI_DAILY_LIMIT=1400` 停呼
- [ ] `lib/ops-inbox/dispatch/buildClipboardPrompt.ts`：產生給 ChatGPT/Claude 的 prompt 字串（含 incident context + 角色提示）
- [ ] `lib/ops-inbox/dispatch/buildCursorDeeplink.ts`：見附錄 A
- [ ] Client component：3 顆按鈕 + 剪貼簿 API（`navigator.clipboard.writeText`）+ 開新分頁 + toast
- [ ] Detail 頁的「貼回 AI 結論」 textarea + Server Action `saveAiDiagnosis`
- [ ] **驗收**：
  - 新 incident 進來 1–3 秒內 inbox 列表顯示 Gemini 摘要
  - 點 `[Ask ChatGPT]` → 剪貼簿有 prompt + 開了 chatgpt.com 新分頁
  - 點 `[Ask Claude]` → 剪貼簿 + 開 claude.ai
  - 點 `[Open in Cursor]` → 本地 Cursor 開了一個帶 context 的 chat
  - 貼回結論能存入 `ai_diagnoses` 並在 detail 頁顯示

### Day 5：通知層（Notifier 抽象 + 兩層拓撲）+ 收斂

> 對齊 §6.6 的 30-year 決策。**先做抽象，再做 Slack 實作**——這樣未來換通道零成本。

- [ ] 手動建立 Slack `#ops-incidents` 頻道 + 產生專屬 webhook（§12.1 步驟）
- [ ] `lib/ops-inbox/notify/types.ts` — `Notifier` interface + `NotificationContext` / `NotificationResult`
- [ ] `lib/ops-inbox/notify/slack.ts` — `SlackNotifier` 實作（block kit message，含 fp 短碼）
- [ ] `lib/ops-inbox/notify/rules.ts` — `shouldNotify()` 實作 §6.6.4 規則表
- [ ] `lib/ops-inbox/notify/dispatcher.ts` — `dispatchNotifications()` 跑所有 Notifier、寫 `notification_log`
- [ ] Webhook handler upsert 後 fire-and-forget call dispatcher（不阻塞 webhook 回應）
- [ ] L2 throttle：同 fingerprint 15 分鐘內第二次起不發（severity 升級例外）
- [ ] critical → message 含 `<!here>`
- [ ] `OPS_INBOX_NOTIFY_ENABLED=false` 時 dispatcher 直接 short-circuit（仍寫 log，標 `status: throttled, reason: globally_disabled`）
- [ ] 寫一份 `docs/ops-inbox-runbook.md`（給未來的自己怎麼用，含「換通道 SOP」）
- [ ] 把所有 webhook URL + token 文件化進 `agency-os/.../REMOTE_WORKSTATION_STARTUP.md` 與 `credentials.md §18`
- [ ] **驗收**：
  - 跑完一輪 end-to-end —— Sentry 觸發 → `#ops-incidents` 收到（不是 #alerts-infra）→ 點連結進 inbox → 按 Diagnose → 看到 AI 診斷 → 按 Cursor 跳到本地修
  - 同一 fingerprint 短時間連觸 5 次：`#ops-incidents` 只收 1 條，`notification_log` 有 1 sent + 4 throttled
  - severity 從 medium 升到 critical：再發一條（含 `<!here>`），log 顯示 rule = `severity_escalation`
  - 設 `OPS_INBOX_NOTIFY_ENABLED=false` 後再觸發：`#ops-incidents` 不收，但 DB 有 incident + 有 throttle log
  - **#alerts-infra 完全沒收到 Inbox 發的訊息**（驗證兩層拓撲分流正確）

---

## 10. 檔案結構（與既有 codebase 對齊）

> **三條鐵律**：
> 1. Migration 走既有 `lobster-factory/packages/db/migrations/` numbered 慣例（**不**用 `supabase/migrations/`）
> 2. 型別**留在 `apps/next-admin/`**（不放 `packages/shared`，因為 `next.config.ts` 的 `outputFileTracingRoot` 鎖定 next-admin）
> 3. 所有 Inbox 程式碼集中在 `lib/ops-inbox/` 與 `app/{ops/inbox, api/webhooks, api/ai}/`

```txt
lobster-factory/
├── packages/db/migrations/
│   └── 0013_ops_inbox.sql                  # 唯一一支 migration（§5）
│
└── infra/hetzner-phase1-core/apps/next-admin/
    ├── middleware.ts                        # 改 matcher（§4.1 diff，純加路徑）
    ├── tsconfig.json                        # 加 paths: { "@/*": ["./*"] }（§0.1.4）
    ├── app/
    │   ├── layout.tsx                       # 加 1 行 sidebar link（§7.3 diff）
    │   ├── ops/
    │   │   └── inbox/
    │   │       ├── page.tsx                 # 列表（Server Component）
    │   │       ├── [id]/
    │   │       │   └── page.tsx             # 詳情（Server Component）
    │   │       ├── actions.ts               # Server Actions（updateStatus / saveDiagnosis / acknowledge / reopen）
    │   │       └── components/
    │   │           ├── IncidentCard.tsx
    │   │           ├── IncidentFilterBar.tsx
    │   │           ├── AiSummaryBlock.tsx
    │   │           ├── ActionButtons.tsx        # 主容器，依 service.type 排序
    │   │           ├── OpenInCursorButton.tsx   # client，pure deeplink
    │   │           ├── AskChatGPTButton.tsx     # client，剪貼簿 + 開新分頁
    │   │           ├── AskClaudeButton.tsx
    │   │           ├── OpenRemoteUIButton.tsx   # n8n / Studio
    │   │           ├── PasteAiResultBox.tsx     # 詳情頁
    │   │           ├── NotificationLogList.tsx
    │   │           ├── OpsInboxBadge.tsx        # sidebar 紅黃徽章（client）
    │   │           └── StatusActions.tsx        # Acknowledge / Resolve / Ignore / Reopen
    │   └── api/
    │       ├── webhooks/                    # 共用 dynamic [source] 也可以，這裡用 5 個獨立檔便於測試
    │       │   ├── sentry/route.ts
    │       │   ├── uptime-kuma/route.ts
    │       │   ├── grafana/route.ts
    │       │   ├── netdata/route.ts
    │       │   └── posthog/route.ts
    │       ├── ai/
    │       │   ├── auto-classify/route.ts   # 背景 Gemini Flash（webhook fire-and-forget）
    │       │   └── save-diagnosis/route.ts  # 詳情頁 Server Action 端點
    │       └── ops/
    │           └── inbox/
    │               └── health/route.ts      # /api/ops/inbox/health（受 middleware 保護）
    └── lib/
        ├── supabase-server.ts               # 既有，**不動**
        ├── ops-role.ts                      # 既有，**加 2 個導出函式**（§7.7）
        ├── ops-contracts.ts                 # 既有，不動
        └── ops-inbox/                       # 新增資料夾
            ├── types.ts                     # Incident / IncidentDraft / AiDiagnosis ...（§5.1）
            ├── fingerprint.ts               # computeFingerprint（§6.4.1）
            ├── redactSecrets.ts             # 移除 password / token / cookie 欄位
            ├── verifyIngestToken.ts         # OPS_INBOX_INGEST_TOKEN Bearer 驗證
            ├── normalize/
            │   ├── sentry.ts
            │   ├── uptime-kuma.ts
            │   ├── grafana.ts
            │   ├── netdata.ts
            │   └── posthog.ts
            ├── transition.ts                # computeTransition / maxSeverity（§6.3）
            ├── ai/
            │   ├── gemini.ts                # @google/generative-ai wrapper（唯一新 SDK）
            │   ├── quotaGuard.ts            # 走 ops_inbox_gemini_quota_increment RPC
            │   ├── triggerAutoClassify.ts   # fire-and-forget POST /api/ai/auto-classify
            │   └── recommendOrder.ts        # 三軌按鈕排序邏輯（§8.4）
            ├── dispatch/
            │   ├── buildPrompt.ts           # 共用 prompt（依 service.type 動態，附錄 A.1）
            │   ├── buildCursorDeeplink.ts   # 附錄 A.2
            │   └── buildRemoteUiUrl.ts      # n8n / Studio
            ├── notify/                      # §6.6 兩層拓撲與 Notifier 抽象
            │   ├── types.ts                 # Notifier interface
            │   ├── slack.ts                 # SlackNotifier 實作
            │   ├── rules.ts                 # shouldNotify（§6.6.4 規則表）
            │   └── dispatcher.ts            # dispatchNotifications + notification_log
            └── registry/
                ├── services.ts              # SERVICE_REGISTRY（§6.5）
                └── sourceMapping.ts         # 各來源 → SERVICE_REGISTRY key（§6.4.2）
```

> 共 **42 個新檔 + 3 個既有檔小改**（middleware.ts、tsconfig.json、layout.tsx、ops-role.ts 加導出）。
> **Day 1 第一個 commit 只做 3 個既有檔改 + migration**，其他全部新檔放後面 commit。

---

## 11. Cursor Task 拆解（給 AI agent 接力用）

> 每個 task 是一個 prompt，可以直接丟給 Cursor Agent 或開新 chat 執行。

### Cursor Task B-1：資料層 + 標準化器

```markdown
# TASK B-1: Build Ops Inbox database & normalizers

## Goal
Build the foundation: migration（既有 numbered 慣例）, TypeScript types（住 next-admin 內），
5 source-specific normalizers, fingerprint / redact / verify-token utilities.

## 動工前檢核（§0.1）
- [ ] §0.1.1 環境變數已就位
- [ ] §0.1.4 三個既有檔（middleware.ts / tsconfig.json / layout.tsx）已先改完並 commit
- [ ] §0.1.3 路徑/命名衝突 grep 結果為 0

## Files to create
- lobster-factory/packages/db/migrations/0013_ops_inbox.sql      （§5 完整 SQL）
- apps/next-admin/lib/ops-inbox/types.ts                          （§5.1）
- apps/next-admin/lib/ops-inbox/normalize/{sentry,uptime-kuma,grafana,netdata,posthog}.ts
- apps/next-admin/lib/ops-inbox/{fingerprint,redactSecrets,verifyIngestToken,transition}.ts
- apps/next-admin/lib/ops-inbox/registry/{services,sourceMapping}.ts

## Schema
參考 docs/Ops_Observability_PathB_Plan.md §5。**不要**用 `supabase/migrations/<timestamp>` 格式。
**不要**把 type 放 `packages/shared/`（§4.2 衝突檢核已說明）。

## Normalizers
每個 source 一個純函式：
  normalize<Source>(raw: unknown): IncidentDraft

依 §6.4 對應表處理 external_id / severity / service / environment。
fingerprint **不要在 normalizer 內算**，由 webhook handler 統一呼叫 §6.4.1 的 `computeFingerprint`。

## Acceptance
- Migration 在 Supabase awarewave 跑得過（兩張表 + RPC + 6 個 index + RLS enabled）
- 5 個 normalizer 各有 vitest，用 §附錄 C 的真實 payload sample
- TypeScript 編譯通過（`tsc --noEmit`）
- 既有 lib（supabase-server.ts、ops-role.ts、ops-contracts.ts）**0 行修改**（B-1 不該動既有檔）
- `npm run dev` 啟動後 `/ops-console` 仍正常（不破壞既有 UI）
```

### Cursor Task B-2：Webhook 端點 + Dashboard UI

```markdown
# TASK B-2: Build webhook routes & inbox dashboard UI

## Prerequisites
Task B-1 已完成。

## Files to create
- apps/next-admin/app/api/webhooks/{sentry,uptime-kuma,grafana,netdata,posthog}/route.ts
- apps/next-admin/app/ops/inbox/page.tsx
- apps/next-admin/app/ops/inbox/[id]/page.tsx
- apps/next-admin/app/ops/inbox/components/IncidentRow.tsx
- apps/next-admin/app/ops/inbox/components/StatusFilter.tsx
- apps/next-admin/app/ops/inbox/components/MarkResolvedButton.tsx
（AI 三軌按鈕在 Task B-3，Day 4 才做）

## Webhook 通用邏輯
參考 §6.3 流程。先驗 Bearer，再 normalize，再 upsert。

## Dashboard
- 列表用 Server Component
- Filter 用 URL searchParams
- Action 用 Server Action（updateStatus、markResolved）
- Cursor button 用 client component（純 deeplink）

## Acceptance
- 5 個 webhook 端點都能收 test payload 並落表
- 去重正常（fingerprint 重複只增加 occurrence_count）
- Inbox 頁能列出所有 open incident
- Detail 頁能看到 raw payload
```

### Cursor Task B-3：AI Dispatch + Slack

```markdown
# TASK B-3: Wire up multi-AI dispatch & Slack notifications

## Prerequisites
Task B-1, B-2 已完成。

## Files to create
- apps/next-admin/lib/ops-inbox/ai/gemini.ts                   # 唯一的 AI SDK wrapper
- apps/next-admin/lib/ops-inbox/ai/quotaGuard.ts               # Gemini free tier 每日計數
- apps/next-admin/app/api/ai/auto-classify/route.ts            # Tier 1 背景分類
- apps/next-admin/lib/ops-inbox/dispatch/buildClipboardPrompt.ts  # 給 ChatGPT/Claude 的提示文
- apps/next-admin/lib/ops-inbox/dispatch/buildCursorDeeplink.ts   # 見附錄 A
- apps/next-admin/lib/ops-inbox/dispatch/recommendOrder.ts        # §8.4 按鈕順序
- apps/next-admin/app/ops/inbox/components/AskChatGPTButton.tsx   # client component
- apps/next-admin/app/ops/inbox/components/AskClaudeButton.tsx
- apps/next-admin/app/ops/inbox/components/OpenInCursorButton.tsx
- apps/next-admin/app/ops/inbox/components/PasteAiResultBox.tsx   # detail 頁貼回
- apps/next-admin/lib/ops-inbox/slack/sendIncidentAlert.ts

## 重要：完全不要安裝 OpenAI / Anthropic SDK
- 不要 `npm install openai` 或 `@anthropic-ai/sdk`
- ChatGPT / Claude 完全走「剪貼簿 + 開新分頁」模式（吃使用者訂閱）
- Tier 1 自動分類用 Google Generative AI SDK（@google/generative-ai），免費額度

## Tier 1 自動分類流程
1. webhook handler upsert 完成後 → fire-and-forget POST /api/ai/auto-classify
2. quotaGuard 檢查當天 < 1400（Gemini free tier 上限 1500/day）
3. 呼叫 Gemini Flash，回傳 { is_actionable, guessed_category, one_line_summary, recommended_ai }
4. 寫入 incident.ai_diagnoses[0]，role = 'auto-classify'

## 三軌按鈕邏輯
- AskChatGPTButton：navigator.clipboard.writeText(prompt) + window.open('https://chatgpt.com/', '_blank') + toast
- AskClaudeButton：同上但開 https://claude.ai/new
- OpenInCursorButton：window.location.href = buildCursorDeeplink(incident)
- 三者排列順序由 recommendOrder(signal_type, severity) 決定（§8.4）

## 貼回 AI 結論
detail 頁的 PasteAiResultBox：
- textarea + provider select（chatgpt / claude / cursor / other）+ Save 按鈕
- Server Action 把結論 push 進 ai_diagnoses 陣列，role = 'manual-paste'

## Slack 通知（兩層拓撲，§6.6 是聖經）
- **完全不動既有 #alerts-infra**（Netdata / Kuma 直連繼續走那個頻道）
- **新開 `#ops-incidents`** 給 Inbox 用，env 走 `OPS_INBOX_SLACK_INCIDENTS_WEBHOOK`
- 寫 Notifier interface（`lib/ops-inbox/notify/`）：
  - `types.ts`（Notifier / NotificationResult）
  - `slack.ts`（SlackNotifier 實作）
  - `dispatcher.ts`（讀 NOTIFIERS[]、跑 throttle、寫 notification_log）
  - `rules.ts`（shouldNotify 判斷 §6.6.4 規則）
- 每次發送（成功 / 失敗 / 節流）都 append 一筆到 `incident.notification_log` jsonb
- Slack message 含：incident URL + 三軌按鈕 deeplink + severity emoji + `fp:<8碼>` 短碼
- critical → `<!here>`

## Acceptance
- 新 Sentry test event 進來：Slack 通知到 + 1 秒內 inbox 顯示 Gemini 摘要
- 點 [Ask ChatGPT] / [Ask Claude]：剪貼簿有 prompt + 新分頁打開
- 點 [Open in Cursor]：本地 Cursor 開了帶 context 的 chat
- 貼回結論後 detail 頁能看到時間軸新增一筆 manual-paste
- Gemini 當日 quota 達 1400 後不再呼叫，列表顯示原始 title fallback
- **完全不需要 OPENAI_API_KEY / ANTHROPIC_API_KEY**
```

---

## 12. 環境變數與密鑰

> **重要修正（v2.0）**：第一版 plan 寫 `OPS_INBOX_SUPABASE_URL` / `OPS_INBOX_SUPABASE_SERVICE_ROLE_KEY`，但 `apps/next-admin/lib/supabase-server.ts` 讀的是 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`。**Inbox 直接重用既有 client，不要再開第二套變數**——避免「正式環境裡兩個變數值不一致 → Inbox 寫去錯的 Supabase」這種 30 年災難。

### 12.1 變數清單（本機 + production VPS 都要對齊）

```ps1
# ───────────────────────────────────────────────────
# 既有，沿用（不重複設定）
# ───────────────────────────────────────────────────
SUPABASE_URL                      = "https://supabase.aware-wave.com"   # 既有
SUPABASE_SERVICE_ROLE_KEY         = "<...>"                              # 既有
GEMINI_API_KEY                    = "<...>"                              # 既有，Tier 1 共用
OPS_PROXY_SHARED_SECRET           = "<...>"                              # 既有，trusted-proxy auth 共用
NODE_ENV                          = "production"                         # production VPS

# ───────────────────────────────────────────────────
# Ops Inbox 路線 B 新增（一律 OPS_INBOX_ 前綴）
# ───────────────────────────────────────────────────
OPS_INBOX_INGEST_TOKEN            = "<32 字元隨機字串>"   # webhook 共享密鑰，自己產
OPS_INBOX_PUBLIC_URL              = "https://app.aware-wave.com"
OPS_INBOX_SLACK_INCIDENTS_WEBHOOK = "<新 #ops-incidents webhook URL>"
OPS_INBOX_SLACK_INCIDENTS_CHANNEL = "#ops-incidents"   # 顯示用，code 不依賴
OPS_INBOX_NOTIFY_ENABLED          = "true"             # 全域 kill switch
OPS_INBOX_GEMINI_ENABLED          = "true"
OPS_INBOX_GEMINI_DAILY_LIMIT      = "1400"             # Free tier 1500，留 100 緩衝
OPS_INBOX_POSTHOG_ENABLED         = "false"            # v1 預設關（§15 #8）
```

### 12.2 一次性 Slack 設定（手動 5 分鐘）

```txt
1. Slack workspace → Create channel → 名稱：ops-incidents
   - 描述：Curated incidents from Ops Inbox（已去重、含 AI 摘要）
   - Privacy：public（你 workspace 內公開即可）
2. 邀請自己進去，把舊的 #alerts-infra 訂閱者**不要**自動拉進來
   （這兩個頻道服務不同觀眾，分開訂閱）
3. https://api.slack.com/apps → 你既有的 App（Netdata 用的那個就可以）
   → Incoming Webhooks → Add New Webhook → 選 #ops-incidents
   → 複製 webhook URL → 寫進 OPS_INBOX_SLACK_INCIDENTS_WEBHOOK
4. AWARE_WAVE_CREDENTIALS.md §18 加一行：「#ops-incidents webhook（Ops Inbox 專用）」
5. UTF-8 smoke test：
   $body = @{ text = "ops-inbox 中文測試 ✅" } | ConvertTo-Json
   $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
   Invoke-RestMethod -Uri $env:OPS_INBOX_SLACK_INCIDENTS_WEBHOOK `
     -Method POST -Body $bytes -ContentType 'application/json; charset=utf-8'
```

### 12.3 Production deployment（SG VPS）env 同步流程

> **關鍵盲點**：本機 `setx` / `user-env.ps1` 只影響 driver 本機開發；production 的 next-admin 跑在 SG VPS 的 Docker 容器裡，**讀的是容器內 env file**，不會自動拿到本機 setx 的值。

| 方式 | 適用 | 怎麼做 |
|---|---|---|
| 即時改（推薦） | Inbox 上線後新增/輪換 token | 在 SG VPS：`vim /root/lobster-factory/<...>/.env.production` → 加變數 → `docker compose restart next-admin` |
| Compose 改檔 | 結構性改動（首次部署） | 把 `OPS_INBOX_*` 加進 `docker-compose.yml` 的 `env_file:` 或直接 `environment:` 段 |
| Cloudflare/Hetzner secret manager（之後升級用） | 路線 C 才做 | 路線 B 先用 `.env.production`（已被 .gitignore） |

**首次部署 checklist**：

- [ ] SSH 到 SG `5.223.93.113`
- [ ] 編輯 `/root/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/.env.production`
- [ ] 把 §12.1 所有 `OPS_INBOX_*` 變數寫進去（值與本機一致 → 用 driver 機 `[Environment]::GetEnvironmentVariable($name,'User')` 一個個讀出來貼）
- [ ] `docker compose -f /root/lobster-factory/.../docker-compose.yml up -d next-admin --force-recreate`
- [ ] `curl https://app.aware-wave.com/api/ops/inbox/health` 應回 200 + 配額狀態
- [ ] `curl -H "Authorization: Bearer $TOKEN" https://app.aware-wave.com/api/webhooks/sentry -d '{}'` 應回 200（test ingestion）

> **30-year invariant**：production 與本機的 `OPS_INBOX_*` 變數值**必須完全一致**。任何時候在本機 setx 新值也要同步到 VPS，否則開發/上線行為會分歧。在 driver 機加 commit hook 或 README 提醒：「動 `OPS_INBOX_*` → 同時 ssh 到 SG 改 `.env.production`」。

### 12.4 不需要的變數（明確不裝）

> 以下變數**永遠不要**出現在 Inbox 程式中，避免「不小心又付第二筆 API 錢」。

| ❌ 變數 | 為什麼 | 取代方案 |
|---|---|---|
| `OPENAI_API_KEY` | ChatGPT 走剪貼簿 + chatgpt.com，吃 Plus 訂閱 | `[Ask ChatGPT]` button |
| `ANTHROPIC_API_KEY` | Claude 走剪貼簿 + claude.ai，吃 Pro 訂閱 | `[Ask Claude]` button |
| `OPS_INBOX_AI_BUDGET_USD` | Tier 1 用 free tier、Tier 2/3 用訂閱，沒有 token 收費 | 直接刪掉 budgetGuard 概念 |
| `OPS_INBOX_SUPABASE_URL` | 第一版錯誤命名 | 用既有 `SUPABASE_URL` |
| `OPS_INBOX_SUPABASE_SERVICE_ROLE_KEY` | 第一版錯誤命名 | 用既有 `SUPABASE_SERVICE_ROLE_KEY` |
| `OPS_INBOX_GEMINI_API_KEY` | 沒必要再起一個別名 | 用既有 `GEMINI_API_KEY` |
| `CLERK_SECRET_KEY` | 不裝 Clerk | 沿用 `OPS_PROXY_SHARED_SECRET` |

> 升級到路線 C 才需要回頭加 OPENAI / ANTHROPIC API key（且只在那時候）。

---

## 13. 驗收標準（完成定義）

### 13.1 既有系統不退化（Day 1 第一個 commit 必過）

- [ ] `npm run build`（next-admin）通過
- [ ] `https://app.aware-wave.com/` 仍正常打開
- [ ] `https://app.aware-wave.com/ops-console` 仍正常打開
- [ ] `https://app.aware-wave.com/api-check` 仍綠燈
- [ ] 所有既有 `/api/ops/*` 路由行為不變（middleware 加 matcher 不影響既有路徑）
- [ ] `lib/supabase-server.ts` / `lib/ops-role.ts` / `lib/ops-contracts.ts` 既有導出**簽章不變**

### 13.2 功能性

- [ ] 5 個來源 webhook 都能收事件並落表（PostHog 視 §15 取捨；feature flag 關時 route 仍存在但回 503 + log）
- [ ] 同一 fingerprint 重複觸發只增加 `occurrence_count`，DB 仍只一筆
- [ ] Sentry payload 中 issue.id 用作 fingerprint（即使 title 改變仍正確去重）
- [ ] Inbox 列表頁能列出 / 篩選（status / severity / source / search） / 改狀態
- [ ] Detail 頁能看 raw + AI 診斷時間軸 + notification log
- [ ] Tier 1 自動分類（Gemini Flash）正常運作，每筆 1–3 秒內顯示摘要
- [ ] `[Ask ChatGPT]` / `[Ask Claude]` 能複製 prompt 並開正確分頁
- [ ] `[Open in Cursor]` 能跳到本地 Cursor 並帶 incident context（local-repo service）
- [ ] `[Open n8n UI]` / `[Open Studio]` 對 remote-ui service 能正確開頁（並把 prompt 放剪貼簿）
- [ ] 「貼回 AI 結論」能存進 `ai_diagnoses` 並在 timeline 顯示
- [ ] **狀態機正確**：webhook 同 fingerprint 從 medium → critical 觸發 `severity_escalation` 通知；resolved 後再進來觸發 `reopen` 通知（`reopen_count++`）
- [ ] 新 incident 自動發 Slack 通知到 **`#ops-incidents`**（不是 `#alerts-infra`）
- [ ] 同 fingerprint 15 分鐘內二次觸發**不重發**，但 `notification_log` 有 throttled 紀錄
- [ ] `OPS_INBOX_NOTIFY_ENABLED=false` 時不發 Slack（kill switch 有效）
- [ ] **`#alerts-infra` 完全沒被 Inbox 寫入過**（兩層拓撲驗證）
- [ ] Tier 1 quota 達 1400/天後不再呼叫 Gemini，列表 fallback 顯示原始 title

### 13.3 安全性（路線 B 級別）

- [ ] Webhook 缺 Bearer / 帶錯 token → 401
- [ ] `redactSecrets` 移除 password/token/api_key/cookie/Authorization 等欄位才入庫（vitest 覆蓋 10+ 種變形 key）
- [ ] Gemini 每日 quota guard 在 1400 次停呼（用 `ops_inbox_gemini_quota_increment` RPC 原子遞增）
- [ ] `viewer` role 進 `/ops/inbox` 看得到列表，但所有動作按鈕 `disabled`
- [ ] `viewer` 直接 `POST /api/ai/save-diagnosis` → 403
- [ ] 沒有 OpenAI / Anthropic API key 出現在 env / git / vault（grep 整 repo 0 結果）

### 13.4 可觀測性

- [ ] Tier 1 呼叫記 tokens（用 Gemini API 回傳的 usage metadata）寫進 `ai_diagnoses[].tokens`
- [ ] Webhook 失敗有 `console.error` + `Sentry.captureException`（沿用既有 `@sentry/nextjs`）
- [ ] `/api/ops/inbox/health` 回 `{ open_count, critical_count, gemini_quota_used, last_ingest_at, last_401_at, last_5xx_at }`
- [ ] sidebar 徽章與 `/api/ops/inbox/health` 數值一致（30 秒內收斂）

### 13.5 衝突檢核（§4.2 矩陣每行對應驗收）

- [ ] `middleware.ts` matcher 已擴；`/api/ops/*` 既有路由行為不變
- [ ] `lib/supabase-server.ts` 沒有被改動（`git diff` 為空）
- [ ] `lib/ops-role.ts` 只有「加導出」，原導出簽章不動
- [ ] `lib/ops-contracts.ts` 完全沒動
- [ ] `app/layout.tsx` 只新增 1 行 sidebar link，沒動其他 link
- [ ] `tsconfig.json` 只新增 `paths` / `baseUrl`，其他不動
- [ ] grep `OPS_INBOX_SUPABASE_` 整 repo → 0 行（避免錯誤命名重生）
- [ ] grep `OPENAI_API_KEY|ANTHROPIC_API_KEY` 在 `lib/ops-inbox/` → 0 行
- [ ] migration 只有 `0013_ops_inbox.sql` 一支，無 `supabase/migrations/` 目錄

### 13.6 升級可行性（為路線 C 鋪路）

- [ ] 表結構欄位**全部對齊藍圖** §7.2 / §7.3 命名
- [ ] `Notifier` interface 已寫，可在 < 100 行 LOC 內接入第 2 個通道（Discord / Email）做 PoC
- [ ] AI 呼叫紀錄 schema 對齊藍圖 §7.7（`ai_dispatch_runs`），未來可一支 migration 拆出
- [ ] 不引進與藍圖衝突的設計（例如不要自己發明新狀態名）

---

## 14. 升級到路線 C 的路徑（未來）

當以下條件**任一**達成，啟動升級：

1. 一週收 5+ critical incident
2. 開始想要「AI 自己改 staging 然後自動 PR」
3. 多人協作（需要 approval workflow）
4. 上線到第一個外部客戶（需要 status page）

升級步驟（不打掉重來）：

```sql
-- 加欄位，不刪欄位
alter table ops_incidents add column organization_id uuid;
alter table ops_incidents add column root_cause_summary text;
alter table ops_incidents add column resolution_summary text;

-- 新表（藍圖 §7.5–7.13），與 ops_incidents 用 incident_id FK 串起
create table evidence_snapshots ...;
create table ai_dispatch_runs ...;
create table remediation_actions ...;
create table approvals ...;
create table runbooks ...;
create table feedback_loops ...;
```

`ai_diagnoses` JSON 陣列可寫一支 migration 拆進新的 `ai_dispatch_runs` 表，舊資料不會丟。

---

## 15. 開放議題（v2.0 收斂後僅剩 1 項待你拍板）

| # | 問題 | 預設選擇 | 狀態 |
|---|---|---|---|
| 1 | 用哪個 Supabase project？ | `awarewave`（自架 EU）：API `https://supabase.aware-wave.com`、Studio `https://studio.aware-wave.com` | ✅ 已決 |
| 2 | Inbox UI 掛在哪？ | `next-admin` 內 `/ops/inbox`，公開於 `https://app.aware-wave.com/ops/inbox` | ✅ 已決 |
| 3 | Auth？ | 沿用既有 trusted-proxy + role header（無 Clerk）；webhook 用 `OPS_INBOX_INGEST_TOKEN` 獨立驗證 | ✅ 已決（§4.1） |
| 4 | Slack 通知頻道？ | 新開 `#ops-incidents`（Tier 2 curated）；`#alerts-infra` 保持原樣（Tier 1 firehose） | ✅ 已決（§6.6） |
| 5 | AI 成本模型？ | 訂閱優先三軌制：Gemini free / ChatGPT Plus + Claude Pro / Cursor Pro | ✅ 已決（§8.0） |
| 6 | DB schema 對齊路線？ | 對齊藍圖 §7.2/§7.3，但只建一張 `ops_incidents`，jsonb 暫存 ai_diagnoses / notification_log | ✅ 已決（§5） |
| 7 | Migration 系統？ | `lobster-factory/packages/db/migrations/0013_ops_inbox.sql`（既有 numbered 慣例） | ✅ 已決（§5、§10） |
| 8 | PostHog webhook 要做嗎？ | v1 寫 normalizer 但 feature flag 預設關 | ✅ 已決（§12.1） |
| 9 | UI 主題？ | 主內容淺色 + 深色 sidebar（同既有 next-admin） | ✅ 已決（§7.2） |
| 10 | 是否要先做 mobile-friendly？ | 否，桌機優先（< 768px 可用即可，§7.9） | ✅ 已決 |
| 11 | webhook 是否經 Cloudflare Tunnel？ | 是（next-admin 已在 Cloudflare 後面） | 🟡 **唯一待你確認**：可能需要在 CF rules 把 `/api/webhooks/*` 加到「不過 bot fight mode / 不過快取」白名單，否則 webhook 寄送方會被 challenge |

---

## 16. 風險與緩解

### 16.1 既有系統衝突類

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| middleware matcher 改寫不慎漏掉 `/api/ops/:path*` | 低 | 既有 ops console API 變沒 auth | Day 1 commit 必跑 §13.1 既有系統不退化驗收 |
| tsconfig paths 改錯導致全 app build 失敗 | 中 | 整個 next-admin 起不來 | Day 1 改 tsconfig 後馬上 `npm run build` 驗 |
| 把型別放 `packages/shared` | 中 | Docker build 找不到（`outputFileTracingRoot` 隔離） | §10 規定型別住 `apps/next-admin/lib/ops-inbox/types.ts` |
| Supabase env 變數命名不一致（`OPS_INBOX_SUPABASE_*` vs `SUPABASE_*`） | **已修** | 寫去錯的 Supabase | §12.4 明確禁用前綴版本，沿用既有 `SUPABASE_*` |

### 16.2 Webhook 攝入類

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| Sentry / Kuma webhook spam（數千筆/分鐘） | 低 | DB 寫爆 | fingerprint 去重 + 後續可加 rate limit middleware（路線 C） |
| Sentry title 飄移導致 fingerprint 失效 | **已修** | 同 issue 重複入庫 | §6.4.1 改用 `issue.id` 為 fingerprint 來源 |
| Webhook token 外洩 | 低 | 假事件灌入 | DPAPI vault 不入 git；可重 rotate（grep 換新值即可） |
| Supabase 連線不穩 | 低 | webhook 502 | route handler 用 `Sentry.captureException`，webhook 寄送方會自動 retry |
| 寄送方 timeout（webhook 處理太慢） | 中 | 被 retry → 重複事件 | §6.3 副作用 fire-and-forget，固定 < 1 秒回 200 |
| Sentry / Kuma 改 webhook payload schema | 中 | normalizer 抽不到欄位 | normalizer 是純函式 + vitest，§附錄 C 留真實 sample 便於回測 |

### 16.3 AI Dispatch 類

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| Gemini free tier 額度用爆 | 中 | Tier 1 自動分類停擺 | quotaGuard 在 1400 次停呼，列表 fallback 用原始 title；極端情況設 `OPS_INBOX_GEMINI_ENABLED=false` |
| Cursor deeplink prompt 太長被 OS 截斷 | 中 | Cursor 開出來 prompt 不完整 | `buildCursorDeeplink` 內限制最多 8000 字元（Windows shell 8191 上限），超過時 raw 不放進 prompt，改寫 「raw 在 Inbox detail 頁查」 |
| ChatGPT / Claude 改網址或關閉 web 入口 | 低 | 剪貼簿按鈕點了沒效果 | 退路：detail 頁加「Show prompt as text」modal，使用者複製貼到任何 chat UI |
| Cursor deeplink schema 改變 | 低 | 按鈕點了沒反應 | `buildCursorDeeplink` 是純函式，改一個檔即可 |
| Gemini 模型回傳格式不穩（hallucinate JSON） | 中 | 自動分類失敗 | gemini.ts 用 `responseSchema` 強制 JSON、解析失敗 fallback 寫 `error` |
| AI 診斷品質差 | 高 | 你不信任、不點 | 路線 B 沒有自動執行，只影響「按鈕的價值感」，不影響系統安全 |

### 16.4 通知拓撲類

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| Inbox 程式 bug 不發 Slack 通知 | 中 | curated 通知漏發 | **§6.6 兩層拓撲：Tier 1 直連 `#alerts-infra` 不依賴 Inbox**，最壞退化成「沒 curated」，不會「完全看不到」 |
| `#ops-incidents` webhook 失效 | 低 | curated 通知漏發 | `notification_log` 記 `status: failed`，可重放；`OPS_INBOX_NOTIFY_ENABLED=false` 可全域 kill |
| Slack 公司倒閉 / 被取代（30 年內機率不低） | 中 | 通知通道整體不可用 | §6.6.2 `Notifier` 介面：新寫 `DiscordNotifier` / `EmailNotifier`，DB schema、UI、webhook handler 都不動 |
| Slack 頻道重命名 / 重建 | 中 | webhook URL 失效 | 通道名稱不寫死在 code，env 換 webhook URL 即可 |
| Notification dispatcher race condition（同時兩個 webhook） | 低 | 重複通知 | L1 unique constraint 把第二筆變 update，dispatcher 走 `transition.kind === 'duplicate'` 不發 |

### 16.5 服務覆蓋盲點

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| n8n / Supabase 沒有 Sentry DSN（Sentry 永遠不會通報） | 高 | 這兩個服務的應用層錯誤盲點 | Uptime Kuma 兜底（站存活）+ Netdata 兜底（容器資源）；路線 C 才補 Sentry 整合 |
| Trigger.dev 寫在自己 cloud 上（非自架）| 中 | webhook 來源資料時序對不上 | normalizer 處理 timestamp 時用 `last_seen_at = now()` 而非 raw 內 timestamp |
| Netdata host 多到沒在 SERVICE_REGISTRY | 中 | `service = null` 太多 | inbox UI 加「host」filter，按主機分群檢視 |
| 新加一個 service / source 忘了同步註冊表 | 高 | 新事件 service = null | §6.4.2 sourceMapping.ts 是單一 source of truth；新加時 vitest fixture 會 fail |

### 16.6 部署 / 維運類

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| 本機 vs production env 不同步 | 高 | dev 過 prod 壞 | §12.3 `.env.production` 同步 SOP + `/api/ops/inbox/health` 對外暴露當前配額 |
| migration 0013 跑到一半失敗 | 低 | 表只建一半 | 全用 `if not exists`；二次重跑 idempotent |
| Supabase service role key 輪換時忘了更 production | 中 | webhook 全部 503 | `/api/ops/inbox/health` 加 `last_5xx_at` 監測；改 key 後手動跑一次 webhook smoke |
| Gemini free tier 政策改變（額度 / 模型停用） | 中 | Tier 1 全停 | env `OPS_INBOX_GEMINI_ENABLED=false` 立即停；換成 `gemini-2.5-flash` 等於改一行 |
| Cursor App 改 deeplink scheme | 低 | `[Open in Cursor]` 失效 | `buildCursorDeeplink` 改一行 |

---

## 17. 不做什麼（再次強調）

```txt
- 不做 SafeMode / approval / dry-run
- 不做自動 PR / 自動 deploy
- 不做 production / staging 環境治理（先全部當 production 看）
- 不做 multi-tenant RLS
- 不做 status page / runbook factory / feedback analytics
- 不做藍圖 §6.7 / §6.8 / §6.9 的任何治理層
- 不做藍圖 §10 的 dispatch policy JSON（程式碼裡的 recommendOrder 就夠）
- 不裝 OpenAI / Anthropic SDK（吃訂閱不吃 API）
- 不寫 budgetGuard（沒有 token 收費）
- 不裝 Clerk
- 不把 Inbox 通知混進 #alerts-infra（§6.6 兩層拓撲，30 年都不混）
- 不在 code 寫死 Slack 頻道名（一律從 env 讀 webhook URL）
- 不為了「現在只有一個 notifier」就跳過 Notifier interface（多 100 行救 30 年）
```

每一條都是「未來路線 C 才做」（或永遠不需要做）。

---

## 18. 一句話總結

> **路線 B = 把 4–5 個觀測工具的告警收進一張 Supabase 表，用 Next.js 列出來。每筆事件 Gemini Flash 自動寫一句摘要（free tier，$0），人類想深問就點「複製到剪貼簿 + 開 chatgpt.com / claude.ai」（吃 $20 訂閱），要動 code 就點「Open in Cursor」（吃 $20 訂閱）——3–5 天上線、零 API 邊際成本、不動 production、不裝 Clerk。**

---

## 附錄 A：三軌 Dispatch 工具集

### A.1 共用 Prompt 模板（依 service type 動態調整）

```ts
// lib/ops-inbox/dispatch/buildPrompt.ts
import { SERVICE_REGISTRY, type KnownService } from '@/lib/ops-inbox/registry/services';
import type { Incident } from '@/lib/ops-inbox/types';

type PromptTarget = 'cursor' | 'chat' | 'remote-ui';

export function buildIncidentPrompt(incident: Incident, target: PromptTarget): string {
  const reg = incident.service ? SERVICE_REGISTRY[incident.service as KnownService] : null;

  const serviceContext = reg
    ? buildServiceContext(reg)
    : `服務：未對應到註冊表，可能是主機層級告警（${incident.tags?.host ?? 'unknown host'}）`;

  const tail = buildTaskTail(target, reg);

  return `我正在處理一個 incident（從 Ops Inbox 跳轉過來）：

來源：${incident.source}
服務：${incident.service ?? '(host-level)'}
環境：${incident.environment}
等級：${incident.severity}
標題：${incident.title}
訊息：${incident.message ?? ''}
首次發生：${incident.first_seen_at}
累計次數：${incident.occurrence_count}

部署資訊：
${serviceContext}

Raw payload（已 redact secrets）：
\`\`\`json
${JSON.stringify(incident.raw, null, 2)}
\`\`\`

${incident.ai_diagnoses.length > 0
  ? `先前 AI 診斷：\n${incident.ai_diagnoses.map(d => `- [${d.provider}] ${d.summary}`).join('\n')}\n`
  : ''}
${tail}`;
}

function buildServiceContext(reg: typeof SERVICE_REGISTRY[KnownService]): string {
  const hostInfo = reg.host === 'sg'
    ? '主機：SG (5.223.93.113, wordpress-ubuntu-4gb-sin-1)'
    : '主機：EU (204.168.175.41, awarewave-eu-hel1-cpx32)';

  if (reg.type === 'local-repo') {
    return `${hostInfo}
本地 repo 路徑：${reg.repo_path}
公開 URL：${reg.public_url ?? 'N/A'}`;
  }
  if (reg.type === 'remote-ui-n8n') {
    return `${hostInfo}
⚠️ 此 service 沒有本地 repo —— workflow 住在 n8n DB
n8n UI：${reg.ui_url}
SSH 路徑（如果是 compose 層問題）：${reg.ssh_path}`;
  }
  // remote-ui-supabase
  return `${hostInfo}
⚠️ 此 service 沒有本地 repo —— schema 住在 Supabase Postgres
Studio UI：${reg.ui_url}
SSH 路徑（如果是 compose 層問題）：${reg.ssh_path}`;
}

function buildTaskTail(
  target: PromptTarget,
  reg: typeof SERVICE_REGISTRY[KnownService] | null,
): string {
  if (target === 'cursor' && reg?.type === 'local-repo') {
    return `
請你：
1. 用 grep / glob 在 ${reg.repo_path} 中找出可能的肇因檔案
2. 提出修復方案（patch 形式）
3. 評估風險與測試方式`;
  }
  if (target === 'remote-ui' && reg?.type === 'remote-ui-n8n') {
    return `
這是 n8n workflow 的問題。請你：
1. 推測是哪個 workflow / node 出錯（從 message 與 raw 找線索）
2. 在 n8n UI (${reg.ui_url}) 裡要怎麼定位
3. 修復策略（改 node 設定 / 加錯誤處理 / 改重試）
4. 是否需要 SSH 進 ${reg.ssh_path} 動 docker-compose`;
  }
  if (target === 'remote-ui' && reg?.type === 'remote-ui-supabase') {
    return `
這是自架 Supabase 的問題。請你：
1. 判斷層級（Postgres / Auth / Realtime / Storage / Kong）
2. 在 Studio (${reg.ui_url}) 裡要怎麼定位（query / logs / settings）
3. 修復策略
4. 是否需要 SSH 進 ${reg.ssh_path} 動 docker-compose`;
  }
  return `
請你：
1. 從 stack trace / log / metrics 推理可能的根本原因
2. 給出 3 個最可能的假設，依機率排序
3. 對每個假設給出驗證方法`;
}
```

### A.2 Cursor Deeplink（只用於 local-repo 服務）

```ts
// lib/ops-inbox/dispatch/buildCursorDeeplink.ts
import { buildIncidentPrompt } from './buildPrompt';
import type { Incident } from '@/lib/ops-inbox/types';

const MAX_DEEPLINK_LEN = 7800;  // 留給 cursor:// scheme + encodeURIComponent 緩衝；Windows shell hard limit ≈ 8191

export function buildCursorDeeplink(incident: Incident): string {
  let prompt = buildIncidentPrompt(incident, 'cursor');
  let encoded = encodeURIComponent(prompt);

  // 太長 → 把 raw payload 拿掉，提示使用者去 inbox detail 頁查
  if (encoded.length > MAX_DEEPLINK_LEN) {
    prompt = buildIncidentPrompt({ ...incident, raw: { _omitted: 'see inbox detail page' } }, 'cursor');
    encoded = encodeURIComponent(prompt);
  }
  // 仍超長 → 截斷 message
  if (encoded.length > MAX_DEEPLINK_LEN) {
    const truncated = { ...incident, raw: {}, message: (incident.message ?? '').slice(0, 2000) + '…' };
    prompt = buildIncidentPrompt(truncated, 'cursor');
    encoded = encodeURIComponent(prompt);
  }

  return `cursor://anysphere.cursor-deeplink/prompt?text=${encoded}`;
}
```

### A.3 Remote UI 觸發（n8n / Supabase）

```tsx
// app/ops/inbox/components/OpenRemoteUIButton.tsx
'use client';
import { useTransition } from 'react';
import { buildIncidentPrompt } from '@/lib/ops-inbox/dispatch/buildPrompt';
import { SERVICE_REGISTRY } from '@/lib/ops-inbox/registry/services';
import type { Incident } from '@/lib/ops-inbox/types';

export function OpenRemoteUIButton({ incident }: { incident: Incident }) {
  const [pending, start] = useTransition();
  if (!incident.service) return null;
  const reg = SERVICE_REGISTRY[incident.service];
  if (!reg || reg.type === 'local-repo') return null;

  const label = reg.type === 'remote-ui-n8n' ? 'Open n8n UI' : 'Open Studio';

  return (
    <button
      disabled={pending}
      onClick={() => start(async () => {
        const prompt = buildIncidentPrompt(incident, 'remote-ui');
        await navigator.clipboard.writeText(prompt);
        window.open(reg.ui_url, '_blank', 'noopener,noreferrer');
      })}
    >
      {label}
    </button>
  );
}
```

### A.4 Chat 剪貼簿觸發（共用）

```tsx
// app/ops/inbox/components/AskChatGPTButton.tsx
'use client';
import { useTransition } from 'react';
import { buildIncidentPrompt } from '@/lib/ops-inbox/dispatch/buildPrompt';
import type { Incident } from '@/lib/ops-inbox/types';

export function AskChatGPTButton({ incident }: { incident: Incident }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => {
        const prompt = buildIncidentPrompt(incident, 'chat');
        await navigator.clipboard.writeText(prompt);
        window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
      })}
    >
      Ask ChatGPT
    </button>
  );
}
```

`AskClaudeButton` 同形，把 `chatgpt.com` 換成 `claude.ai/new`。

### A.5 主按鈕排序（依 service type）

```ts
// lib/ops-inbox/dispatch/recommendOrder.ts
import { SERVICE_REGISTRY, type KnownService } from '@/lib/ops-inbox/registry/services';

export type DispatchTarget = 'cursor' | 'remote-ui' | 'chatgpt' | 'claude';

export function recommendOrder(incident: {
  service: string | null;
  signal_type: string;
  severity: string;
}): DispatchTarget[] {
  const reg = incident.service
    ? SERVICE_REGISTRY[incident.service as KnownService]
    : null;

  // remote-ui 服務：UI 第一
  if (reg?.type === 'remote-ui-n8n' || reg?.type === 'remote-ui-supabase') {
    return ['remote-ui', 'claude', 'chatgpt'];
  }

  // local-repo 服務：依信號類型決定
  if (reg?.type === 'local-repo') {
    if (incident.signal_type === 'error' && incident.severity === 'critical') {
      return ['claude', 'cursor', 'chatgpt'];
    }
    if (['error', 'deployment'].includes(incident.signal_type)) {
      return ['cursor', 'chatgpt', 'claude'];
    }
    if (['uptime', 'latency', 'resource'].includes(incident.signal_type)) {
      return ['claude', 'cursor', 'chatgpt'];
    }
    if (incident.signal_type === 'business') {
      return ['claude', 'chatgpt', 'cursor'];
    }
    return ['cursor', 'chatgpt', 'claude'];
  }

  // service = null（host-level alarm）：Claude 第一，Cursor 沒意義所以排最後
  return ['claude', 'chatgpt', 'cursor'];
}
```

---

## 附錄 B：與藍圖（路線 C）的欄位對應表

> 確保未來升級不打掉重來。

| 路線 B `ops_incidents` 欄位 | 對應藍圖路線 C 表.欄位 |
|---|---|
| `id` | `incidents.id` |
| `source` | `incident_events.source` |
| `external_id` | `incident_events.external_event_id` |
| `fingerprint` | `incidents.fingerprint` |
| `signal_type` | `incident_events.signal_type` |
| `severity` | `incidents.severity` |
| `service` | `service_registry.name`（路線 C 拆獨立表） |
| `environment` | `incidents.environment` |
| `title` / `message` | `incidents.title` / `incident_events.message` |
| `status` | `incidents.status`（路線 C 加更多狀態） |
| `ai_diagnoses[]` | `ai_dispatch_runs`（路線 C 拆獨立表） |
| `raw` | `incident_events.raw_payload` |

升級時的拆表 migration 約 50 行 SQL，可半天完成。

---

## 附錄 C：真實 Webhook Payload 範例 + curl 測試指令

> 給 Day 1 / Day 2 寫 normalizer 與 webhook handler 時用作 vitest fixture 與 smoke test。
> 真實 payload 取自各家官方文件（Sentry v9、Uptime Kuma 1.23、Grafana 11、Netdata cloud、PostHog 1.x），值已遮罩。

### C.1 Sentry — Issue Alert webhook

```json
{
  "action": "created",
  "installation": { "uuid": "abc-uuid" },
  "data": {
    "issue": {
      "id": "5234567890",
      "shortId": "JS-NEXTJS-7K",
      "title": "TypeError: Cannot read properties of undefined (reading 'price')",
      "culprit": "components/cart.tsx in handleCheckout",
      "permalink": "https://sentry.io/organizations/awarewave/issues/5234567890/",
      "level": "error",
      "status": "unresolved",
      "project": { "id": "1", "name": "javascript-nextjs", "slug": "javascript-nextjs" }
    },
    "event": {
      "event_id": "ee9a...",
      "environment": "production",
      "release": "next-admin@1.0.3",
      "tags": [["url", "https://app.aware-wave.com/checkout"]]
    }
  }
}
```

curl smoke test：

```powershell
$body = Get-Content -Raw .\fixtures\sentry-issue.json
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
Invoke-RestMethod -Uri "https://app.aware-wave.com/api/webhooks/sentry" `
  -Method POST -Body $bytes `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $env:OPS_INBOX_INGEST_TOKEN" }
# 預期：{ incident_id: "...", transition: "new", occurrence_count: 1 }
```

### C.2 Uptime Kuma — Webhook (custom JSON)

```json
{
  "heartbeat": {
    "monitorID": 12,
    "status": 0,
    "time": "2026-04-27 11:30:00",
    "msg": "Connection refused",
    "ping": null,
    "important": true,
    "duration": 60
  },
  "monitor": {
    "id": 12,
    "name": "app.aware-wave.com",
    "url": "https://app.aware-wave.com/",
    "type": "http",
    "tags": [{ "name": "service:javascript-nextjs" }, { "name": "env:production" }]
  },
  "msg": "[app.aware-wave.com] [🔴 Down] Connection refused"
}
```

### C.3 Grafana — Alerting webhook (v11)

```json
{
  "receiver": "ops-inbox",
  "status": "firing",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighCpu",
        "service": "javascript-nextjs",
        "environment": "production",
        "severity": "high"
      },
      "annotations": { "summary": "CPU > 90% for 5m" },
      "startsAt": "2026-04-27T11:30:00Z",
      "fingerprint": "5b1a8f3c2e90a1b2"
    }
  ],
  "groupKey": "{}:{alertname=\"HighCpu\"}"
}
```

### C.4 Netdata — alarm webhook

```json
{
  "alarm": "system.cpu",
  "host": "wordpress-ubuntu-4gb-sin-1",
  "chart": "system.cpu",
  "status": "CRITICAL",
  "old_status": "WARNING",
  "value": "98.4",
  "units": "%",
  "info": "average cpu utilization for the last minute",
  "when": 1745749800,
  "duration": 60,
  "non_clear_duration": 300,
  "id": 8412
}
```

### C.5 PostHog — alert webhook

```json
{
  "alert_id": "alert-cohort-drop-7d",
  "alert_name": "Conversion drop > 30%",
  "trigger": "fired",
  "trigger_at": "2026-04-27T11:30:00Z",
  "event": {
    "uuid": "01HZ...",
    "properties": { "$service": "javascript-nextjs", "environment": "production" }
  },
  "value": 0.41,
  "threshold": 0.30
}
```

### C.6 Manual webhook（測試 / 重建現場用）

```powershell
# 用於沒有 webhook 觸發但你想灌一筆事件進系統的情境
$body = @{
  source = "manual"
  external_id = "test-$(Get-Date -Format 'yyyyMMddHHmmss')"
  signal_type = "error"
  severity = "high"
  service = "javascript-nextjs"
  environment = "production"
  title = "Manual smoke test"
  message = "由 USER 在 $(Get-Date) 手動觸發"
} | ConvertTo-Json
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)

Invoke-RestMethod -Uri "https://app.aware-wave.com/api/webhooks/manual" `
  -Method POST -Body $bytes -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $env:OPS_INBOX_INGEST_TOKEN" }
```

### C.7 健康檢查 / 配額查詢

```powershell
# /api/ops/inbox/health（受 middleware 保護，需要 trusted-proxy auth）
Invoke-RestMethod -Uri "https://app.aware-wave.com/api/ops/inbox/health" `
  -Headers @{
    "x-ops-proxy-auth"    = $env:OPS_PROXY_SHARED_SECRET
    "x-ops-claims-role"   = "operator"
  }
# 預期：{ open_count, critical_count, gemini_quota_used, last_ingest_at, last_5xx_at }
```

---

## 附錄 D：30-Year Stability Checklist（每年複查一次）

> 每 12 個月（或换大版本 Next.js / Supabase 時）跑一次。任何一項打勾不掉 → 系統有腐爛跡象，要安排修。

### D.1 命名 / Schema 不變式

- [ ] DB 仍只有 `ops_incidents` + `ops_inbox_*` 兩類表（沒長出 `incidents` / `inbox_records` 等別名）
- [ ] env 變數仍維持 `OPS_INBOX_*` 前綴（沒長出 `INBOX_*` / `OBSERVABILITY_*` 等變體）
- [ ] URL 仍是 `/ops/inbox` + `/api/webhooks/*` + `/api/ai/*`（沒被改成 `/inbox/v2`）
- [ ] grep `OPS_INBOX_SUPABASE_URL` 整 repo → 0 行（命名錯誤沒有重生）

### D.2 抽象層仍可用

- [ ] `Notifier` interface 還在，且至少一次（哪怕只是 PoC）證明可以新增第二個 implementation
- [ ] `SERVICE_REGISTRY` 是單一 source of truth；新加 service 時 sourceMapping.ts 與 services.ts 一起改
- [ ] normalizer 仍是純函式，不依賴 DB / network

### D.3 訂閱優先模型仍生效

- [ ] grep `OPENAI_API_KEY|ANTHROPIC_API_KEY` 在 `lib/ops-inbox/` → 0 行
- [ ] `package.json` 沒有 `openai` / `@anthropic-ai/sdk`
- [ ] 「按一次按鈕」的 marginal cost = $0（除了 Gemini Tier 1 自動分類，且仍用 free tier）

### D.4 兩層拓撲仍分流

- [ ] `#alerts-infra` 過去 30 天**沒有** Inbox 簽名訊息（用 `ops-inbox` 字串 grep slack export）
- [ ] `#ops-incidents` 過去 30 天**有** Inbox 簽名訊息（系統還活著）

### D.5 既有系統仍未被搞壞

- [ ] `app.aware-wave.com/`、`/ops-console`、`/api-check` 都正常
- [ ] `lib/supabase-server.ts` / `lib/ops-role.ts` / `lib/ops-contracts.ts` 既有導出簽章未變
- [ ] 既有 `/api/ops/*` 路由的響應契約未變

### D.6 升級可行性仍在

- [ ] 「往路線 C 升級」的 §14 SQL 仍能 dry-run（沒有新欄位讓那段 migration 失效）
- [ ] AI 診斷紀錄仍可在 < 100 行 SQL 內拆出 `ai_dispatch_runs`

### D.7 Doc / Code 一致

- [ ] 本計畫 §10 列的 42 個檔在 codebase 都找得到（沒有靜悄悄被刪）
- [ ] §13 acceptance 全部仍能跑過
- [ ] §16 風險矩陣對應的緩解仍存在

---

## 附錄 E：與藍圖（路線 C）的銜接點

| 路線 B | 路線 C | 升級動作 |
|---|---|---|
| `ops_incidents` 單表 | 拆 `incidents` + `incident_events` | `ALTER TABLE` 加 FK + 一支 backfill |
| `ai_diagnoses` jsonb | `ai_dispatch_runs` 表 | 一支 migration 把 jsonb 展開成 row |
| `notification_log` jsonb | `notification_runs` 表 | 同上 |
| `Notifier` interface | 同樣的 interface | 不動 |
| `SERVICE_REGISTRY` const | `service_registry` 表 | code → DB |
| `manual` source | 一樣留著 | 不動 |
| 不做 approval | 加 `approvals` 表 | 新表，不影響舊資料 |

---

## 結束 — Sign-Off

本計畫 v2.0 = **已對齊既有 codebase**、**已修完 v1.0 識別出的 10 個 showstopper**、**已加入 Day 0 readiness、衝突檢核矩陣、production 部署 SOP、30-year 不變式清單**。

> **Sign-off 條件**：
> - [x] §0 30-year invariants 你接受
> - [x] §0.1 Day 0 readiness checklist 你已跑過
> - [x] §4.2 衝突矩陣的「既有系統不退化」承諾你接受
> - [x] §6.6 兩層通知拓撲（`#alerts-infra` vs `#ops-incidents`）已決
> - [x] §8.0 訂閱優先 AI 成本模型已決
> - [x] §12.4 不做的環境變數清單已決
> - [ ] 你給綠燈 → 執行 Cursor Task B-1

**未經明確指令，不開始實作**。

下一步等待：
1. 你 review 本計畫 v2.0 → 沒有反對意見回「動工」
2. 我啟動 Day 1 上半（基礎建設 commit：middleware + tsconfig + layout + migration），跑完 §13.1 既有系統不退化驗收
3. Day 1 下半起跑功能 commit（5 天 sprint）
