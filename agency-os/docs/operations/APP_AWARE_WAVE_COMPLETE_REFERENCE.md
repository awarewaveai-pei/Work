# app.aware-wave.com 完整技術參考手冊

> **SSOT**：本文件由 2026-06-04 全讀 codebase 產生，涵蓋 app.aware-wave.com（Lobster Factory Admin Console）的每個頁面、API、lib 模組、資料庫、基礎設施。  
> **用途**：完整 code 級參考（深入查某頁/API/lib/DB 怎麼運作時讀）。  
> **⚠️ 改動前先讀現況文件**：[`APP_AWARE_WAVE_CURRENT_STATE.md`](APP_AWARE_WAVE_CURRENT_STATE.md) — 網站「目前」長怎樣、怎麼登入、怎麼部署、有哪些陷阱（2026-06-05 大修後最新）。本檔某些段落（尤其 §3 認證、§14 問題）已被大修改變，以現況文件為準。  
> **維護**：每次重大改動後更新此文件。Last updated: 2026-06-04（§3/§14 狀態見 2026-06-05 大修註記）

---

## 目錄

1. [系統概覽](#1-系統概覽)
2. [基礎設施（SG VPS）](#2-基礎設施sg-vps)
3. [認證架構](#3-認證架構)
4. [Supabase 資料層](#4-supabase-資料層)
5. [Webhook Pipeline（Ops Inbox）](#5-webhook-pipelineops-inbox)
6. [全部頁面詳解](#6-全部頁面詳解)
7. [全部 API Routes](#7-全部-api-routes)
8. [Lib 模組詳解](#8-lib-模組詳解)
9. [Command Plane（Telegram Bot）](#9-command-planetelegram-bot)
10. [Repair Center 完整邏輯](#10-repair-center-完整邏輯)
11. [Build Console & Onboarding](#11-build-console--onboarding)
12. [Trigger.dev 任務](#12-triggerdev-任務)
13. [完整環境變數清單](#13-完整環境變數清單)
14. [已知問題清單（12 項）](#14-已知問題清單12-項)

---

## 1. 系統概覽

### 名稱
**Lobster Factory Admin Console**（內部稱 `next-admin`）

### 技術棧
- Next.js 15 + React 19（App Router，Server Components 為主）
- TypeScript（全嚴格型別）
- 純 CSS 變數（**無 Tailwind**）
- Sentry + PostHog 監控
- `@supabase/supabase-js ^2.49.8`（非 auth-helpers）
- `ssh2`（SSH 連線用於 Repair Center backup + WP plugin update）
- `@anthropic-ai/sdk`（AI 診斷 + spec 生成）
- `@google/generative-ai`（Gemini 備援）

### 部署位置
- **SG VPS** `5.223.93.113`，container `lobster-next-admin`
- 對外：`app.aware-wave.com`（Cloudflare → nginx → next-admin:3000）
- Host port：`127.0.0.1:3002`，container 內 port `3000`
- `output: standalone`，靠 `node server.js` 啟動

### 相關服務
| URL | 用途 |
|-----|------|
| `aware-wave.com` | WordPress 公開網站（同 SG VPS） |
| `api.aware-wave.com` | Node.js Express API（port 3001） |
| `n8n.aware-wave.com` | n8n（EU VPS） |
| `trigger.aware-wave.com` | Trigger.dev（EU VPS） |
| `uptime.aware-wave.com` | Uptime Kuma（EU VPS） |
| `studio.aware-wave.com` | Supabase Studio（EU VPS） |

---

## 2. 基礎設施（SG VPS）

### docker-compose.yml 容器配置

| 容器 | Image | Port | Memory | 功能 |
|------|-------|------|--------|------|
| `lobster-nginx` | nginx:stable | 80 | 128M / 0.5CPU | Reverse proxy |
| `lobster-redis` | redis:7-alpine | 127.0.0.1:6379 | 512M / 0.5CPU | Cache |
| `lobster-wordpress-db` | mariadb:11 | 內部 | 1G / 1.0CPU | WP 資料庫 |
| `lobster-wordpress` | 自建 Dockerfile | 127.0.0.1:8080 | 768M / 0.5CPU | WordPress |
| `lobster-node-api` | 自建 Dockerfile | 127.0.0.1:3001 | 512M / 0.5CPU | Express API |
| `lobster-next-admin` | 自建 Dockerfile | 127.0.0.1:3002 | 1G / 1.0CPU | Admin UI |

**startup 順序**：redis healthy → node-api healthy → wordpress-db healthy → wordpress healthy → nginx + next-admin

**重要**：next-admin 容器有 `extra_hosts: host.docker.internal:host-gateway`，允許 SSH backup 操作連到 SG host。

**n8n**：SG 上有但預設不啟動（profile: `local-n8n`），canonical n8n 在 EU。

### nginx routing（`nginx/default.conf`）

**安全層（四層）：**
1. Rate limiting zones：public 30r/s / admin 20r/s / webhook 10r/s / wplogin 5r/m
2. WordPress security blocks：xmlrpc.php / wp-config.php / php-in-uploads 等 → 444
3. fail2ban（host 層）
4. Cloudflare IP 白名單（非 CF/EU/127 直連 → 444 silent drop）

**IP 信任設定**：
- 全部 Cloudflare IPv4 ranges（source: cloudflare.com/ips-v4）
- EU VPS `204.168.175.41/32`（Uptime Kuma + Netdata 監控）
- `127.0.0.1/32`

**Real IP 還原**：`real_ip_header CF-Connecting-IP`（從 Cloudflare header 恢復真實訪客 IP）

**路由規則：**
```
aware-wave.com / www  →  WordPress (proxy_pass wordpress:80)
                         rate: public 30r/s
                         wp-login: wplogin 5r/m
                         wp-admin: wplogin 10r/m

app.aware-wave.com  →  next-admin:3000
  /api/webhooks/*       rate: webhook 10r/s burst=20
  /api/ops/inbox/health 無 rate limit
  /                     rate: admin 20r/s burst=40
```

### Dockerfile（next-admin）
多階段 build：`deps` → `builder` → `runner`（node:20-alpine）
- `NEXT_PUBLIC_*` 在 build 時透過 ARG 注入（改了要重 build）
- `runner` 手動複製 `@anthropic-ai` + `ssh2`（Next.js standalone tracer 追蹤不到）
- 非 root user（nextjs:1001）

---

## 3. 認證架構

> **🔴 已過時（2026-06-05 大修改寫）**：本節描述的是大修「前」的 proxy-trust（`OPS_PROXY_SHARED_SECRET` + `x-ops-proxy-auth` header）機制 = **問題 1（prod 全 403）的根因，已廢除**。
> **現行認證 = Supabase Auth（email+密碼 session）**，完整說明見 [`APP_AWARE_WAVE_CURRENT_STATE.md` §1](APP_AWARE_WAVE_CURRENT_STATE.md)。要點：middleware 驗 Supabase session → `app_metadata.ops_role` → 注入 `x-ops-claims-role`；fail-closed；無條件剝除 inbound claim header（anti-spoof）；matcher 保護整個 console；nginx basic-auth 已移除。下方角色矩陣（owner/admin/operator/viewer）+ `ops-role.ts` RBAC **仍有效**（middleware 改的是「角色從哪來」，不是 RBAC 本身）。

### middleware.ts 攔截範圍（⚠️ 已被 Supabase Auth 版本取代，僅供歷史對照）
```
/api/ops/:path*
/ops/:path*
/api/ai/:path*
/api/build/:path*
/api/onboarding/:path*
```

### 免驗路徑（直通）
- `/api/ops/summary`（Uptime Kuma 心跳，公開）
- `/api/ops/inbox/health`（公開 health 端點）
- `/api/ops/inbox/digest`、`/api/ops/inbox/incidents`
- `/api/webhooks/*`（各自用 Bearer token 驗證）

### middleware 邏輯
```typescript
hasTrustedProxyAuth() =
  OPS_PROXY_SHARED_SECRET 未設定 → !isProductionLike()
  OPS_PROXY_SHARED_SECRET 已設定 → header x-ops-proxy-auth === secret

production + 非 trusted proxy → 403 forbidden
trusted proxy + valid role → 正規化 x-ops-claims-role 傳入
```

**⚠️ 已知問題**：nginx 沒有注入 `x-ops-proxy-auth` header，所以 production 下整個 admin UI 對瀏覽器直接請求都是 403。

### 角色解析（ops-role.ts）
```
讀取順序：x-ops-claims-role → x-user-role → x-clerk-role
  ↓ 無 claims
claims_with_simulated_fallback + OPS_ALLOW_SIMULATED_ROLE_FALLBACK=true
  → x-ops-simulated-role header 或 OPS_SIMULATED_FALLBACK_ROLE env
  ↓ 否則
"viewer"（default_viewer）
```

### 角色權限矩陣

| 操作 | viewer | operator | admin | owner |
|------|--------|----------|-------|-------|
| 讀 Inbox / 改 incident 狀態 | ✓ | ✓ | ✓ | ✓ |
| 觸發 AI 診斷 | ✗ | ✓ | ✓ | ✓ |
| 同步 WP 報告 | ✗ | ✓ | ✓ | ✓ |
| 建立 AI Image Job | ✗ | ✓ | ✓ | ✓ |
| 改 Tenant Config | ✗ | ✗ | ✓ | ✓ |
| 核准/拒絕 Command | ✗ | ✗ | ✓ | ✓ |
| 改 System Mode | ✗ | ✗ | ✓ | ✓ |
| Build Console enqueue | ✗ | ✓ | ✓ | ✓ |

### Security 模組
`lib/security/timingSafeEqual.ts`：HMAC-SHA256 後 `crypto.timingSafeEqual`，防止長度 timing side-channel。

---

## 4. Supabase 資料層

### 連線設定（supabase-server.ts）
- **read client**（anon key）：列表查詢
- **write client**（service role key）：所有寫入操作
- `getSupabaseServerClient()` = 優先 write client，fallback read

### 資料庫完整 Schema（35 個 migrations）

#### 核心表（0001-0003）
| 表 | 關鍵欄位 | 說明 |
|----|---------|------|
| `organizations` | id, type, name, slug, status, metadata(jsonb) | 多租戶 org。metadata 含 client_config + wp_update_latest |
| `workspaces` | org FK | 工作區 |
| `profiles` | email, status | 使用者 |
| `packages` | scope_type, slug, package_type | WP 外掛包 |
| `manifests` | package_version_id, manifest_json | 安裝 manifest |
| `workflows` | orchestrator_type, risk_level | 工作流程定義 |
| `workflow_runs` | status, trigger_type | 工作流程執行 |
| `policies` / `approvals` | scope_type, status | 審批 |
| `error_events` | source_type, error_code | 錯誤日誌 / DLQ |

#### Ops Inbox（0013）
```sql
ops_incidents (
  id uuid,
  source text,          -- 'sentry'|'uptime_kuma'|'grafana'|'netdata'|'posthog'|'manual'|'deploy'|'collection'|'site_watch' (CHECK redefined by 0031, 0073, 0091)
  external_id text,
  fingerprint text,     -- UNIQUE(fingerprint, environment)
  signal_type text,     -- 'error'|'uptime'|'latency'|'resource'|'business'|'deployment'
  severity text,        -- 'low'|'medium'|'high'|'critical'
  service text,
  environment text,     -- 'development'|'staging'|'production'
  title text,
  message text,
  occurrence_count integer default 1,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  status text,          -- 'open'|'investigating'|'resolved'|'ignored'
  reopen_count integer,
  resolved_at/by,
  ai_provider_suggested text,
  ai_diagnoses jsonb,   -- Array of AiDiagnosis
  cursor_deeplink text,
  notification_log jsonb,
  raw jsonb,
  tags jsonb
)
```

#### Command Plane（0025）
```sql
command_requests (
  id uuid,
  organization_id uuid FK,
  source text,          -- 'telegram'|'slack'|'email'|'webhook'|'schedule'|'internal'|'github'
  source_event_id text, -- UNIQUE(source, source_event_id) ← idempotency
  actor_type text,      -- 'human'|'agent'|'system'
  command text,
  args jsonb,
  risk_level text,      -- 'low'|'medium'|'high'|'critical'
  status text,          -- 'received'|'queued'|'dispatched'|'completed'|'failed'|'blocked_by_*'
  result jsonb,
  trace_id text,
  received_at timestamptz,
  resolved_at timestamptz
)

system_modes (
  scope_type text,      -- 'global'|'agency'|'client'
  scope_id uuid,        -- null for global
  mode text,            -- 'normal'|'maintenance'|'read_only'|'emergency_stop'
  reason text,
  set_at timestamptz
  -- UNIQUE(scope_type) WHERE scope_id IS NULL  ← one global mode only
)
```

#### Repair Center（0027）
```sql
repair_runs (
  id uuid,
  incident_id uuid FK ops_incidents, -- UNIQUE ← 一個 incident 只能有一個 repair_run
  source text,
  client_slug text,
  policy text,          -- 'auto_repair'|'analysis_only'|'human_only'|'triage_needed'
  state text,           -- 完整狀態機見第10節
  approved_by/at,
  backup_status text,   -- 'not_started'|'running'|'passed'|'failed'|'skipped'
  backup_ref text,
  github_issue_url/number,
  github_pr_url/number,
  deploy_status text,   -- 'not_started'|'pending_manual'|'running'|'passed'|'failed'|'rolled_back'
  risk_level text,
  needs_human_review boolean,
  audit_log jsonb,      -- append-only log
  archived_at timestamptz
)
```

#### Ops Console（0011）
```sql
ops_action_catalog (id, action_key UNIQUE, display_name, risk_level, enabled)
ops_action_runs (id, action_id FK, organization_id, status, approval_status, trace_id, input_payload, output_payload)
media_assets (id, storage_backend 'r2'|'wp_uploads', asset_domain 'ai_generated'|'wp_product'|'wp_blog')
ai_image_jobs (id, prompt, model_name, provider, status 'queued'|'running'|'completed'|'failed'|'cancelled')
ops_audit_events (id, event_type, target_type, target_id, trace_id, payload)
```

#### 其他重要表
```sql
tenant_integration_bindings  -- per-tenant 外部服務串接（UNIQUE org+provider）
assets                       -- 客戶資產（網站/DB/API）
intake_forms                 -- Onboarding 表單（0034）
website_specs                -- Claude 生成的網站規格（0034）
ops_health_probes            -- probe heartbeat，key='ops-inbox'（每 30 分鐘更新）
ops_inbox_gemini_quota       -- Gemini API 每日配額計數器
package_install_runs         -- WP 外掛初始安裝記錄
operator_tasks               -- 手動 fallback 任務（0022）
smoke_test_results           -- smoke 結果（0022）
```

#### 重要 PL/pgSQL 函數
- `upsert_incident_atomic`（0035）：原子 occurrence_count+1，防 concurrent retry race
- `archive_stale_repair_runs(retention_days)`（0030）：批次封存舊 runs
- `ops_inbox_gemini_quota_increment(p_max)`：原子配額遞增

---

## 5. Webhook Pipeline（Ops Inbox）

### 共用流程（6 個 webhook routes，完全相同架構）

```
POST /api/webhooks/{source}
  1. verifyIngestToken()
     → 讀 Authorization: Bearer header
     → HMAC-SHA256(input) vs HMAC-SHA256(OPS_INBOX_INGEST_TOKEN)
     → timing-safe comparison（防長度洩漏）
     → 失敗 → 401

  2. readWebhookBody()
     → content-length pre-check（256KB cap）
     → req.text()（非 req.json()！保留 raw bytes 供未來 HMAC 驗證）
     → JSON.parse
     → 超過 256KB → 413

  3. redactSecrets()
     → Key pattern 掃描（password/secret/token/api_key 等）→ "[REDACTED]"
     → Value pattern 掃描：Stripe/GitHub PAT/Slack/JWT/PEM/KEY=VALUE 模式
     → MAX_DEPTH=64（Sentry React stack depth）
     → MAX_STRING_LENGTH=4096 + 截斷標記
     → OPS_AGGRESSIVE_REDACT=true → 額外掃描 80+ char base64

  4. normalize{Source}() → IncidentDraft

  5. computeFingerprint()
     → source-specific SHA256 或 normalized title SHA256

  6. SELECT 現有 incident（fingerprint + environment）→ snapshot

  7. computeTransition(snapshot, draft)
     → null → "new"
     → resolved/ignored → "reopened"
     → draft severity > existing → "severity_escalated"
     → 其他 → "duplicate"

  8. upsertIncidentAtomic(supabase, draft, isReopen) → Supabase RPC
     → PL/pgSQL SET count + 1（row-locked，M10 fix）
     → severity = max(existing, incoming)
     → isReopen → reopen_count+1, status='open', resolved_at=null

  9. 只有 "new" → triggerAutoClassify(id)（非同步，不阻塞回應）

  10. dispatchNotifications()（catch exception → Sentry，不 throw）

  11. return { incident_id, transition, occurrence_count }
```

### 各 Source 特殊邏輯

**Netdata（特殊）**：
- `raw.status === "CLEAR"` → 直接 resolve 已有 open incident（不走 upsert）
- Fingerprint 用 `raw.name`（穩定 metric ID）不用 `raw.alarm`（label 隨狀態變）

**PostHog（特殊）**：
- 需 `OPS_INBOX_POSTHOG_ENABLED=true` 才接受，否則 401

**Deploy（特殊）**：
- 不觸發 AI auto-classify（deploy 事件不需要）
- VPS sg-deploy.sh 自己發 Telegram/Slack，dispatcher 跳過

### Normalizer 邏輯

| Source | signal_type | severity | environment | fingerprint |
|--------|------------|----------|-------------|-------------|
| Sentry | error | fatal→critical/error→high/warning→medium/info→low | event.environment | SHA256("sentry:"+issue.id) |
| Uptime Kuma | uptime | DOWN+prod→critical/DOWN+非prod→medium/其他→low | tags.env（operator設定，非hostname） | SHA256("kuma:"+monitor.id+":"+type) |
| Grafana | latency/resource/uptime/deployment/error（annotation 關鍵字） | labels.severity | labels.environment | SHA256("grafana:"+alerts[0].fingerprint) |
| Netdata | resource | CRITICAL→critical/WARNING→medium/其他→low | 固定 production | SHA256("netdata:"+host+":"+raw.name) |
| PostHog | business | drop_percent≥50→high/≥30→medium/<30→low | event.properties.environment | SHA256("posthog:"+alert_id) |
| Deploy | deployment | deploy_failed→high/deploy_success→low/其他→medium | 固定 production | normalized title SHA256 |

### Service → Source mapping（sourceMapping.ts）
```
"app.aware-wave.com" → "javascript-nextjs"
"api.aware-wave.com" → "node-api"
"aware-wave.com" → "php"
"n8n.aware-wave.com" → "n8n"
"supabase.aware-wave.com" → "supabase"
"trigger.aware-wave.com" → "trigger-workflows"
Netdata host "sin"/"wordpress-ubuntu" → SG server
Netdata host "hel"/"awarewave-eu" → EU server
```

### AI Auto-Classify（triggerAutoClassify.ts）
- 只有 `transition.kind === "new"` 時觸發
- Provider cascade：Claude Haiku 4.5 → Gemini 2.0 Flash Lite → skip
- Claude timeout：12s；Gemini timeout：12s
- Claude：無配額限制（pay-per-token）
- Gemini：DB 配額 `ops_inbox_gemini_quota_increment(p_max)`，預設 1400/天
- 成功：寫入 `ai_diagnoses[].role="auto-classify"` + 更新 `ai_provider_suggested`
- 失敗：在 `tags.auto_classify_error` 標記

### Notification 規則（dispatcher.ts + rules.ts）

**啟用條件**：`OPS_INBOX_NOTIFY_ENABLED=true`（或有設定 SLACK webhook 時預設啟用）

**永不通知**：
- environment = development
- status = ignored
- source = deploy

**節流規則**：
| transition | Slack/Telegram 行為 |
|-----------|-------------------|
| new + critical | 立即，Slack `<!here>` |
| new + 其他 | 立即 |
| severity_escalated | 立即 |
| reopened | 立即 |
| duplicate + critical | 3 分鐘 throttle window |
| duplicate + 其他 | 15 分鐘 throttle window |

**Slack 格式**：Block Kit（section + context）+ Action buttons（Approve repair / View only / Acknowledge）

**Telegram 格式**：繁體中文，severity emoji + 來源 + 規則 + title + message + Ops Inbox URL，4000字截斷（Markdown → fallback plain text）

---

## 6. 全部頁面詳解

### 視覺設計系統（globals.css）
```css
--sidebar-w: 248px;
--sidebar-bg: #07101f;      /* 深色側欄 */
--accent: #6366f1;          /* Indigo 主色 */
--body-bg: #f2f5fb;         /* 畫布背景 */
--text-primary: #0d1526;
--text-secondary: #64748b;
--severity-critical: #dc2626;
--severity-high: #ea580c;
--severity-medium: #ca8a04;
--severity-low: #0284c7;
/* 字體：Inter → -apple-system fallback */
/* 無 Tailwind，全 CSS 變數 + inline style */
```

### 側欄結構
```
Lobster Factory (sidebar-logo)
  ├── Overview
  │   └── Dashboard (/)
  ├── Repair OS
  │   ├── Repair Center (/ops/repairs) + OpsInboxBadge
  │   ├── Clients (/ops/clients)
  │   ├── Onboarding (/ops/onboarding)
  │   ├── Integrations (/ops/integrations)
  │   └── API Health (/api-check)
  ├── Actions
  │   ├── Approvals (/ops/approvals)
  │   └── System Modes (/ops/system-modes)
  ├── Provisioning
  │   ├── New Client (/onboard)
  │   └── Build Console (/build)
  ├── Content Tools
  │   ├── Generator (Soon)
  │   └── Templates (Soon)
  ├── System
  │   ├── Ops Console (/ops-console)
  │   ├── Incident Engine (/ops/inbox)  ← 同 Ops Inbox
  │   └── API Health browser (/api-check-client)
  └── External
      ├── n8n ↗
      ├── Uptime Kuma ↗
      ├── Trigger.dev ↗
      └── WordPress ↗
```

---

### Dashboard（`/`）
Server Component，啟動時並行 fetch：
- `GET node-api:3001/health`（超時 6s）→ `{ok, service, port}`
- `GET node-api:3001/rag/health` → `{ok, supabaseUrl, openai}`

顯示：3 個狀態卡片（node-api / RAG+Supabase / next-admin）+ NavCard 網格（Monitoring / Actions / Provisioning / External）

---

### Ops Inbox（`/ops/inbox`）= Incident Engine

**資料**：`ops_incidents`，最多 200 筆，按 `last_seen_at DESC`

**URL 篩選**：
- `?status=all|active|open,resolved|ignored`（active = 只看 investigating）
- `?severity=critical,high,medium,low`
- `?source=sentry,uptime_kuma,...`
- `?q=關鍵字`（ilike title + message）
- `?client_slug=slug`

**IncidentCard 內容**：
- 左色條 = severity 顏色
- badges：severity / signal_type / source（可點擊外部）/ service / environment / status / 時間
- AI 摘要藍框（如有 auto-classify）
- occurrence 次數 / Open in Cursor / 詳情→

**StatusActions（Server Actions）**：
| 當前狀態 | 可用 |
|---------|------|
| open | 標記調查中 / 標記已解決 / 標記忽略 |
| investigating | 標記已解決 / 標記忽略 |
| resolved / ignored | 重新開啟 |

---

### Incident 詳情（`/ops/inbox/[id]`）

左側：
- AI 摘要框（⚠️ label 寫死 "Gemini auto-summary"，實際 provider 可能是 Claude）
- Choose your AI：
  - Open in Cursor → `cursor://anysphere.cursor-deeplink/prompt?text=<encoded>`（MAX 7800 chars）
  - AskClaude → clipboard（RCA hint）+ 開 claude.ai
  - AskChatGPT → clipboard（Debug plan hint）+ 開 chatgpt.com
  - AskGemini → clipboard（pattern hint）+ 開 gemini.google.com
  - CopyForTerminalButton（codex/copilot/gemini-cli）→ clipboard
  - OpenRemoteUIButton（n8n/supabase）→ clipboard + 開對應 UI
- PasteAiResultBox → `POST /api/ai/save-diagnosis`，role="manual-paste"
- AiDiagnosisTimeline：所有診斷時間線

右側：
- RawPayloadDetails（`<details>` 展開原始 JSON）
- StatusActions

---

### Repair Center（`/ops/repairs`）

**5 個並行查詢**：ops_incidents / repair_runs / system_modes / organizations / tenant_integration_bindings

**5 個 QuickLink**：Integrations（有阻擋時紅色）/ Approvals / System Modes / Build Console

**4 個 Metric 卡片**：
- 待處理佇列數（有 incident 但無 repair_run）
- 進行中修復數（active states）
- 備份閘門（webhook 或 SG+EU SSH）
- GitHub 閘門

**⚠️ 佇列邏輯**：`incidents.filter(i => !runsByIncident.has(i.id))`  
任何 repair_run（含已結案）→ incident 永遠不出現在佇列。無法重啟。

**RepairActions 按鈕（依 state 動態顯示）**：

| 按鈕 | 顯示條件 | API |
|------|---------|-----|
| 核准修復 | mode=start（queue 佇列） | POST /api/ops/repairs |
| 加入 PR | !terminal | POST /api/ops/repairs/[id]/links {github_pr_url} |
| 待部署 | repairing 或 pr_ready | POST /api/ops/repairs/[id]/links {state:deploy_pending} |
| 人工處理 | !terminal | POST /api/ops/repairs/[id]/human-only |
| 結案 | human_only | POST /api/ops/repairs/[id]/links {state:resolved} |
| 確認部署完成 | deploy_pending 或 deploying | POST /api/ops/repairs/[id]/links {state:resolved, deploy_status:passed} |
| 升級修復 | analysis_only + can_escalate + !terminal | POST /api/ops/repairs/[id]/escalate |
| 封存 | terminal + 未封存 | POST /api/ops/repairs/[id]/archive |

---

### Clients（`/ops/clients`）

**資料**：`organizations`，並行 HEAD probe 每個 `client_config.site_url`（5s timeout）

**ClientCard 顯示**：
- 名稱 / slug / clientKind / relationship / status
- 健康狀態（HTTP code + 延遲 ms）
- site_url
- Tags：platform / hosting / internal_external / 部門覆蓋率（X/20）
- 查看警報連結（→ Repair Center `?client_slug`）
- WP 外掛更新摘要（metadata.wp_update_latest）

---

### 客戶詳情（`/ops/clients/[slug]`）

**左欄**：
- WpUpdateButtons（有 SSH config 才顯示，SSE streaming）→ wave1/2/3 分批更新
  - ⚠️ 使用 Tailwind class，但 app 無 Tailwind → **完全無樣式**
- 初始外掛堆疊安裝記錄（package_install_runs）
- 外掛更新狀態（metadata.wp_update_latest）
- 最近 10 筆 ops_action_runs
- 部門覆蓋率面板

**右欄**：
- 快速連結（前台 / WP後台 / Supabase / Trigger.dev / n8n）
- CLI 快速指令（update-client-wp-plugins.ps1 各 wave）
- Raw config JSON

---

### Approvals（`/ops/approvals`）

**資料**：`command_requests`，status=queued，risk_level=high/critical，limit 50

**ApprovalList**：
- 每項：command / args / risk_level / source / actor / trace_id / received_at
- 按鈕：核准（`POST /api/ops/approvals/[id]/approve`）/ 拒絕（prompt reason + POST /reject）
- ⚠️ 實際幾乎永遠空：`/normal_mode` 被 policy 硬擋不進佇列

---

### System Modes（`/ops/system-modes`）

**四種模式**：
- `normal`：全允許
- `read_only`：只允許 low-risk commands
- `maintenance`：全 block（fail-open set 空）
- `emergency_stop`：全 block，解鎖唯一路徑 = 本頁（owner/admin）或 SQL

**SystemModeControl**：select 目標模式 + 輸入 reason + 確認 dialog → `POST /api/ops/system-modes`

**⚠️ 重要**：Telegram `/normal_mode` 被 policy 硬擋（high-risk from telegram = block），emergency_stop 無法從 Telegram 解除。

**Repair Center／自動修復／WP 更新／staging 建站**：`startRepairFromIncident`／`tryRemediate`／`POST /api/ops/clients/[slug]/wp-update`／`POST /api/internal/hosting/provision-staging`（含 `mode:"seed"`）都經 `lib/system-modes/production-change-gate.ts` 的 `checkProductionChangeAllowed()` 把關，只在 mode=normal 執行；讀不到模式 → 擋（T16／T17）。把關用「被改動的那個 org」：建站必帶 `organizationId`（uuid，否則 422）；seed 由 `website_specs.organization_id`、再退 `intake_forms.organization_id` 取得，查詢失敗 → 423 `unavailable`。`getActiveMode` 收到非 uuid 的 org id 一律回 `unavailable`（org id 會串進 PostgREST 過濾字串）。被擋回 423 `{ok:false, error:<可讀訊息>, code:"system_mode_blocks_change", mode}`（唯一定義 `lib/system-modes/blocked-change.ts`；UI 直接顯示 `error`）。T18 起另含 WordPress 文章寫入、WP Bridge、社群發文（org＝所選站的 organization_id）、付費佈建派送；完整清單以 gate 檔頭為準，`lib/system-modes/__tests__/production-change-coverage.test.ts` 擋新增未把關的寫入檔。尚未把關：build/runs＋workflows 派送器、Printful／Chatwoot（TASKS 2026-09-26）。

---

### Integrations（`/ops/integrations`）

**3 個並行查詢**：organizations + assets + tenant_integration_bindings

**13 個 Providers**：sentry / uptime_kuma / grafana / netdata / posthog / github / slack / telegram / n8n / trigger / supabase / wordpress / cloudflare

**IntegrationBlockers**：failed status 的 bindings → 顯示於頁面頂端橙色區塊 + Repair Center 安全閘門

**IntegrationCreatePanel**：選 org + asset + provider + secret_ref → `POST /api/ops/integrations`

**IntegrationRowActions**：每列 validate 按鈕 → `POST /api/ops/integrations/[id]/validate`（呼叫 `checkIntegrationHealth`）

---

### Ops Tools（`/ops/tools`）

Client component，純 localStorage（不寫 DB）：
- 內建 AI 工具（Cursor/ChatGPT/Claude/Gemini Web+CLI/Codex CLI/Copilot CLI）
- 內建通知頻道（Slack #ops-incidents）
- 可自訂新增工具/頻道（存 localStorage）

⚠️ UI 上的工具/頻道列表與實際伺服器通知行為完全無關。實際通知由 env vars 控制。

---

### Ops Onboarding（`/ops/onboarding`）

5 步驟 client component 表單（與 `/onboard` 做相同事）：
1. 公司 & 品牌（company_name / industry / visual_style / logo_status）
2. 客群 & 目標（target_audience / primary_goal[]）
3. 功能需求（pages_needed[] / has_ecommerce / needs_crm / needs_booking）
4. 視覺 & 參考（visual_style[] / reference_sites / language）
5. 素材 & 時程（existing_content / contact_email / domain / budget_tier / launch_urgency）

提交流程：
1. `POST /api/onboarding/submit` → 儲存 `intake_forms`
2. `POST /api/onboarding/generate-spec` → Claude Sonnet 4.6 生成 WebsiteSpec JSON
3. `POST /api/onboarding/trigger-build` → 建立 `ops_action_runs`，跳到 `/build`

---

### Build Console（`/build`）

**3 個 Profile**：
- A：AO-agent / aware-wave.com（internal_setup，actionKey: `ops.profile-a.ao-infrastructure-check`）
- B：新客戶完整雲端（full_install，actionKey: `ops.profile-b.create-wp-site`）
- C：現有 WP 採用（adopt_delta，高風險，backupConfirmed 必填，actionKey: `ops.profile-c.adopt-client-os`）

**2 種 executionMode**：
- `plan_only`：計算 plan，顯示 stages/smoke tests/blockers，不寫 DB
- `enqueue`：POST /api/build/runs → 寫 ops_action_runs → kick Trigger.dev dispatch-action-run

**每 3 秒 poll**：`GET /api/build/runs/[id]` → 顯示 dispatched/running/completed/failed

**Integrations 面板**：Uptime Kuma / Sentry / PostHog / n8n / MainWP

**WP 外掛堆疊**（從 OnboardWizard 帶入 URL params）：selectedPacks / pluginSlugs / paidPluginCount / sshHost / wpPath

---

### Ops Console（`/ops-console`）

⚠️ 這是一個設計上的孤兒頁面，大部分功能未完成。

從 `/api/ops/summary` 讀取：tenants（等同 Clients 頁）+ mediaRules（靜態）+ actions（靜態）

TenantConfigForm：`PATCH /api/ops/tenants/[id]/config`（只能改 status / defaultLocale / defaultTimezone）

AiJobForm：`POST /api/ops/ai-image-jobs`（建立 queued job，實際沒有 Trigger.dev 任務處理）

DepartmentSelector：選擇部門覆蓋率（20 個 clusters）

---

### API Health（`/api-check` + `/api-check-client`）
- `/api-check`（server-side）：直接 fetch `INTERNAL_API_BASE_URL/health`
- `/api-check-client`（browser-side）：瀏覽器端 fetch

---

## 7. 全部 API Routes

### Ops Inbox
| Method | Route | 說明 | Auth |
|--------|-------|------|------|
| GET | `/api/ops/inbox/health` | Pipeline 健康狀態 + 配額 | 公開 |
| GET | `/api/ops/inbox/digest?since=` | Telegram 指令摘要（AO-RESUME 用）| Bearer token |
| GET | `/api/ops/inbox/incidents?source=&since=&until=` | incident 列表（fetch-external-signals 用）| Bearer token |
| POST | `/api/ops/probe` | 心跳 upsert `ops_health_probes`（SG cron 每 30 分鐘）| Bearer token |

### Webhooks
| Method | Route | 說明 |
|--------|-------|------|
| POST | `/api/webhooks/sentry` | Sentry webhook |
| POST | `/api/webhooks/uptime-kuma` | Uptime Kuma webhook |
| POST | `/api/webhooks/grafana` | Grafana webhook |
| POST | `/api/webhooks/netdata` | Netdata webhook（CLEAR 自動 resolve）|
| POST | `/api/webhooks/posthog` | PostHog webhook（需 OPS_INBOX_POSTHOG_ENABLED=true）|
| POST | `/api/webhooks/deploy` | sg-deploy.sh 部署事件 |
| POST | `/api/webhooks/github` | GitHub PR merged → repair_run pr_ready→deploy_pending |
| POST | `/api/webhooks/tenant-integration` | n8n/Trigger upsert tenant_integration_bindings |

### Repair Center
| Method | Route | Auth | 說明 |
|--------|-------|------|------|
| GET | `/api/ops/repairs` | canModifyIncidentStatus | 列表（audit_log 欄位排除）|
| POST | `/api/ops/repairs` | canApproveCommand | 啟動修復 |
| GET | `/api/ops/repairs/health` | 公開 | SSH probe SG+EU + GitHub check（⚠️ 每次都 SSH）|
| POST | `/api/ops/repairs/[id]/links` | canApproveCommand | 更新 PR/state/deploy_status |
| POST | `/api/ops/repairs/[id]/confirm-critical` | canApproveCommand | Critical 二次確認 |
| POST | `/api/ops/repairs/[id]/escalate` | canApproveCommand | analysis_only → auto_repair |
| POST | `/api/ops/repairs/[id]/human-only` | canApproveCommand | 標記人工 |
| POST | `/api/ops/repairs/[id]/archive` | canApproveCommand | 封存 terminal run |
| POST | `/api/ops/repairs/archive-stale` | canApproveCommand | 批次封存（呼叫 archive_stale_repair_runs RPC）|

### Clients
| Method | Route | Auth | 說明 |
|--------|-------|------|------|
| GET | `/api/ops/clients` | 無 | 所有客戶 metadata |
| GET | `/api/ops/clients/[slug]/wp-report` | operator+ 或 sync-key | WP 更新報告 |
| POST | `/api/ops/clients/[slug]/wp-report` | operator+ 或 OPS_PROXY_SHARED_SECRET | 接收 update-client-wp-plugins.ps1 回報 |
| POST | `/api/ops/clients/[slug]/wp-update?wave=` | operator+ | SSE streaming WP 外掛更新 |
| GET | `/api/ops/clients/[slug]/department-summary` | 無 | 部門覆蓋率 |

### System
| Method | Route | Auth | 說明 |
|--------|-------|------|------|
| GET | `/api/ops/system-modes` | 無 | 讀當前 global mode |
| POST | `/api/ops/system-modes` | canChangeSystemMode | 切換模式 + audit event |
| GET | `/api/ops/summary` | 公開 | Tenants + mediaRules + actions（Ops Console 用）|
| GET | `/api/ops/audit-events?...` | 無 | audit log 查詢 |
| GET | `/api/ops/workflow-runs?limit=` | 無 | ops_action_runs 列表 |
| GET/PATCH | `/api/ops/tenants/[id]/config` | PATCH→canWriteTenantConfig | Tenant config 讀寫 |
| POST | `/api/ops/organizations` | canWriteTenantConfig | Upsert organization（Onboarding 用）|
| GET | `/api/ops/integrations` | 無 | 整合列表 |
| POST | `/api/ops/integrations` | canWriteTenantConfig | 新增 binding |
| POST | `/api/ops/ai-image-jobs` | canCreateAiImageJob | 建立 AI 生圖 job |
| GET | `/api/ops/analytics-context` | 無 | PostHog super-properties role/source |

### Approvals
| Method | Route | Auth | 說明 |
|--------|-------|------|------|
| GET | `/api/ops/approvals` | 無（前端讀 canApproveCommand）| 列表 |
| POST | `/api/ops/approvals/[id]/approve` | canApproveCommand | 執行 handler + status=completed |
| POST | `/api/ops/approvals/[id]/reject` | canApproveCommand | status=blocked_by_policy |

### AI
| Method | Route | Auth | 說明 |
|--------|-------|------|------|
| POST | `/api/ai/auto-classify` | canTriggerAiDiagnose | 手動觸發 AI 分類 |
| POST | `/api/ai/save-diagnosis` | canTriggerAiDiagnose | 儲存 manual-paste 診斷 |

### Build
| Method | Route | Auth | 說明 |
|--------|-------|------|------|
| POST | `/api/build/runs` | operator+ | 建立 plan / enqueue run |
| GET | `/api/build/runs/[id]` | 無 | 讀 run 狀態（polling 用）|

### Onboarding
| Method | Route | Auth | 說明 |
|--------|-------|------|------|
| POST | `/api/onboarding/submit` | operator+ | 儲存 intake_form |
| POST | `/api/onboarding/generate-spec` | operator+ | Claude 生成 WebsiteSpec |
| POST | `/api/onboarding/trigger-build` | operator+ | 建立 ops_action_runs |

### Internal
| Method | Route | Auth | 說明 |
|--------|-------|------|------|
| POST | `/api/internal/commands/telegram` | TELEGRAM_WEBHOOK_SECRET + user allowlist | Telegram webhook ingress |
| POST | `/api/internal/commands/slack` | Slack HMAC-SHA256 | Slack interactive approval（approve_repair / acknowledge）|
| POST | `/api/internal/commands/dispatch` | 尚未實作（501）| Phase 2 placeholder |
| POST | `/api/internal/hosting/provision-staging` | LOBSTER_HOSTING_API_TOKEN | SSH 進 WordPress 容器建立 staging 子目錄 |

---

## 8. Lib 模組詳解

### ops-inbox/fingerprint.ts
各 source 的 fingerprint 策略：
```
sentry:     SHA256("sentry:" + issue.id)
uptime_kuma: SHA256("kuma:" + monitor.id + ":" + type)
grafana:    SHA256("grafana:" + alerts[0].fingerprint)
netdata:    SHA256("netdata:" + host + ":" + raw.name)  ← raw.alarm 不用！
posthog:    SHA256("posthog:" + alert_id)
default:    正規化 title（移除 hex/數字/字串字面）後 SHA256
```

### repair-center/policy.ts（來源策略）
| Source | Policy | can_escalate_to_pr |
|--------|--------|-------------------|
| Sentry | auto_repair | false（已是最高）|
| Uptime Kuma | analysis_only | true |
| Grafana | analysis_only | true |
| PostHog | analysis_only | false（業務信號≠bug）|
| Netdata | human_only | false |
| Deploy | human_only | false |
| Manual | triage_needed | false |

### repair-center/ssh.ts
使用 `ssh2` 套件。
`readPrivateKeyFromEnv(envName)`：讀 base64 or raw PEM。
`connectSsh` / `sshExec`：標準 Promise-based SSH。

### command-plane/policyEngine.ts
```
RISK_TABLE（已知指令風險）：
  low:    /start /help /status /health /daily_review /weekly_review /list_failed_runs /client_status
  medium: /emergency_stop /maintenance_mode /read_only_mode /replay_dead_letter /trigger_staging_workflow
  high:   /normal_mode /deploy_production /refund /dns_change /rotate_secrets
  critical: /drop_table /read_secrets /destructive_migration /cross_tenant_export /disable_killswitch

HARD_BLOCK_FROM：
  telegram/slack/email: high + critical = block
  webhook/schedule: critical = block
  internal: critical = block

未知指令 → 預設 high（deny-by-default）

Forbidden args：--no-verify / --force / ;& | ` $( → critical block
```

### command-plane/killSwitch.ts
```
emergency_stop → 全部 block
maintenance → block（fail-open set = 空，所以所有 risk 都 block）
read_only → 非 low 全 block
normal → 不 block
```
unavailable（讀不到 system_modes 或出現不認得的 mode）→ 全 block；兩種情況都會呼叫 `Sentry.captureMessage`（tags `{component:"kill-switch"}`）帶原因，同一訊息 5 分鐘內只報一次（`/api/ops/repairs/health` 公開且被輪詢），DB 讀取本身不寫入。

### build-console/contracts.ts（3 個 Profile 的 plan 邏輯）
- Profile A：actionKey `ops.profile-a.ao-infrastructure-check`，applyMode=internal_setup
- Profile B：actionKey `ops.profile-b.create-wp-site`，applyMode=full_install
- Profile C：actionKey `ops.profile-c.adopt-client-os`，applyMode=adopt_delta，approvalRequired=true，riskLevel=high

### onboarding/spec-generator.ts
使用 claude-sonnet-4-6（`max_tokens: 4096`，60s timeout），system prompt 要求回傳嚴格 JSON 結構，server-side 做 validateSpec() 驗證。

### onboarding/package-selector.ts（自動選 package）
```
POD 電商 → wc-custom + [base, ecommerce]
有電商 → wc-core + [base, ecommerce]
旅遊/booking/needs_booking → wp-business + [base, tourism]
needs_crm 或 budget≥business → wp-business + [base, brand]
其他 → wp-basic + [base]
```

### wp-plugin-stack-catalog.ts（36 個外掛）
- Base（16）：Kadence / Kadence Blocks / Wordfence / WPvivid / Rank Math / Redirection / LiteSpeed Cache（conditional:is_litespeed）/ ShortPixel / SSL / FluentForms / FluentSMTP / FluentCRM / CleanTalk（free alt: akismet）/ GTM4WP / ACF / Complianz（optional）
- Ecommerce（12）：WooCommerce / Kadence Shop Kit（paid）/ ECPay綠界（paid）/ Stripe / PDF Invoices / YITH Wishlist / YITH Points（paid）/ Fluent Reviews / Variation Swatches / CartFlows / Cart Abandonment Recovery / Kadence WC Email Designer
- Tourism（5）：WP Travel Engine / CPT UI / Modula Gallery / WP Maps Pro（paid，alt: leaflet）/ TranslatePress（optional）
- Brand（3）：CPT UI / Modula Gallery / Popup Maker

### integration-health.ts（13 個 provider 的 API 健康檢查）
每個 provider 有對應的 API 端點驗證：
- cloudflare → `api.cloudflare.com/client/v4/user/tokens/verify`（多 candidate token）
- sentry → `/api/0/organizations/`
- slack → `slack.com/api/auth.test`
- posthog → `/api/projects/`
- supabase → `/rest/v1/`
- n8n → `/api/v1/workflows?limit=1`
- trigger → reachability check
- grafana → `/api/health`（docker internal fallback）
- netdata → `/api/v1/info`
- uptime_kuma → `/api/health`

Token 解析：`vault:ENV_NAME` → `process.env.ENV_NAME`，fallback `DEFAULT_ENV_BY_PROVIDER[provider]`

### analytics.ts
PostHog typed events：`OPS_CONSOLE_VIEWED` / `OPS_INBOX_VIEWED` / `API_CHECK_*` / `ADMIN_LOGIN` / `ADMIN_LOGOUT`

providers.tsx（PHProvider）：
- `capture_pageview: "history_change"`（App Router 分頁）
- `autocapture: false`
- `capture_exceptions: true`
- `session_recording: { maskAllInputs: true, maskTextSelector: '[data-sensitive]' }`

---

## 9. Command Plane（Telegram Bot）

### 入口
`POST /api/internal/commands/telegram`

### 認證（三層）
1. `X-Telegram-Bot-Api-Secret-Token` header timing-safe 比對 `TELEGRAM_WEBHOOK_SECRET`
2. `message.from.id` ∈ `TELEGRAM_ALLOWED_USER_IDS`（csv）
3. `message.chat.id` ∈ `TELEGRAM_ALLOWED_CHAT_IDS`（csv）
- 任何失敗 → **回 200 OK**（不回 401，防攻擊者探測端點）
- 只寫 `error_events` 審計記錄

### routeCommand 流程
```
1. evaluatePolicy → RISK_TABLE
2. claimCommandRequest（INSERT，unique(source,source_event_id)，衝突→refetch）
3. getActiveMode（client scope 優先 global）
4. evaluateKillSwitch
5. outcome=block → blocked_by_policy
6. outcome=require_approval → status=queued（Approvals 頁）
7. outcome=allow → 呼叫 handler → status=completed/failed
```

### 11 個已實作 handlers

| 指令 | Risk | 說明 |
|------|------|------|
| `/start` `/help` | low | 歡迎訊息（無 DB 查詢）|
| `/status` | low | system_mode + 最近 5 指令 + 開放 incidents |
| `/health` | low | incidents 計數 + probe freshness（OPS_INBOX_MAX_INGEST_AGE_MINUTES，預設 1440）|
| `/daily_review` | low | 24h Claude Sonnet 4.6 AI 摘要（ANTHROPIC_API_KEY + prompt caching）|
| `/weekly_review` | low | 7d Claude Sonnet 4.6 AI 摘要（計數為主，不 dump rows）|
| `/list_failed_runs` | low | command_requests + workflow_runs 失敗記錄 |
| `/client_status [slug]` | low | 單一/全部客戶健康 + WP 更新（parallel HEAD probe）|
| `/emergency_stop` | medium | system_modes UPDATE → emergency_stop |
| `/maintenance_mode` | medium | system_modes UPDATE → maintenance |
| `/read_only_mode` | medium | system_modes UPDATE → read_only |
| `/trigger_staging_workflow <task>` | medium | Trigger.dev REST trigger（ALLOWED_TASKS = ['ao-infrastructure-check']）|
| `/replay_dead_letter <id>` | medium | 查詢 error_events（Phase 2b 診斷，不真正 replay）|
| `/normal_mode` | **high（Telegram 硬擋）** | 只能從 Approvals 頁核准後執行 |

### sendTelegramMessage（三層容錯）
1. Markdown 模式
2. 若 400 → plain text retry
3. 若仍失敗 → Sentry（403/429/5xx 各別處理）

### AI 摘要（_anthropic.ts）
- 模型：`ANTHROPIC_MODEL` env（預設 `claude-sonnet-4-6`）
- System prompt 用 `cache_control: { type: "ephemeral" }`（prompt caching）
- 錯誤分類：401/403→Sentry（actionable）/ 429/529→silent / 其他→Sentry
- 失敗→回傳 raw JSON fallback（不 throw，handler always completes）

---

## 10. Repair Center 完整邏輯

### 狀態機
```
detected
  ↓ startRepairFromIncident()
triage_needed  ← critical severity gate（需 confirmCriticalRun()）
  ↓ 通過
backing_up     ← runPreRepairBackup()
  ↓ backup passed
approved       ← state transition
  ↓ createRepairIssue()
repairing      ← GitHub Issue 建立
  ↓ PR opened → pr_ready
pr_ready
  ↓ PR merged（GitHub webhook）
deploy_pending
  ↓ operator 手動 sg-deploy.sh
deploying
  ↓ confirmDeployed()
resolved       ← terminal

human_only     ← terminal（policy=human_only 或 operator 標記）
rolled_back    ← terminal
```

### Backup Gate（runPreRepairBackup）
**模式一：Webhook**（`AUTO_REPAIR_BACKUP_WEBHOOK_URL`）
- POST payload：repair_run_id / incident_id / source / client_slug / title / fingerprint
- 要求回應：JSON，含 `backup_id` 或 `backupRef`
- M5 fix：`jsonParsed && backupRef` 都要有，否則 fail
- size_bytes 若存在需 ≥ 1024

**模式二：SSH**（預設）
- SG：`cd /root/lobster-phase1 && backup-phase1.sh && verify-backup.sh`
- EU：`/root/scripts/backup-eu-stack.sh && verify-backup-eu.sh`
- Path safety：safeScriptPath()，禁 `..` 和非 `[/A-Za-z0-9_.-]+`
- SSH stdout/stderr 截斷 500 bytes
- 退出碼 127 = script_not_found / 255 = ssh_connection_failed

### GitHub Issue 格式
```markdown
@claude

### Auto-Repair Request
Policy / Repair Run ID / Incident ID / Source / Severity / Backup

### Incident
Title + Message + Ops Inbox URL + Repair Center URL

### Required Output
只在 code-scoped 且安全時開 PR。含中文摘要：問題/原因/修法/風險/建議

### Guardrails
不可改：secrets/env/auth/payment/migrations/nginx/Dockerfile
不可部署 production / 不可 empty catch
```

### GitHub webhook（PR merged 自動推進）
```javascript
event === "pull_request" && action === "closed" && merged
  → 查 repair_runs WHERE github_pr_number=prNumber AND state="pr_ready"
  → UPDATE state="deploy_pending"
```
**⚠️ 未處理**：PR closed but NOT merged → repair_run 永遠卡在 pr_ready。

### `/api/ops/repairs/health` 的 GAP checks
- **GAP-01**：SSH stat 備份腳本（real-time，每次 GET 都 SSH）
- **GAP-03**：GitHub repo + push access + Claude App 三層檢測（env var → comments API → unverified）
- **GAP-04**：VPS `/etc/apt/apt.conf.d/52awarewave-auto-reboot` 存在性

---

## 11. Build Console & Onboarding

### Build Console Plan 邏輯（buildConsolePlan）

Profile A（ao-infrastructure-check）：
- 7 個 stages：precheck / supabase_sep / rls / edge / monitoring / netdata / report
- smoke tests：5 個 internal checks

Profile B（create-wp-site）：
- 8 個 stages：records / provision / manifest / mainwp / monitoring / smoke / handoff / approval_gate
- smoke tests 依 smokeProfile（basic/business/woocommerce）

Profile C（adopt-client-os）：
- 8 個 stages：records / backup / audit / classify / approval / delta / smoke / handoff
- riskLevel=high，approvalRequired=true
- smoke tests：8 個 adopt 驗證

### `/api/build/runs` 流程
1. 驗 role（operator+）
2. normalizeBuildRequest + validateBuildRequest
3. buildConsolePlan + 檢查 blockers
4. 查 ops_action_catalog 確認 action_key 存在且 enabled
5. 查重複 run（同 site_id 且 pending/running/dispatched）
6. INSERT ops_action_runs（status=pending）
7. INSERT ops_audit_events（event_type=build_run_enqueued）
8. kickActionRunDispatcher()（POST Trigger.dev /api/v1/tasks/dispatch-action-run/trigger）

### provision-staging（`/api/internal/hosting/provision-staging`）
Auth：Bearer `LOBSTER_HOSTING_API_TOKEN`，called by create-wp-site Trigger.dev task。

流程（SSH `HOSTING_BRIDGE_SSH_*` → forced command `scripts/aw-hosting-gate.sh`，只有 2 個 verb；2026-09-24）：
1–4. `staging-prepare {slug} wp_s_{siteId}`：mkdir + CREATE DATABASE + 該站自己的 DB 帳號（名 = DB 名）+ wp core download + wp config create；密碼只走 stdin，next-admin 不持有任何 DB 密碼；既有站若仍用主站帳號會被遷移到自己的帳號
5+. `staging-wp {slug}`（stdin = bash 腳本，www-data 身分）：wp core install（admin 密碼走 `--prompt` stdin；staging URL: `aware-wave.com/staging/{slug}/`）
6. wp theme install kadence（activate）
7. wp plugin install `basePlugins + ecommercePlugins + pluginSlugs`（activate）
8. Return：environmentId / wpRootPath / stagingSiteUrl / wpAdminUrl / adminPass

---

## 12. Trigger.dev 任務

所有任務在 EU VPS（`trigger.aware-wave.com`），env vars 用 `LOBSTER_SUPABASE_URL` + `LOBSTER_SUPABASE_SERVICE_ROLE_KEY`。

### dispatch-action-run（輪詢式 dispatcher）
Action key → task ID 路由：
```
ops.profile-a.ao-infrastructure-check → ao-infrastructure-check
ops.profile-b.create-wp-site           → create-wp-site
ops.profile-c.adopt-client-os          → adopt-client-os
```
- 查 `ops_action_runs` status=pending
- 解析 action_key（從 ops_action_catalog join）
- `tasks.trigger(taskId, payload)`
- 更新 run status

### ao-infrastructure-check
7 個 checks：Supabase REST / Trigger.dev / n8n / Uptime Kuma / Sentry / PostHog / RLS isolation smoke

### create-wp-site（Profile B）
SSRF guard（拒絕 RFC-1918 / loopback / link-local URLs），呼叫 `resolveStagingProvisioning()` + `runAllIntegrations()`

### adopt-client-os（Profile C）
11 個步驟：validate_site → backup → audit → classify_delta → approval → apply_delta → install_mainwp → connect_mainwp → register_monitoring → smoke → handoff

### wp-install-plugins
SSH WP-CLI 安裝 plugin slugs（LOBSTER_EXECUTE_MANIFEST_STEPS=true 才真的執行，否則 dry-run）

### apply-manifest
讀 manifest JSON/YAML 文件，逐步執行 install_theme / install_plugin / conditional_plugin。
Path traversal 防護：禁止 `..`。
`LOBSTER_EXECUTE_MANIFEST_STEPS` env 控制真正執行或 dry-run。

---

## 13. 完整環境變數清單

### 核心
```
SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
INTERNAL_API_BASE_URL                    # node-api 位置（容器內: http://node-api:3001）
INTERNAL_ADMIN_BASE_URL                  # 自身 admin 位置（ops-console 自呼叫）
PORT                                     # 預設 3000
```

### 認證 / 角色
```
OPS_PROXY_SHARED_SECRET                  # trusted proxy header 比對
OPS_ROLE_RESOLUTION_MODE                 # claims_only | claims_with_simulated_fallback
OPS_ALLOW_SIMULATED_ROLE_FALLBACK        # true / false
OPS_SIMULATED_FALLBACK_ROLE              # operator（預設）
```

### Ops Inbox
```
OPS_INBOX_INGEST_TOKEN                   # webhook Bearer token
OPS_INBOX_NOTIFY_ENABLED                 # true/false（無設定時依 SLACK webhook 決定）
OPS_INBOX_SLACK_INCIDENTS_WEBHOOK        # Slack incoming webhook
OPS_INBOX_PUBLIC_URL                     # https://app.aware-wave.com（通知連結用）
OPS_INBOX_TELEGRAM_NOTIFY_ENABLED        # true/false
OPS_INBOX_TELEGRAM_NOTIFY_MIN_SEVERITY   # low/medium/high/critical（預設 medium）
OPS_INBOX_TELEGRAM_CHAT_IDS             # csv chat IDs
OPS_INBOX_POSTHOG_ENABLED               # true → 接受 PostHog webhook
OPS_INBOX_GEMINI_ENABLED                # legacy，有 GEMINI_API_KEY 即啟用
OPS_INBOX_GEMINI_DAILY_LIMIT            # 預設 1400
OPS_INBOX_MAX_INGEST_AGE_MINUTES        # 預設 1440（24h）
OPS_INBOX_REQUIRE_RECENT_INGEST         # true（預設）
OPS_AGGRESSIVE_REDACT                   # true → 額外 base64 掃描
GEMINI_API_KEY
ANTHROPIC_API_KEY
```

### Telegram Command Plane
```
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_ALLOWED_USER_IDS               # csv user IDs
TELEGRAM_ALLOWED_CHAT_IDS               # csv chat IDs
COMMAND_PLANE_DEFAULT_ORG_ID            # Phase 1 single-owner org UUID
COMMAND_PLANE_DEFAULT_WORKSPACE_ID
```

### Slack
```
SLACK_SIGNING_SECRET                    # Slack interactive webhook 驗證
SLACK_BOT_TOKEN
SLACK_OPS_INCIDENTS_CHANNEL_ID
SLACK_INFRA_ALERTS_CHANNEL_ID
SLACK_GITHUB_PRS_CHANNEL_ID
```

### Repair Center
```
AUTO_REPAIR_BACKUP_WEBHOOK_URL          # webhook 模式
AUTO_REPAIR_BACKUP_WEBHOOK_TOKEN
AUTO_REPAIR_SG_SSH_HOST                 # SSH backup SG
AUTO_REPAIR_SG_SSH_PORT                 # 預設 22
AUTO_REPAIR_SG_SSH_USER                 # 預設 root
AUTO_REPAIR_SG_SSH_KEY_ENV              # env var 名稱（優先）
AUTO_REPAIR_SG_SSH_KEY_B64              # base64 private key（fallback）
AUTO_REPAIR_EU_SSH_HOST                 # SSH backup EU
AUTO_REPAIR_EU_SSH_PORT
AUTO_REPAIR_EU_SSH_USER
AUTO_REPAIR_EU_SSH_KEY_ENV
AUTO_REPAIR_EU_SSH_KEY_B64
AUTO_REPAIR_REQUIRE_EU_BACKUP           # true（預設）
AUTO_REPAIR_SG_PHASE1_ROOT              # 預設 /root/lobster-phase1
AUTO_REPAIR_SG_BACKUP_SCRIPT            # 預設 ./scripts/backup-phase1.sh
AUTO_REPAIR_SG_VERIFY_SCRIPT            # 預設 ./scripts/verify-backup.sh
AUTO_REPAIR_EU_BACKUP_SCRIPT            # 預設 /root/scripts/backup-eu-stack.sh
AUTO_REPAIR_EU_VERIFY_SCRIPT
AUTO_REPAIR_GITHUB_TOKEN                # GitHub Issue 建立
AUTO_REPAIR_GITHUB_OWNER                # 預設 awarewaveai-pei
AUTO_REPAIR_GITHUB_REPO                 # 預設 Work
AUTO_REPAIR_GITHUB_APP_CONFIRMED        # true → skip bot detection check
GITHUB_WEBHOOK_SECRET
```

### WP 更新
```
SSH_KEY_<NAME>                          # base64 private key（NAME = client_config.ssh_key_name uppercase）
SSH_KEY_HOSTINGER_SOULFUL               # soulful client
OPS_PROXY_SHARED_SECRET                 # 也用於 wp-report sync key
```

### Integration Health
```
CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID（account token，驗 /accounts/<id>/tokens/verify）
SENTRY_AUTH_TOKEN
POSTHOG_PERSONAL_API_KEY / POSTHOG_API_KEY
N8N_API_KEY / N8N_AUTH_BEARER_TOKEN
UPTIME_KUMA_API_KEY / UPTIME_KUMA_URL
GRAFANA_BASE_URL / GRAFANA_INTERNAL_BASE_URL / GRAFANA_SERVICE_ACCOUNT_TOKEN
NETDATA_BASE_URL / NETDATA_API_TOKEN
SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY
SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY
SLACK_BOT_TOKEN
```

### Build / Trigger.dev
```
TRIGGER_SECRET_KEY                      # kick dispatcher（非 SDK token）
TRIGGER_ACCESS_TOKEN                    # Trigger.dev SDK runtime
TRIGGER_API_URL                         # 預設 https://api.trigger.dev
LOBSTER_HOSTING_API_TOKEN               # provision-staging auth
HOSTING_BRIDGE_SSH_HOST / _PORT / _USER / _KEY_B64 / _HOST_KEY_SHA256   # provision-staging；key 只能跑 aw-hosting-gate.sh；缺 host key 指紋 = 503（fail-closed）
```

### PostHog
```
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST                # 預設 https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_DISTINCT_ID         # 可選，操作者 ID
```

### Sentry
```
NEXT_PUBLIC_SENTRY_DSN
```

---

## 14. 已知問題完整分析（12 項）

### 快速索引

> **✅ 2026-06-05 大修：12 問題全數處理。** 下表「狀態 / 怎麼解的」為大修結果；下方各問題詳述為**大修前的分析**（根因 + 當時的 code evidence），保留作歷史與根因參考。現況以 [`APP_AWARE_WAVE_CURRENT_STATE.md`](APP_AWARE_WAVE_CURRENT_STATE.md) 為準。

| # | 問題 | 嚴重性 | 狀態 / 怎麼解的（2026-06-05）|
|---|------|--------|------|
| 1 | Auth production 預設 403 | 🔴 致命 | ✅ **改用 Supabase Auth 身分層**（email+密碼 session）取代失效的 proxy-trust。新增 `lib/supabase/ssr.ts` + 重寫 `middleware.ts`（驗 session→`app_metadata.ops_role`→注入 `x-ops-claims-role`，fail-closed，anti-spoof，保護整個 console）+ `app/login/`。admin=`awarewaveai@gmail.com`(owner)。移除多餘 nginx basic-auth。詳見 CURRENT_STATE §1 |
| 2 | WpUpdateButtons 完全無樣式 | 🔴 功能壞掉 | ✅ Tailwind class → `globals.css` 新增 `.wp-up-*` 真實 CSS class（支援 hover/disabled/spin）|
| 3 | 三個名字指向同一頁 | 🟠 混亂 | ✅ 統一稱「Ops Inbox」（sidebar「Incident Engine」改名，對齊 Dashboard + URL）|
| 4 | 兩個 Onboarding 入口做同樣的事 | 🟠 混亂 | ✅ **已釐清**：VBC 發現實為兩個**不同階段**工具，非重複 —— `/ops/onboarding`=客戶探索式 intake 問卷（用 `IntakeForm` type）、`/onboard`=operator 技術建站精靈（slug/部門→Build Console）。sidebar 標籤改清楚：「Onboarding（客戶 Intake）」第1步 vs「建站精靈（技術）」第2步 |
| 5 | Repair Center 佇列邏輯有漏洞 | 🟠 邏輯錯誤 | ✅ filter 改為只隱藏被 active-state 或 human_only run 擁有的 incident；resolved/rolled_back 可重試回佇列（`startRepairFromIncident` 本就 reuse run）|
| 6 | repairs/health 每次 GET 做真實 SSH | 🟠 效能問題 | ✅ 昂貴探測（4 SSH+2 GitHub）加 60s TTL cache（`getExpensiveProbes`）；system_mode/active_runs 仍即時。回應加 `probe_cache` 欄位 |
| 7 | GitHub PR 棄案不處理 | 🟡 漏洞 | ✅ webhook 處理 `closed && !merged` → `human_only` + `needs_human_review` + audit `pr_abandoned`（保留 `.eq(state,pr_ready)` guard）|
| 8 | 沒有任何即時更新機制 | 🟡 體驗差 | ✅ 新增 `AutoRefresh` client 元件（分頁可見時 `router.refresh()`）接入 Repair Center(15s)/Ops Inbox(20s)/Approvals(20s)。無 SSE |
| 9 | AI summary label 寫死為 "Gemini" | 🟡 資訊錯誤 | ✅ `AutoSummary` 元件改讀 `ai_diagnoses.provider` 動態顯示（claude/gemini/chatgpt/cursor）|
| 10 | Approvals 頁幾乎永遠空 | 🟡 設計錯誤 | ✅ 改善空狀態：誠實說明佇列用途 + emergency_stop 解鎖導向 System Modes（`/normal_mode` 從 Telegram 被 policy 擋，不入佇列）|
| 11 | Ops Console 是孤兒頁面 | 🟡 設計錯誤 | ✅ 加導向 banner（非破壞性保留）：標明診斷/參考頁，日常操作導向 Clients/Build Console，註明 AI Image Job 未接 Trigger.dev |
| 12 | Ops Inbox → Repair Center 導覽是斷的 | 🟡 UX | ✅ Incident 詳情頁加 `RepairPanel`：有 run 顯示狀態+連結；無 run 且 production 重用 `RepairActions` 啟動修復 |

> 部署：P1/P2/P5/P6/P7/P9/P12 + P3 已上線（prod）；P8/P10/P11 已 commit（`04869f73`），部署待並行 Tarot 功能 typecheck 修復後隨下次 sg-deploy 一起上。

---

### 問題 1：Auth 在 production 基本上壞掉 🔴

**根本原因**：`middleware.ts` 的邏輯：

```typescript
// middleware.ts
function hasTrustedProxyAuth(request: NextRequest): boolean {
  const expected = process.env.OPS_PROXY_SHARED_SECRET;
  if (!expected) return !isProductionLike();          // production → false
  return request.headers.get(PROXY_AUTH_HEADER) === expected;
}

// ...
if (!trustedProxy && isProductionLike()) {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
```

Production 環境（`NODE_ENV=production`）下，所有 `/ops/*` 和 `/api/ops/*` 請求都需要 nginx 注入 `x-ops-proxy-auth` header 且值等於 `OPS_PROXY_SHARED_SECRET`。

但 `nginx/default.conf` 完全沒有注入這個 header 的設定。

**結果**：
- 整個 admin UI 的所有頁面，在 production 下對瀏覽器直接請求都回 **403**
- 使用者角色永遠是 `default_viewer`（`resolveOpsRole` fallback）
- 所有寫入操作（Repair / Approvals / System Modes）全部被攔
- 唯一例外：`/api/ops/summary`、`/api/ops/inbox/health`、`/api/webhooks/*`（這些路徑在 middleware 免驗）

**影響範圍**：`/ops/*`、`/api/ops/*`（除免驗路徑）、`/api/ai/*`、`/api/build/*`、`/api/onboarding/*`

**修法方向**：在 nginx 的 `app.aware-wave.com` server block 注入 proxy-auth header，或改用 Cloudflare Access 注入 claims header。

---

### 問題 2：WpUpdateButtons 完全無樣式 🔴

**位置**：`app/ops/clients/[slug]/WpUpdateButtons.tsx`

**根本原因**：元件全部使用 Tailwind CSS class：

```tsx
// WpUpdateButtons.tsx
className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${meta.colour}`}
// 其中 meta.colour = "bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white"

className="animate-spin"   // loading spinner

className="rounded border ${WAVE_META[running ?? 'wave3'].borderColour} bg-black font-mono text-xs text-green-400 p-3"
```

但整個 `next-admin` 應用使用**純 CSS 變數**（`globals.css`），**沒有安裝 Tailwind CSS**。`package.json` 中沒有 `tailwindcss` 依賴，也沒有 `tailwind.config.js`。

**結果**：
- Wave 1/2/3 更新按鈕無任何顏色和 padding
- Abort 按鈕無樣式
- Loading spinner（animate-spin）不旋轉
- SSH log 輸出視窗沒有黑底綠字

**修法**：將所有 Tailwind class 改為 inline style 或 CSS 變數，與 app 其他元件一致。

---

### 問題 3：三個名字指向同一個頁面 🟠

**位置**：`app/layout.tsx`（側欄）、`app/page.tsx`（Dashboard）

同一個頁面 `/ops/inbox` 在三個地方有三個不同的名稱：

| 位置 | 顯示名稱 | 指向路徑 |
|------|---------|---------|
| 側欄 Repair OS 區 | Repair Center（但 `OpsInboxBadge` 數字指向 `/ops/inbox`）| `/ops/repairs`（badge 讀 `/ops/inbox` health）|
| 側欄 System 區 | "◇ Incident Engine" | `/ops/inbox` |
| Dashboard 主頁 NavCard | "📥 Ops Inbox" | `/ops/inbox` |

`OpsInboxBadge`（側欄 Repair Center 旁的紅色數字）每 30 秒 poll `/api/ops/inbox/health`，顯示 `open_count`，但視覺上貼在「Repair Center」旁邊，讓使用者以為那是 repair run 的數量。

**結果**：使用者不知道「Ops Inbox」和「Incident Engine」是同一個東西，也不清楚 badge 代表什麼。

---

### 問題 4：兩個 Onboarding 入口做完全相同的事 🟠

| 入口 | 路徑 | 元件 |
|------|------|------|
| Dashboard「✦ New Client Onboarding」連結 | `/onboard` | `OnboardWizard.tsx`（5步驟）|
| 側欄「✨ Onboarding」連結 | `/ops/onboarding` | `ops/onboarding/page.tsx`（5步驟）|

兩個都呼叫完全相同的後端：
```
POST /api/onboarding/submit
POST /api/onboarding/generate-spec
POST /api/onboarding/trigger-build
```

兩個的表單欄位也幾乎完全相同（company_name / industry / primary_goal / pages_needed / has_ecommerce 等）。

**結果**：使用者不知道用哪個，兩個入口都存在造成混淆。實際應只保留一個，或明確區分用途。

---

### 問題 5：Repair Center 待處理佇列邏輯有漏洞 🟠

**位置**：`app/ops/repairs/page.tsx:83`

```typescript
// 問題在這裡
const queue = incidents
  .filter((i) => !runsByIncident.has(i.id))
  .map((i) => ({ incident: i, policy: policyForIncident(i.source, i.severity) }));
```

`runsByIncident` 是所有 `repair_runs`（含 `is("archived_at", null)`）的 Map。只要一個 incident 有任何 repair_run（不論狀態是 `resolved`、`rolled_back`、`human_only`），它就**永遠從「待處理佇列」消失**。

**結果**：
- 一個 incident 第一次修復失敗（`human_only`）→ 佇列中消失
- 操作者無法從 Repair Center 的佇列發起第二次修復嘗試
- 只能手動去 Ops Inbox → 詳情 → 但詳情頁也沒有「啟動修復」按鈕（問題 12）

**修法方向**：佇列邏輯應只過濾掉 **active-state** repair_runs（detected/triage_needed/approved/backing_up/repairing/pr_ready），terminal state（resolved/rolled_back/human_only）的 run 不應擋住 incident 重新進入佇列。

---

### 問題 6：repairs/health 每次 GET 做真實 SSH 連線 🟠

**位置**：`app/api/ops/repairs/health/route.ts`（GAP-01 / GAP-04 部分）

```typescript
// 每次 GET /api/ops/repairs/health 都執行：
const [scriptProbe, githubCheck, autoRebootProbe] = await Promise.all([
  probeBackupScripts(backupMode),    // SSH 進 SG + EU，各 stat 一個腳本
  checkGithubRepoAndApp(...),        // GitHub API 呼叫
  probeAutoRebootConfig(backupMode), // SSH 進 SG + EU，各 stat 一個 apt config
]);
```

`probeBackupScripts()` 和 `probeAutoRebootConfig()` 各做：
- `connectSsh(SG)` + `sshExec("test -f ...")` + `conn.end()`
- `connectSsh(EU)` + `sshExec("test -f ...")` + `conn.end()`
- 每個 SSH 連線 5 秒 timeout

**觸發頻率**：Repair Center 頁面（`/ops/repairs`）的頁面邏輯中直接顯示 `GET /api/ops/repairs/health` 的結果（Safety Gates 區塊）。Repair Center 有 `force-dynamic`，每次 page load 都觸發一次 health check → **每次 page load = 4 個 SSH 連線**（SG backup + EU backup + SG auto-reboot + EU auto-reboot）。

**修法方向**：加 TTL cache（如 5-10 分鐘），或移到背景 cron job 更新，不在 page load 時同步 SSH。

---

### 問題 7：GitHub PR 被關閉但未合併時 repair_run 永遠卡住 🟡

**位置**：`app/api/webhooks/github/route.ts:54`

```typescript
if (p.action !== "closed" || !(p.pull_request as Record<string, unknown>)?.merged) {
  return NextResponse.json({ ignored: true, action: p.action });
}
```

只處理 `action === "closed" && merged === true`。PR 被 close 但 `merged === false`（手動放棄）時，直接回 `{ ignored: true }`，不做任何處理。

**結果**：
- repair_run 永遠停在 `pr_ready` 狀態
- 沒有自動轉 `human_only` 或通知操作者
- 操作者必須手動去 Repair Center → 點「人工處理」才能清掉

**修法**：處理 `closed && !merged` → 更新 repair_run state 為 `human_only`，audit_log 記錄 `pr_abandoned`。

---

### 問題 8：沒有任何即時更新機制 🟡

所有頁面都是 Next.js Server Components + `export const dynamic = "force-dynamic"`，每次重整才拿到新資料。

**受影響的核心操作頁面**：
- `/ops/repairs`：啟動修復後沒有進度更新，要手動重整才看到 state 改變
- `/ops/inbox`：新 incident 進來不會自動出現
- `/ops/approvals`：新 command_request 進入佇列後不顯示
- `/ops/clients`：WP 更新完後不自動更新

**唯一有更新的地方**：
- `Build Console`：每 3 秒 poll `/api/build/runs/[id]`（`setInterval(poll, 3000)`）
- `OpsInboxBadge`：每 30 秒 poll `/api/ops/inbox/health`（`setInterval(tick, 30000)`）

**修法方向**：對 Repair Center 和 Ops Inbox 加入 Server-Sent Events 或 polling，或使用 Supabase Realtime（`ops_incidents` / `repair_runs` 表的 changes 訂閱）。

---

### 問題 9：Incident 詳情頁 AI 分類 label 寫死為 "Gemini" 🟡

**位置**：`app/ops/inbox/[id]/page.tsx:51`

```tsx
<section style={{ background: "var(--ai-bg)", color: "var(--ai-text)", ... }}>
  <strong>✨ Gemini auto-summary</strong>   {/* ← 寫死 */}
  <p style={{ marginTop: 8 }}>
    {inc.ai_diagnoses?.find((d) => d.role === "auto-classify")?.summary ?? "（尚未分類...）"}
  </p>
</section>
```

但實際 auto-classify provider cascade（`triggerAutoClassify.ts`）：
1. **Claude Haiku 4.5 優先**（有 `ANTHROPIC_API_KEY` → 用 Claude）
2. Gemini 2.0 Flash Lite 備援（Claude 失敗 → 用 Gemini）

若用的是 Claude，摘要就顯示在 "Gemini auto-summary" 標題下，資訊完全錯誤。

**修法**：讀 `ai_diagnoses.find(d => d.role === "auto-classify")?.provider` 動態顯示。

---

### 問題 10：Approvals 頁面在實際使用中幾乎永遠是空的 🟡

**位置**：`lib/command-plane/policyEngine.ts`

```typescript
const RISK_TABLE: Record<string, RiskLevel> = {
  "/normal_mode": "high",   // ← 解除 Kill Switch 的唯一指令
  // ...
};

const HARD_BLOCK_FROM: Record<CommandSource, Set<RiskLevel>> = {
  telegram: new Set(["high", "critical"]),   // ← Telegram hard block
};
```

`/normal_mode` 是 `high` risk，Telegram 永遠 block。所以從 Telegram 發 `/normal_mode` → `evaluatePolicy()` 回傳 `{ outcome: "block" }` → status=`blocked_by_policy`，**不進入 `queued` 佇列**。

Approvals 頁面只顯示 `status === "queued"` 的 command_requests。`/normal_mode` 永遠不進佇列 → **Approvals 頁永遠沒有 `/normal_mode` 可簽核**。

**解除 emergency_stop 的實際路徑**：
1. `/ops/system-modes` 頁面（owner/admin，需 trusted proxy auth）
2. SQL editor 直接 UPDATE system_modes

Approvals 頁面在現有設計下，只有當 Telegram 以外的 source（如 internal / schedule）發出 high-risk command 時才有意義，但這些路徑尚未實作（`/api/internal/commands/dispatch` 是 501）。

---

### 問題 11：Ops Console 是沒有整合好的孤兒頁面 🟡

**位置**：`app/ops-console/page.tsx`

頁面顯示 4 塊資料，每一塊都與其他頁面重複或功能未完成：

| 區塊 | 問題 |
|------|------|
| Tenants Snapshot | 與 `/ops/clients` 完全重複，從 `/api/ops/summary` 讀（同一個 `organizations` 表）|
| Workflow Runs | 與 Build Console 的 live status 重複，從 `/api/ops/workflow-runs` 讀（同一個 `ops_action_runs`）|
| Tenant Config | 只能改 3 個欄位（status/locale/timezone），無實際使用場景 |
| AI Image Jobs form | 建立 `queued` 狀態的 job，但沒有任何 Trigger.dev 任務實際處理 `ai_image_jobs` 表 → job 永遠停在 `queued` |

這是 v1 spec（`NEXTJS_INTERNAL_OPS_CONSOLE_V1.md`）的遺留骨架，當時設計的功能大部分已被其他頁面取代或尚未實作。

---

### 問題 12：Ops Inbox → Repair Center 雙向導覽缺一半 🟡

**方向一（Repair Center → Ops Inbox）**：✅ 有
```typescript
// app/ops/repairs/page.tsx
<Link href={`/ops/inbox/${run.incident_id}`} style={linkStyle}>事件</Link>
```

**方向二（Ops Inbox → Repair Center）**：❌ 缺
```tsx
// app/ops/inbox/[id]/page.tsx — 沒有啟動修復的按鈕
// 使用者流程：
// 1. 在 Ops Inbox 看到 critical incident
// 2. 點進詳情頁
// 3. 沒有任何「啟動修復」按鈕
// 4. 必須手動導覽到 /ops/repairs
// 5. 在 Repair Center 的「待處理佇列」找到這個 incident
// 6. 點「核准修復」
```

加上問題 5（佇列邏輯），如果 incident 已有 terminal repair_run，它根本不出現在 Repair Center 佇列中。使用者會發現 Inbox 有問題但 Repair Center 看不到，完全沒有引導。

---

## 15. 補充：初版遺漏的細節

### 15.1 ops/inbox/[id] 詳情頁完整版面

兩欄 layout（`gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)"`）：

**左欄 `<main>`：**
1. SeverityChip + source + service + environment + occurrence× 標題列
2. StatusActions（右上角）
3. AI 摘要框（⚠️ 寫死 "Gemini auto-summary"）
4. Choose your AI 按鈕群（所有按鈕 inline flex）：
   - `OpenInCursorButton`（primary）→ cursor deeplink
   - `OpenRemoteUIButton target="n8n"`（只有 service.type === "remote-ui-n8n" 時顯示）
   - `OpenRemoteUIButton target="supabase"`（只有 "remote-ui-supabase" 時顯示）
   - `AskChatGPTButton`
   - `AskClaudeButton`
   - `AskGeminiButton`
   - `CopyForTerminalButton tool="codex"`
   - `CopyForTerminalButton tool="copilot"`
   - `CopyForTerminalButton tool="gemini-cli"`
5. `AiDiagnosisTimeline`
6. `PasteAiResultBox`
7. `RawPayloadDetails`（`<details>` 可展開）

**右欄 `<aside>`：**
- `ServicePanel`：服務名稱 + SERVICE_REGISTRY raw JSON
- `OccurrencePanel`：`occurrence_count×`，first/last seen，fingerprint 前 8 字
- `NotificationLogPanel`：通知日誌（✓ sent / ○ skipped / ⊘ throttled / ✗ failed，顯示 channel + rule + reason）

---

### 15.2 recommendOrder.ts（AI 推薦順序）

```typescript
// lib/ops-inbox/ai/recommendOrder.ts
business signal → [claude, chatgpt, gemini]
resource/uptime → [claude, gemini, chatgpt]
其他（error/latency/deployment）→ [chatgpt, claude, gemini]
```

用於詳情頁顯示按鈕的順序建議。

---

### 15.3 IntegrationControls 完整邏輯

**IntegrationCreatePanel（新增表單）：**
- 欄位：Client（select org）/ Asset（select asset，filtered by org）/ Provider（select）/ Secret reference（`vault:ENV_NAME` 格式）/ External hint / Status（pending/active/failed/revoked）
- POST `/api/ops/integrations` → upsert `tenant_integration_bindings`（onConflict: org+provider）

**IntegrationRowActions（每列操作）：**
```typescript
PATCH /api/ops/integrations  body: { id, action: "validate"|"activate"|"revoke" }
```
- **Validate**：呼叫 `checkIntegrationHealth()`，寫 `api_metadata.last_health_check`
- **Active**（status !== active 時顯示）：status → active
- **Revoke**（status !== revoked 時顯示，紅色按鈕）：status → revoked

---

### 15.4 Slack Interactive 完整流程

```
POST /api/internal/commands/slack
  1. verifySlackSignature()
     → X-Slack-Request-Timestamp header（age < 5min）
     → HMAC-SHA256(v0:{timestamp}:{rawBody}) vs X-Slack-Signature
     → timing-safe comparison
  2. parse URLSearchParams body.payload
  3. switch actionId:
     "acknowledge_only" → { response_type: "ephemeral", text: "Acknowledged. No repair run was created." }
     "approve_repair" + value (incidentId) →
       startRepairFromIncident({ incidentId: value, actor: "slack:{username}", source: "slack" })
       → ok: true + github_issue_url → 回傳 issue URL
       → backup_failed → "Pre-repair backup failed. No GitHub issue or PR was created."
       → 其他失敗 → "Repair start failed: {error}"
```

---

### 15.5 PostHog Analytics（posthog-analytics.tsx）

`PostHogAnalytics` component（layout.tsx 內載入，`PHProvider` 之內）：
- Mount 後 `fetch("/api/ops/analytics-context")`（讀 role + source）
- `registerOpsSuperProperties(role, source)` → PostHog 每次 capture 都帶 `ops_role` / `ops_role_source` / `app`
- `groupProject()` → PostHog Group "project" = "lobster-next-admin"
- 只跑一次（`useRef(false)` guard）

---

### 15.6 Ops Console 完整頁面邏輯

Server Component，3 個並行 fetch：
1. `fetchSummary()` → `/api/ops/summary`（tenants + mediaRules + actions）
2. `fetchWorkflowRuns()` → `/api/ops/workflow-runs?limit=10`（ops_action_runs）
3. `fetchTenantConfig(defaultOrgId)` → `/api/ops/tenants/{id}/config`（第一個 tenant）

**5 個 section：**
1. **Architecture Boundary（3 卡片）**：AI Generated Images→R2 / WP Product/Blog→wp_uploads / Control Plane→Supabase
2. **Tenants Snapshot**：所有 tenant 的 status + lastRunStatus + riskLevel
3. **Media Boundary Rules**：ai_generated→r2 / wp_product→wp_uploads / wp_blog→wp_uploads
4. **Action Allowlist**：3 個 actions（staging_sync / ai_generate_image / production_deploy_request）
5. **Workflow Runs**：ops_action_runs 最近 10 筆（source summary：`build-console: N`）
6. **Tenant Config**：第一個 tenant 的 PATCH form（status / defaultLocale / defaultTimezone）
7. **M3 — 部門選型**：DepartmentSelector（20 clusters，複製 JSON 功能）
8. **Controlled Write — AI Image Job**：AiJobForm → `POST /api/ops/ai-image-jobs`（建立 queued job + audit event）

---

### 15.7 DB Migrations 補充細節

#### 0014 — 啟用 RLS
對所有已知 public tables 跑 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`，包括 organizations / workspaces / ops_incidents / ops_action_* / ai_image_jobs / ops_audit_events 等 40+ 個 table。最後掃一遍 `pg_tables` 補上漏網之魚。

#### 0016 — RLS Policies（ops console tables）
核心策略：`user_has_org_access(organization_id)` helper（0004 定義）。
- `ops_action_catalog`：authenticated → select（無 org filter，reference data）
- `ops_action_runs`：authenticated → CRUD via `user_has_org_access(org_id)`
- `ai_image_jobs`：authenticated → CRUD via `user_has_org_access(org_id)`
- `ops_audit_events`：authenticated → select via `user_has_org_access(org_id)`
- `permissions` / `role_permissions`：authenticated → select（global reference）

#### 0026 — ops_incidents.client_slug
```sql
ALTER TABLE ops_incidents ADD COLUMN client_slug text;
CREATE INDEX ops_incidents_client_slug_idx ON ops_incidents(client_slug) WHERE client_slug IS NOT NULL;
```
用途：`/ops/inbox?client_slug=<slug>` deep-link（ClientCard 的「查看警報」按鈕）。

#### 0028 — assets 表
```sql
assets (
  id uuid, organization_id FK, workspace_id FK,
  asset_type: 'website'|'web_app'|'api'|'wordpress'|'server'|'database'|'workflow'|'job_runner'|'repository'|'external_service'|'other',
  environment: 'development'|'staging'|'production'|'shared',
  primary_url, provider, status: 'active'|'inactive'|'maintenance'|'archived',
  UNIQUE(organization_id, slug)
)
```

#### 0029 — tenant_integration_bindings 種子資料
awarewave-ops 預填 10 個 integration（sentry/uptime_kuma/grafana/netdata/posthog/slack/n8n/trigger/supabase/cloudflare）。
soulful-expression 預填 supabase（`vault:SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY`）。

#### 0030 — repair_runs.archived_at + archive function
```sql
ALTER TABLE repair_runs ADD COLUMN archived_at timestamptz;
-- Partial indexes (WHERE archived_at IS NULL) for lean active-run queries
-- archive_stale_repair_runs(retention_days=90): archives terminal states > 90 days
-- pg_cron: '0 2 * * *' (daily 02:00 UTC)
```

#### 0031 — deploy source 加入 ops_incidents
移除舊 check constraint，重建以包含 `'deploy'`。

#### 0032 — archive triage_needed（m10 fix）
更新 `archive_stale_repair_runs()` 同時封存 `triage_needed` runs（>14 天未動）。
Terminal runs 仍維持 90 天 retention。

#### 0033 — repair_runs RLS deny anon（m11 fix）
```sql
CREATE POLICY deny_anon_all ON repair_runs FOR ALL TO anon USING (false);
```
防止 anon key 拿到 silent-empty（RLS enabled + no policy 的隱式 deny），改為明確 deny。

---

### 15.8 n8n Workflow Exports

#### client-onboarding-flow.json（`active: false`）
Phase 1 骨架，7 個 nodes：
1. Manual Trigger
2. Build Payload（hardcoded test UUIDs）
3. 後續 nodes（provision staging, apply-manifest, etc.）
用途：手動觸發 staging onboarding flow 的起點，尚未啟用。

#### slo-weekly-slack-probe.json（`active: false`）
4 個 nodes：
1. Manual Trigger
2. Weekly Mon 01:00 UTC（schedule trigger）
3. Set Slack webhook + optional note（需填入真實 slackWebhookUrl，不要 commit）
4. Probe endpoints + build summary（Code node）：
   - HTTP GET `uptime.aware-wave.com/dashboard`
   - HTTP GET `app.aware-wave.com/`
   - HTTP GET `api.aware-wave.com/health`
   - HTTP GET `n8n.aware-wave.com/healthz`
   - timeout 15s per endpoint，彙整 OK/FAIL 結果
5. Post Slack（HTTP Request POST slackWebhookUrl）

兩個 workflow 都需手動設定並啟用。

---

### 15.9 create-wp-site（Trigger.dev）完整邏輯

**SSRF Guard**：所有 integration URL 欄位在 Zod schema 解析時過濾：
- 必須 `https://`
- 拒絕 RFC-1918 + loopback + link-local（IPv4+IPv6）
- 拒絕 localhost/.local/.internal/.lan 等
- 拒絕 numeric/hex/octal IPv4 forms

**Input Schema**（Zod，pre-process normalizeBuildConsolePayload）：
```
organizationId, workspaceId, projectId, siteId (UUIDs)
siteName (string)
manifestSlug: 'wp-basic'|'wp-business'|'wc-core' (default: 'wp-basic')
domain?, provider?, locale?
integrations?: { uptimeKuma?, sentry?, postHog?, n8n?, mainWp? }（全 SSRF-safe URL）
pluginSlugs?, sshHost?, sshCredentialsRef?, wpPath?
```

**執行流程**：
1. `captureWorkflowEvent("workflow started")`
2. `resolveStagingProvisioning()` → 呼叫 `POST /api/internal/hosting/provision-staging`（httpJsonStagingAdapter）
3. `runAllIntegrations(integrations)` → 並行設定 Uptime Kuma / Sentry / PostHog / n8n / MainWP
4. 寫 workflow_runs / ops_action_runs 狀態到 Supabase

---

### 15.10 apply-manifest（Trigger.dev）完整邏輯

**Manifest Schema（Zod）**：
```
{
  name: string,
  version: string,
  schemaVersion: string,
  target: "staging-only",
  guardrails: {
    allowEnvironments: string[],
    requireBackup: boolean,
    blockIfProduction: boolean,
  },
  steps: ManifestStep[],  // { id, type: 'install_theme'|'install_plugin'|'conditional_plugin', slug?, condition? }
  postInstall?, verification?, rollback?
}
```

**路徑安全**：
- `LOBSTER_MANIFESTS_DIR` env 或 `process.cwd()/manifests`
- `path.resolve` 後確認路徑以 MANIFESTS_BASE 開頭（防 path traversal）
- 禁止 `..` 在 manifestPath

**執行**：
- environmentType !== "staging" → throw（production 硬擋）
- `!manifest.guardrails.blockIfProduction` → throw
- `getManifestExecutionMode()`：讀 `LOBSTER_EXECUTE_MANIFEST_STEPS` env
  - `true` + `LOBSTER_MANIFEST_EXECUTION_MODE=apply` → 真實執行
  - 否則 → dry_run（預設）
- `runInstallFromManifestStaging()` → 逐步執行 steps

---

### 15.11 Supabase EU Docker Stack（完整服務）

| Container | Image | Memory | 用途 |
|-----------|-------|--------|------|
| `supabase-studio` | supabase/studio:2026.03.16 | 512m / 0.3CPU | 管理 UI |
| `supabase-kong` | kong/kong:3.9.1 | 512m / 0.5CPU | API Gateway（port 127.0.0.1:{KONG_HTTP_PORT}）|
| `supabase-auth` | supabase/gotrue:v2.186.0 | 128m / 0.2CPU | Auth（GoTrue）|
| `supabase-rest` | postgrest/postgrest | 128m | REST API |
| `supabase-realtime` | supabase/realtime | 256m | WebSocket |
| `supabase-storage` | supabase/storage-api | 128m | Object storage |
| `supabase-meta` | supabase/postgres-meta | 64m | pg-meta |
| `supabase-db` | supabase/postgres:15.8 | 512m | PostgreSQL |
| `supabase-vector` | timberio/vector | 64m | Log aggregation |
| `supabase-analytics` | supabase/logflare | 256m | Analytics |

**Studio 位址**：`studio.aware-wave.com`（通過 Cloudflare → nginx → kong:8000 → studio:3000）

**Clickhouse（Trigger.dev 用）**：`CLICKHOUSE_IMAGE_TAG=25.7.5-debian-12-r0`（**禁升 latest / 24.x**，版本鎖定）

---

*最後更新：2026-06-04（補全初版遺漏的 10 個細節區塊）*  
*文件產生：全讀 codebase session，覆蓋率：~100%*
