# app.aware-wave.com 完整技術參考手冊

> **SSOT**：本文件由 2026-06-04 全讀 codebase 產生，涵蓋 app.aware-wave.com（Lobster Factory Admin Console）的每個頁面、API、lib 模組、資料庫、基礎設施。  
> **用途**：任何 AI session 讀此文件後，無需重讀 code 即可直接操作系統。  
> **維護**：每次重大改動後更新此文件。Last updated: 2026-06-04

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

### middleware.ts 攔截範圍
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
  source text,          -- 'sentry'|'uptime_kuma'|'grafana'|'netdata'|'posthog'|'manual'|'deploy'
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

流程（SSH 進 WordPress 容器）：
1. mkdir staging/`{slug}`（chown www-data）
2. CREATE DATABASE wp_s_{siteId}
3. wp core download
4. wp config create（DB: lobster-wordpress-db）
5. wp core install（staging URL: `aware-wave.com/staging/{slug}/`）
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
CLOUDFLARE_API_TOKEN / CLOUDFLARE_AUTH_BEARER_TOKEN
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
SG_SSH_PRIVATE_KEY_B64                  # provision-staging SSH key
SG_SSH_HOST                             # 預設 5.223.93.113
WP_STAGING_DB_USER / WP_STAGING_DB_PASS / WP_STAGING_DB_ROOT_PASS
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

## 14. 已知問題清單（12 項）

| # | 問題 | 位置 | 嚴重性 | 說明 |
|---|------|------|--------|------|
| 1 | **Auth production 預設 403** | `middleware.ts` | 🔴 致命 | nginx 沒注入 `x-ops-proxy-auth` header，整個 admin UI 對瀏覽器 403 |
| 2 | **WpUpdateButtons 無樣式** | `app/ops/clients/[slug]/WpUpdateButtons.tsx` | 🔴 功能壞掉 | 使用 Tailwind class（`bg-red-600` 等），但 app 無 Tailwind，全部按鈕無樣式 |
| 3 | **三個名字指向同一頁** | `layout.tsx` + `page.tsx` | 🟠 混亂 | "Repair Center badge" / "Incident Engine" / "Ops Inbox" 都是 `/ops/inbox` |
| 4 | **兩個 Onboarding 入口** | `/onboard` vs `/ops/onboarding` | 🟠 混亂 | 功能相同，使用者不知用哪個 |
| 5 | **Repair Center 佇列邏輯** | `app/ops/repairs/page.tsx:83` | 🟠 邏輯錯誤 | 有任何 repair_run（含 resolved）→ incident 從佇列消失，無法重啟 |
| 6 | **GitHub PR 棄案不處理** | `app/api/webhooks/github/route.ts` | 🟡 漏洞 | PR closed but not merged → repair_run 永遠卡在 pr_ready |
| 7 | **repairs/health 每次 SSH** | `app/api/ops/repairs/health/route.ts` | 🟠 效能 | 每次 GET 真實 SSH 進 SG+EU，極重，Repair Center 頁面每次 load 都觸發 |
| 8 | **Approvals 頁幾乎空** | `policyEngine.ts` + `app/ops/approvals` | 🟡 設計問題 | `/normal_mode` 被 policy 硬擋不進佇列，解 Kill Switch 路徑跟 Approvals 無關 |
| 9 | **AI label 寫死 "Gemini"** | `app/ops/inbox/[id]/page.tsx:51` | 🟡 資訊錯誤 | 主 provider 是 Claude Haiku，label 永遠顯示 "Gemini auto-summary" |
| 10 | **沒有即時更新** | 所有操作頁面 | 🟡 體驗差 | 全 force-dynamic RSC，操作後需手動重整；只有 Build Console poll + OpsInboxBadge 30s |
| 11 | **Ops Console 孤兒頁面** | `app/ops-console/` | 🟡 設計問題 | 重複 Clients+Build Console 資料，AI image jobs 無後端處理，功能未完成 |
| 12 | **Inbox→Repair 單向導覽** | `app/ops/inbox/[id]/page.tsx` | 🟡 UX | Inbox 詳情無「啟動修復」按鈕，需離開頁面去 Repair Center 操作 |

---

*文件產生：2026-06-04 by 全讀 codebase session*  
*覆蓋範圍：所有頁面、API routes、lib 模組、DB schema、基礎設施*  
*下次更新時機：任何重大功能改動後*
