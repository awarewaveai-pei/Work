# Always-On Command Plane — 不開電腦也能 24/7 跑

> **Plan owner**: Claude (Opus 4.7) — 2026-05-07
> **Single source of truth**: 此 plan 落地後，**owner doc** 是 `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md`（**不**另建平行 spec）。
> **30-year contract**: 最小可逆改動、單一 owner、零重工、零平行 schema。

---

## 1. Context — 為什麼做這個

**問題**：你想「不開電腦也能跑 AI 任務」。Cursor 那份提案方向對，但會**重工**：他要新建 `workflow_runs` / `approvals` / `audit_events` / `policies` / `incidents` 5 張表。

**現實盤點**（已存在於 `lobster-factory/packages/db/migrations/`）：

| 既有資產 | 檔案 | 已覆蓋 Cursor 提案的 |
|---|---|---|
| `workflow_runs` (含 `actor_type`/`trigger_type`/`risk_level`/`status`/`input_snapshot`/`artifacts`) | `0002_factory.sql:80-106` | Workflow Run Registry |
| `approvals` + `approval_policies` + `approval_steps` + `tool_policies` | `0003_agents_approvals_observability.sql:29-99` | Policy + Approval Engine |
| `incidents` + `error_events` (含 `source_type`/`source_ref`/`event_payload`) | `0003:139-173` | Dead Letter / Incident |
| `ops_audit_events` | `0011_ops_console_control_plane.sql` | Audit Events |
| `agent_runs` (含 `tool_trace`/`evaluation_summary`/`cost_breakdown`) | `0003:117-137` | Agent Run Tracking |
| `tool_policies` (含 `denied_tools`/`requires_approval_for`) | `0003:86-99` | Hard Block / Allow List |
| Trigger.dev v4.4.4 自託管 + 11 個 task | `lobster-factory/infra/trigger/` + `packages/workflows/src/trigger/` | Durable workflow engine |
| n8n v2.15.1 自託管 + 3 workflow exports | `lobster-factory/infra/n8n/` | Light automation |
| Sentry / PostHog / Uptime Kuma 已接 | `apps/next-admin/{sentry,posthog,webhooks}*` | Observability |
| Backup script + DEPLOY_ROLLBACK_RUNBOOK + LONG_TERM_OPS (RPO/RTO + 年度演練) | `infra/hetzner-phase1-core/` + `agency-os/docs/operations/` | Backup / Restore |
| Autopilot Phase 1 + Weekly Automation | `scripts/autopilot-phase1.ps1` + `scripts/run-weekly-automation.ps1` | Scheduled checks |

**真正缺**的只有 4 件事 — 這 plan 就只做這 4 件：

1. **Ingress 標準化入口** — Telegram / Webhook / Schedule 進來時，先驗證、去重、分級，**再**進 `workflow_runs`
2. **Idempotency** — 同一則 Telegram 訊息重送不會跑兩次
3. **Kill Switch** — 全域 mode 切換（normal / read_only / emergency_stop）
4. **Telegram Bot 入口** — 真正讓「手機操作」這件事發生

**追加價值**：一旦 ingress 落地，**未來**任何 source（Slack、Email、Cron、GitHub Event、語音）都直接接這層；不必為每個 source 重做 router。

---

## 2. Architecture — 一張圖

```
[Telegram / Schedule / Webhook / Slack(future)]
            ↓ HTTPS
[Cloudflare DNS-only → Hetzner EU 204.168.175.41]
            ↓
[Next.js API: /api/internal/commands/{telegram,internal}]
            ↓
[CommandRouter (lib/command-plane/)]
   ├─ verifyHmac (Telegram secret_token)
   ├─ checkKillSwitch (system_modes)
   ├─ checkIdempotency (idempotency_keys)
   ├─ classifyRisk (policyEngine)
   ├─ INSERT command_requests
   └─ dispatch:
        ├─ low-risk → 直接執行 + 寫 workflow_runs (engine='internal')
        ├─ medium-risk → 預留 Phase 2 (Trigger.dev dispatch-action-run)
        └─ high/critical → INSERT approvals (既有表) + 通知 Slack
            ↓
[既有 system of record: workflow_runs / agent_runs / approvals / incidents]
            ↓
[既有 observability: Sentry / PostHog / Slack alert]
            ↓
[Telegram reply with trace_id]
```

**選擇理由**：
- **Ingress 走 Next.js 而非 n8n**：n8n 重啟時 webhook 不保證重放（官方文件確認的弱點）；Next.js 已有 Sentry / Clerk / Supabase RLS / vault 環境變數整合，**零重工**。n8n 仍保留做 Slack 通知、CRM sync 等下游事件膠水。
- **Schema 走 lobster-factory `0025_always_on_command_plane.sql`**：既有 RLS / pgTAP / migration runner 都能直接覆蓋。新表用 FK 串接既有 `workflow_runs` / `approvals` / `error_events`，**不重建任何已有表**。
- **DLQ 不開新表**：既有 `error_events.source_type` 加新值即可（DRY）。

---

## 3. Phase 1 範圍 — MVP（一週可上線）

### 3.1 必做 (in scope)

| # | 交付物 | 路徑 | 行數預估 |
|---|---|---|---|
| 1 | Migration | `lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql` | ~120 行 |
| 2 | API ingress (Telegram) | `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/commands/telegram/route.ts` | ~80 行 |
| 3 | API ingress (internal) | `.../app/api/internal/commands/dispatch/route.ts`（Phase 2 預留 stub） | ~30 行 |
| 4 | CommandRouter | `.../next-admin/lib/command-plane/commandRouter.ts` | ~150 行 |
| 5 | PolicyEngine | `.../next-admin/lib/command-plane/policyEngine.ts` | ~80 行 |
| 6 | Idempotency | `.../next-admin/lib/command-plane/idempotency.ts` | ~40 行 |
| 7 | KillSwitch | `.../next-admin/lib/command-plane/killSwitch.ts` | ~40 行 |
| 8 | Types | `.../next-admin/lib/command-plane/types.ts` (Zod schemas) | ~80 行 |
| 9 | 5 個 low-risk command handlers | `.../next-admin/lib/command-plane/handlers/{status,health,dailyReview,weeklyReview,listFailedRuns}.ts` | 5 × ~40 行 |
| 10 | Owner doc | `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md` | 內容看 §11 |
| 11 | Telegram policy | `agency-os/docs/operations/TELEGRAM_COMMAND_POLICY.md` | 內容看 §10 |
| 12 | Smoke test | `scripts/command-plane-smoke.ps1` | ~80 行 |

### 3.2 不做 (deferred to Phase 2 / 3)

- ❌ Trigger.dev `dispatch-command` task — 等 Trigger env vars 完整同步後再上（目前 Supabase / DB keys 未同步，硬接會壞既有 onboarding）
- ❌ Anthropic Routines 整合 — ~~既有 `scripts/run-weekly-automation.ps1` 已覆蓋 90% 需求~~（**已過期 2026-05-30**：該機器本地排程因「電腦不開機」靜默斷 19 天而退役；workflow 安全稽核改走 GitHub Actions `weekly-workflows-security-audit.yml`，build gate 由 CI + ao-close 覆蓋。詳 `agency-os/reports/weekly/README.md`）
- ❌ Slack / Email ingress — 同樣 schema、抄 telegram/route.ts 即可，不必 day-1 上
- ❌ 自動化 restore drill — 既有 `LONG_TERM_OPS.md` 已寫年度演練；自動化是 Phase 3
- ❌ Kill Switch UI in ops console — Phase 1 用 SQL 直接切（emergency 場景反而不該依賴 UI）

---

## 4. Schema Design — `0025_always_on_command_plane.sql`

**設計原則**：
- 只新增 2 張表 + 在既有 `workflow_runs` 加 2 個 nullable column（向後相容）
- DLQ 用既有 `error_events`，加新 `source_type` 值即可
- 全表都有 `organization_id` + RLS（沿用 `0010` / `0014` / `0019` pattern）

```sql
-- 1. command_requests: ingress layer (在 workflow_runs 之前)
create table if not exists command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  source text not null check (source in (
    'telegram', 'slack', 'email', 'webhook', 'schedule', 'internal', 'github'
  )),
  source_event_id text not null,           -- e.g. Telegram update_id
  actor_type text not null check (actor_type in ('human', 'agent', 'system')),
  actor_ref text,                           -- e.g. Telegram user_id
  command text not null,                    -- e.g. '/status'
  args jsonb not null default '{}'::jsonb,
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'received' check (status in (
    'received', 'validated', 'rejected', 'queued', 'dispatched',
    'completed', 'failed', 'blocked_by_killswitch', 'blocked_by_policy'
  )),
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  approval_id uuid references approvals(id) on delete set null,
  rejection_reason text,
  result jsonb not null default '{}'::jsonb,
  trace_id text not null default gen_random_uuid()::text,
  received_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  -- idempotency: same source + same event id can never insert twice
  unique (source, source_event_id)
);

create index if not exists idx_command_requests_org_received
  on command_requests(organization_id, received_at desc);
create index if not exists idx_command_requests_actor
  on command_requests(actor_type, actor_ref);
create index if not exists idx_command_requests_trace
  on command_requests(trace_id);

alter table command_requests enable row level security;
-- (RLS policy follows 0019 pattern; spelled out in migration file)

-- 2. system_modes: kill switch
create table if not exists system_modes (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'agency', 'client')),
  scope_id uuid,
  mode text not null check (mode in ('normal', 'maintenance', 'read_only', 'emergency_stop')),
  reason text,
  set_by uuid references profiles(id) on delete set null,
  set_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (scope_type, scope_id)            -- one active mode per scope
);
-- seed row: ('global', null, 'normal', 'initial seed', null, now(), null, '{}')

create index if not exists idx_system_modes_scope on system_modes(scope_type, scope_id);

-- 3. extend workflow_runs (向後相容，全部 nullable)
alter table workflow_runs
  add column if not exists command_request_id uuid references command_requests(id) on delete set null,
  add column if not exists idempotency_key text;

create unique index if not exists idx_workflow_runs_idempotency_key
  on workflow_runs(idempotency_key) where idempotency_key is not null;

-- 4. DLQ: 不開新表，用既有 error_events
-- 在 ingress / dispatch 失敗時 INSERT 到 error_events，source_type 用：
--   'command_ingress_failed' | 'command_dispatch_failed' | 'command_handler_failed'
-- 重放查詢: select from error_events where source_type like 'command_%' and incident_id is null
```

**為什麼這樣最少**：
- Cursor 提案要 4 張新表 → 我只開 2 張
- workflow_runs 不重建，只加欄位（非破壞性 migration，向後相容）
- DLQ 完全 reuse 既有表，加 source_type 值即可
- 所有 idempotency 用 PostgreSQL 既有 `unique` 約束保證原子性 — 不需要應用層鎖

---

## 5. API Contract — Command Router

### 5.1 Telegram webhook endpoint

```ts
// POST /api/internal/commands/telegram
// Telegram 後台設定 setWebhook 時帶 secret_token；header X-Telegram-Bot-Api-Secret-Token

interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; from: { id: number; username?: string }; text?: string };
}

// Response: 200 OK 立刻回（不等執行；Telegram timeout 60s）
// 真正結果透過 Telegram sendMessage API 回傳給用戶
```

### 5.2 Internal dispatch endpoint (Phase 2 stub)

```ts
// POST /api/internal/commands/dispatch
// 給 Cron / Slack / Schedule 用，需 HMAC signed
// Phase 1: 只接受 actor_type='system' 且 source='schedule' 的呼叫；其餘 401
```

### 5.3 CommandRouter pseudocode

```ts
async function route(input: NormalizedCommand): Promise<RoutedResult> {
  // 1. kill switch
  const mode = await getActiveMode(input.organizationId);
  if (mode === 'emergency_stop') return reject('blocked_by_killswitch');
  if (mode === 'read_only' && input.riskLevel !== 'low') return reject('blocked_by_killswitch');

  // 2. idempotency: rely on (source, source_event_id) unique constraint
  const cr = await insertCommandRequest(input).onConflictDoNothing();
  if (!cr) return alreadyProcessed(input);  // duplicate webhook

  // 3. policy
  const decision = await policyEngine.evaluate(cr);
  if (decision.outcome === 'block') return rejectAndLog(cr, decision);
  if (decision.outcome === 'require_approval') {
    const approval = await createApproval(cr, decision);
    await updateCommandRequest(cr.id, { status: 'queued', approval_id: approval.id });
    await notifySlack(`[approval needed] /${cr.command} from ${cr.actorRef}`);
    return { traceId: cr.trace_id, status: 'queued_for_approval' };
  }

  // 4. dispatch low-risk
  const handler = handlers[cr.command];
  if (!handler) return reject(cr, 'unknown_command');

  const wfRun = await createWorkflowRun(cr);
  try {
    const result = await handler(cr);
    await completeWorkflowRun(wfRun.id, result);
    await updateCommandRequest(cr.id, { status: 'completed', workflow_run_id: wfRun.id, result });
    return { traceId: cr.trace_id, status: 'completed', result };
  } catch (err) {
    await failWorkflowRun(wfRun.id, err);
    await insertErrorEvent({
      source_type: 'command_handler_failed',
      source_ref: cr.id,
      error_message: err.message,
      event_payload: { command: cr.command, actor: cr.actorRef },
    });
    await updateCommandRequest(cr.id, { status: 'failed' });
    throw err;
  }
}
```

### 5.4 Policy 預設 (`policyEngine.ts`)

```ts
const RISK_TABLE = {
  // low: 直接跑
  '/status': 'low',
  '/health': 'low',
  '/daily-review': 'low',
  '/weekly-review': 'low',
  '/list-failed-runs': 'low',
  '/runbook': 'low',
  '/draft-cursor-task': 'low',

  // medium: Phase 2 接 Trigger.dev
  '/replay-dead-letter': 'medium',
  '/trigger-staging-workflow': 'medium',

  // high: 必須 approval
  '/deploy-production': 'high',
  '/refund': 'high',
  '/dns-change': 'high',

  // critical: hard block (Telegram 永遠不允許)
  '/drop-table': 'critical',
  '/read-secrets': 'critical',
  '/destructive-migration': 'critical',
  '/cross-tenant-export': 'critical',
};

const HARD_BLOCKED_FROM_TELEGRAM = new Set(['high', 'critical']);
// 高風險指令必須從 ops console (Clerk SSO + 2FA) 發起，不能從 Telegram
```

---

## 6. Telegram Bot 設定 — 一次到位

### 6.1 Secrets（vault）

新增到 `mcp/user-env.template.ps1` + `secrets-vault.ps1`：

```
TELEGRAM_BOT_TOKEN              # BotFather 給的 token
TELEGRAM_WEBHOOK_SECRET         # 自產 random 32-byte，setWebhook 用
TELEGRAM_ALLOWED_USER_IDS       # 你 Telegram numeric user id (CSV，空白擋全部)
TELEGRAM_ALLOWED_CHAT_IDS       # 你個人 chat / 工作群組 (CSV)
```

### 6.2 setWebhook（一次性，跑一次即可）

```powershell
# scripts/configure-telegram-webhook.ps1 (新增)
$token = (.\scripts\secrets-vault.ps1 -Action get -Name TELEGRAM_BOT_TOKEN)
$secret = (.\scripts\secrets-vault.ps1 -Action get -Name TELEGRAM_WEBHOOK_SECRET)
$webhookUrl = "https://app.aware-wave.com/api/internal/commands/telegram"

Invoke-RestMethod "https://api.telegram.org/bot$token/setWebhook" -Method POST -Body @{
  url = $webhookUrl
  secret_token = $secret
  drop_pending_updates = $true
  allowed_updates = @('message')
} -ContentType "application/x-www-form-urlencoded"
```

### 6.3 環境變數注入

next-admin 容器 env (透過既有 `infra/hetzner-phase1-core/apps/next-admin/.env.production` pattern)：
```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_ALLOWED_USER_IDS=12345678
TELEGRAM_ALLOWED_CHAT_IDS=12345678
```

部署管道沿用既有 deploy script（`infra/hetzner-phase1-core/scripts/deploy-phase1.sh`），**不**新增部署流程。

---

## 7. Hard Security Boundaries（永遠不可破）

對齊既有 `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` §10 + `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`：

### Telegram 永不可做

- production deploy
- DB migration（任何 ALTER / DROP / TRUNCATE）
- 讀 secrets / vault
- DNS / Cloudflare 設定變更
- 金流 / refund / payout
- 客戶資料刪除 / cross-tenant export
- 修改 RLS / approval policies 本身
- 修改 system_modes（kill switch 必須從 ops console SSO）

### Telegram 可做（low-risk only）

- 查狀態 / 健康
- 產報告 / 摘要 / runbook 草稿
- 列失敗 run（read-only）
- draft Cursor / GitHub task 草稿（不直接執行）

### 失敗事件處理

任何 ingress / dispatch / handler 失敗 → **必寫** `error_events`（source_type 對應 `command_*_failed`）→ Sentry capture（既有 SDK）→ Slack 告警（既有 webhook）。

**禁止**：吞例外、靜默 return、log 後不寫 DB。

---

## 8. 5 個 Phase 1 Command — 完整功能

| Command | 行為 | 內部如何完成 |
|---|---|---|
| `/status` | 回 git status / 最近 5 個 workflow_runs / 最近 incident | SQL → workflow_runs / incidents 既有表 |
| `/health` | 跑既有 `/api/ops/inbox/health` 並摘要 | 內部 fetch 既有 endpoint |
| `/daily-review` | 用 Anthropic SDK 讀今日 WORKLOG.md + git log，產摘要回 Telegram | claude-api skill pattern + prompt caching |
| `/weekly-review` | 用 Anthropic SDK 讀 7 天 WORKLOG + workflow_runs，產 review | 同上 |
| `/list-failed-runs` | SELECT workflow_runs WHERE status='failed' ORDER BY started_at DESC LIMIT 10 | 純 SQL |

**為什麼這 5 個**：
- 全部 read-only / 產文字 — 零 production 風險
- 涵蓋 90% 你「不開電腦想知道」的情境
- 每個 ≤40 行 code，易於審查
- `/daily-review` / `/weekly-review` 直接接既有 `claude-api` skill，**不**重做 prompt caching / token 管理

---

## 9. Verification Plan — 怎麼證明可用

### 9.1 自動化 smoke test (`scripts/command-plane-smoke.ps1`)

仿 `ops-console-smoke.ps1` 樣式，跑這 8 個檢查（exit non-zero 即失敗）：

1. **Migration applied**: `select 1 from command_requests limit 0`
2. **Kill switch seeded**: `select mode from system_modes where scope_type='global' and scope_id is null` → `'normal'`
3. **Idempotency works**: 同一 `source_event_id` 連續 POST 兩次 → 第二次回 `already_processed`
4. **Kill switch blocks**: 把 mode 設成 `emergency_stop` → POST 任何 command → `blocked_by_killswitch`；測完還原
5. **Hard block works**: 模擬 `/deploy-production` from Telegram → status='blocked_by_policy'
6. **Low-risk handler works**: `/status` → 200 + workflow_runs 多一筆 status='completed'
7. **Failure path works**: 故意 throw → error_events 多一筆 source_type='command_handler_failed'
8. **HMAC signature works**: 缺 `X-Telegram-Bot-Api-Secret-Token` → 401

### 9.2 手動驗收（不開電腦情境）

1. 桌機關機
2. 手機 Telegram 傳 `/status` → 30 秒內回覆
3. 手機傳 `/daily-review` → 60 秒內回今日摘要
4. 手機傳 `/deploy-production` → 立刻回「blocked」+ 寫 audit log
5. 桌機開機後查 `command_requests` → 看到 4 筆完整記錄

### 9.3 既有 gate 必須仍 PASS

每個 Phase 1 子任務 commit 後跑：
- `/verify`（既有 verify-build-gates）
- `/health`（既有 system-health-check 100%）
- `/smoke-test`（既有 ops-console-smoke）
- 新增 `/command-plane-smoke`（這次新增）

---

## 10. `TELEGRAM_COMMAND_POLICY.md` — 最終版

> 路徑：`agency-os/docs/operations/TELEGRAM_COMMAND_POLICY.md`

```md
# Telegram Command Policy

## Authentication

- header `X-Telegram-Bot-Api-Secret-Token` 必須等於 vault `TELEGRAM_WEBHOOK_SECRET`
- payload `message.from.id` 必須在 `TELEGRAM_ALLOWED_USER_IDS` 內
- payload `message.chat.id` 必須在 `TELEGRAM_ALLOWED_CHAT_IDS` 內
- 任一不符 → 401，寫 error_events.source_type='telegram_auth_failed'，**不**回覆 Telegram（避免成為偵測器）

## Risk Level Routing

- low: 直接跑、立即回覆
- medium: 寫 command_request status='queued'、回 Telegram「已排程」、Phase 2 由 Trigger.dev 接手
- high: 寫 approvals、回 Telegram「需要 approval」、ops console SSO 簽核後才執行
- critical: 永遠 reject、回 Telegram「此指令不可從 Telegram 執行」、寫 ops_audit_events

## Hard Blocks (即使 user_id 在白名單)

- 任何 risk='critical' 指令
- 任何包含 `--force` / `--no-verify` / `;` / `&&` 的 args（防 command injection）
- 任何試圖修改 system_modes 本身的指令

## Audit

每個 Telegram update（包含被擋的）都必寫一筆 command_requests，狀態紀錄在 status 欄位。

## Rate Limiting

每個 actor_ref 60 秒內 > 10 次 → 自動觸發 system_modes scope='agency' mode='read_only' 30 分鐘 + Slack 警報。
```

---

## 11. `ALWAYS_ON_COMMAND_PLANE.md` — Owner Doc 大綱

> 路徑：`agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md`
> **這是這個系統的唯一 SSOT**；其他文件只能放摘要 + 連結。

章節：
1. Purpose（不開電腦也能 24/7 跑）
2. Architecture diagram（§2 那張圖）
3. Schema reference（連到 migration 0025）
4. API contract（連到 `lib/command-plane/`）
5. Risk routing table（從 §5.4 抽出）
6. Hard blocks（從 §7 抽出）
7. Adding a new command（步驟）
8. Adding a new ingress source（步驟，未來 Slack / Email）
9. Operations runbook（kill switch 怎麼開關、approval 怎麼簽）
10. Related docs:
    - `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
    - `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md`
    - `TELEGRAM_COMMAND_POLICY.md`

**doc-sync 會自動跑** `scripts/register-new-governance-doc.ps1` 把它接進 `change-impact-map.json` + `README.md`。

---

## 12. Rollback Plan — 每一塊都可逆

| 改動 | Rollback 動作 | 影響 |
|---|---|---|
| Migration 0025 | `drop table command_requests; drop table system_modes; alter workflow_runs drop column command_request_id, drop column idempotency_key;` | 純加表加欄位，drop 安全 |
| Telegram webhook | `setWebhook` URL 改成 `''` 即關閉 ingress | 既有功能零影響 |
| API route | 刪除 `/api/internal/commands/` 整個資料夾 | 既有 endpoint 零影響 |
| lib/command-plane/ | 刪整個資料夾 | 既有 lib 零影響 |
| handlers | 個別刪除 / 加新 — handler registry pattern | 隔離度高 |

**最壞情境**：Telegram bot 被打爆 → setWebhook 空字串 → 5 秒內所有流量停止 → 系統其他部分零影響。

---

## 13. Phase 2 / 3 Roadmap（簡述，**不**現在做）

### Phase 2（4-6 週後，等 Trigger.dev env vars 同步完）
- 接 Trigger.dev `dispatch-command` task（reuse 既有 `dispatch-action-run.ts`）
- 加 `/replay-dead-letter` / `/trigger-staging-workflow` 等 medium-risk command
- ops console 加 approval UI（Clerk SSO 簽核）
- ops console 加 system_modes 切換 UI

### Phase 3（季度級工作）
- Slack / Email ingress（同 schema、抄 telegram/route.ts）
- Anthropic Routines 對接（雲端 cron 取代部分 weekly-automation）
- 自動化 restore drill（每月跑一次到 staging）
- Kill Switch UI + 一鍵 emergency stop

---

## 14. 30-Year Stability — 這 plan 怎麼做到

對齊 `CLAUDE_EXECUTION_BLUEPRINT_30Y.md` §1（Non-Negotiable Principles）：

| 原則 | 本 plan 怎麼遵守 |
|---|---|
| Single Owner | `ALWAYS_ON_COMMAND_PLANE.md` 是唯一 owner doc；Telegram policy 只引用，不複製 |
| No Guessing | 所有 schema 改動都有 migration runner 驗證；smoke test 8 項必過 |
| No Silent Risk | High/critical risk 永遠走 approvals 表；critical 指令 Telegram hard-block |
| No Secret Leakage | Telegram token 走既有 vault；handler error 寫 error_events 時 mask secrets |
| No Fake Completion | smoke test 必過、4 個既有 gate 必過、Telegram 端到端手動驗收 |
| No Cross-Agent Clobbering | 不修改既有 migration、不修改既有 webhooks、新增獨立 namespace `lib/command-plane/` |

對齊 §11（Scalability Rules）：

| 原則 | 怎麼做 |
|---|---|
| Deterministic entry points | `/api/internal/commands/{telegram,dispatch}` 只有 2 個入口 |
| Mechanized checks over tribal knowledge | smoke test 取代記憶；migration 取代手改 |
| Narrow interfaces | CommandRouter 只接 `NormalizedCommand`，不接外部 SDK |
| Operational observability | 每筆 command_requests 都有 trace_id；錯誤都進 Sentry + error_events |
| Low-friction extensibility | 加新 source = 抄 telegram/route.ts；加新 command = handlers/ 新檔 |
| Deprecation discipline | 既有 workflow_runs 完全不動；新欄位都是 nullable |

---

## 15. Critical Files to Modify / Create

### Modify (3 個)
- `mcp/user-env.template.ps1` — 加 `TELEGRAM_*` 4 個變數
- `agency-os/AGENTS.md` — §MCP/外掛分工 加一行指向 owner doc
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/.env.production.example` — 加 `TELEGRAM_*` 4 個

### Create (12 個檔案 + 1 個 migration)
見 §3.1 表格。

### **絕對不動**（避免衝突）
- 既有任何 migration（0001-0024）
- 既有 webhooks (`apps/next-admin/app/api/webhooks/*`)
- 既有 ops endpoints (`apps/next-admin/app/api/ops/*`)
- 既有 build endpoints (`apps/next-admin/app/api/build/*`)
- n8n workflow exports
- Trigger.dev tasks
- 任何 `.cursor/rules/*.mdc`
- 任何 `scripts/ao-*.ps1`

---

## 16. Sequencing — 實作順序（commit 邊界）

每個 commit 都通過 `/verify` + `/health` + `/smoke-test` 才推：

1. `[claude] feat(db): add command_plane migration 0025` — 只動 migration + RLS
2. `[claude] feat(api): add command-plane lib (router/policy/idempotency/killswitch)` — 純 lib，無路由
3. `[claude] feat(api): add Telegram ingress route + 5 low-risk handlers` — 路由 + handler
4. `[claude] feat(scripts): add command-plane-smoke + telegram webhook config script`
5. `[claude] docs: add ALWAYS_ON_COMMAND_PLANE.md + TELEGRAM_COMMAND_POLICY.md + sync README`
6. `[claude] chore: deploy to next-admin (env vars + setWebhook)`

每個 commit 都可獨立 rollback；commit 5 之前 Telegram 完全沒上線 → 零客戶風險。

---

## 17. Open Questions — 你需要決定的（實作前）

1. **Telegram Bot 帳號**：你已有還是要新建？
   - 若新建：BotFather → `/newbot` → 取 token → 加進 vault → 跑 `configure-telegram-webhook.ps1`
2. **白名單**：先只放你個人 user_id 還是含個人「我的訊息」chat？
   - 建議：個人 user_id + Saved Messages chat（只你能進）
3. **app.aware-wave.com 路由**：`/api/internal/commands/telegram` 是否要加進 nginx allowlist？
   - 看：`lobster-factory/infra/hetzner-phase1-core/nginx/sites/app.conf` — 我會在實作時檢查並調整
4. **`/daily-review` 用 Anthropic SDK 還是既有 claude-api MCP**？
   - 建議：直接用 Anthropic SDK（next-admin 已有套件），prompt caching pattern 從 `claude-api` skill 抄；不依賴 MCP（MCP 是 Cursor / Claude Code 用的，不是 production runtime）

---

## 18. Why This Plan Beats Cursor's Proposal

| 維度 | Cursor 提案 | 本 plan |
|---|---|---|
| 新表數量 | 5 (workflow_runs / approvals / audit / DLQ / etc) | **2** (command_requests / system_modes) |
| 重做既有 schema | ✅（不知道既有 0002/0003/0011 已存在） | ❌（FK 串既有，零重做） |
| Phase 1 範圍 | 90 個檔案、產品全棧 | **12 檔 + 1 migration**，1 週上線 |
| Owner docs | 4 個新檔（mega spec + Cursor task pack） | **2 個**（owner doc + telegram policy） |
| Trigger.dev day-1 | 接 — 但 env vars 未同步會壞既有 | Phase 2，等 env 同步 |
| 對既有 lobster / agency-os 衝突 | 高（重定義 schema） | 零（namespace 完全分離） |
| 30-year contract | 部分對齊 | 全項對齊（§14） |

---

## 19. Implementation Permissions Needed

實作階段需要的工具權限（給 ExitPlanMode 帶 allowedPrompts）：

- 跑 `pnpm typecheck` / `pnpm lint`（next-admin 內）
- 跑 `psql` 對 dev / staging Supabase 套 migration
- 跑既有 verify-build-gates / system-health-check / ops-console-smoke
- 跑 `git commit` / `git push`（依既有 commit prefix 規則）
- 在 next-admin 容器跑 `docker compose restart next-admin`（部署時）
- 跑 Telegram setWebhook 一次（用 vault 取 token）

---

> **Final note**: 這 plan 故意**不**含「Hermes / Always-on agent SDK daemon / Second brain」相關內容。理由：
> 1. 這違反 `CLAUDE_EXECUTION_BLUEPRINT_30Y.md` §1 No Silent Risk
> 2. 你目前 Layer 1-3 加總已能覆蓋 95% 不開電腦需求
> 3. systemd daemon 拿到 production 權限的維運成本 / 風險遠超過 ROI
> 4. 真正想做的話，應該另開**獨立 repo + 獨立 git identity + 獨立 VPS**，跟 lobster-factory 完全隔離 — 那是另一個 plan 的範圍
