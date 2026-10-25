# Always-On Command Plane

> **Owner**：本檔。所有其他文件都必須引用本檔，不得重複定義。
> **Status**：Phase 1 — Telegram ingress + 5 個低風險指令。
> **Goal**：在操作者電腦不開機的情況下，24/7 接收指令並執行安全自動化。

## 1. 目的

提供一個受治理的單一入口點，用於外部觸發來源（Telegram、Slack、Email、Webhook、Schedule），讓它們可以：

- 在單一邊界完成驗證與速率限制，
- 在任何副作用發生前，先記錄為 `command_requests` row，
- 根據 kill switch 與 policy engine 評估，
- dispatch 到一小組低風險 handler（Phase 1），或 queue 等待簽核（Phase 2），
- 在失敗時以可預期方式 replay（DLQ → `error_events`）。

Phase 1 僅支援 Telegram。新的 ingress source 會重用同一個 router（§7）。

## 2. 架構

```
[Telegram / Schedule / Webhook / Slack(future)]
            ↓ HTTPS
[Cloudflare DNS-only → Hetzner EU 204.168.175.41]
            ↓
[Next.js API: /api/internal/commands/{telegram,dispatch}]
            ↓
[CommandRouter (lib/command-plane/)]
   ├─ verifyTelegramSecret          (header secret_token, timing-safe)
   ├─ verifyTelegramActor           (TELEGRAM_ALLOWED_USER_IDS / CHAT_IDS)
   ├─ evaluatePolicy                (RISK_TABLE + hard blocks per source)
   ├─ claimCommandRequest           (idempotency via unique constraint)
   ├─ getActiveMode + evaluateKillSwitch  (system_modes)
   └─ dispatch:
        ├─ low-risk → inline handler → result → command_requests.completed
        ├─ medium-risk → status='queued' (Phase 2: Trigger.dev)
        └─ high/critical → INSERT approvals (existing 0003 schema) + Slack ping
            ↓
[System of record: command_requests, plus existing
 workflow_runs / agent_runs / approvals / incidents / error_events]
            ↓
[Existing observability: Sentry / PostHog / Slack alert]
            ↓
[Telegram reply with trace_id]
```

## 3. Schema 參考

Migration：`lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql`

| Table | 目的 | 備註 |
|---|---|---|
| `command_requests` | Ingress layer；每個外部事件一 row | unique `(source, source_event_id)` 強制 idempotency |
| `system_modes` | Global + per-scope kill switch——該 org 的 client 列與 global 列取最嚴格者（emergency_stop > maintenance > read_only > normal）；表讀不到或出現程式不認得的 mode → 所有指令擋下，原因 `system_modes unreadable (fail closed)`（只有 `lib/command-plane/killSwitch.ts` 的 `FAIL_OPEN_FOR` 列出的風險等級會放行，目前為空）。改動正式環境的伺服器路徑（清單見 `lib/system-modes/production-change-gate.ts` 檔頭）只在 mode=normal 執行；讀不到模式 → 擋，同一套 fail-closed 規則 | migration 會建立 seed row：scope=`global`、mode=`normal` |
| `workflow_runs.command_request_id` | Phase 2 dispatched runs 的 backref | nullable；legacy runs 不受影響 |
| `workflow_runs.idempotency_key` | Phase 2 dispatch 的可選 dedupe key | nullable；unique-where-not-null |
| `error_events.source_type` | 透過既有 table 做 DLQ | values：`command_ingress_failed`、`command_dispatch_failed`、`command_handler_failed`、`telegram_auth_failed` |

不為 DLQ 或 audit 新增 table——重用既有的 `error_events`（0003）與 `ops_audit_events`（0011）。

## 4. API contract

所有 routes 都位於 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/commands/` 底下。

- `POST /api/internal/commands/telegram` — Telegram webhook ingress
  - header `X-Telegram-Bot-Api-Secret-Token` 必須符合 `TELEGRAM_WEBHOOK_SECRET`
  - body：標準 Telegram `Update` JSON
  - response：永遠是 `200 OK`（Telegram 會在非 200 時 retry；我們不洩漏 failure mode）
- `POST /api/internal/commands/dispatch` — 僅 Phase 2；Phase 1 回傳 `501`。

Library entry point：`lib/command-plane/commandRouter.ts → routeCommand(supabase, input, opts)`。

## 5. 風險路由表

Source：`lib/command-plane/policyEngine.ts:RISK_TABLE`。新增一個 command = 一行變更 + handler registration。

| 風險 | 範例 | Telegram | Slack | Webhook | Internal/Schedule |
|---|---|---|---|---|---|
| low | `/start` `/help` `/status` `/health` `/daily_review` `/weekly_review` `/list_failed_runs` `/runbook` `/draft_cursor_task` `/client_status` | ✅ run | ✅ run | ✅ run | ✅ run |
| medium | `/emergency_stop` `/maintenance_mode` `/read_only_mode` `/trigger_staging_workflow` `/replay_dead_letter` `/create_issue` | ✅ run inline（Phase 2a/2b） | ⏸️ queued | ✅ run | ✅ run |
| high | `/normal_mode` `/deploy_production` `/refund` `/dns_change` `/rotate_secrets` | 🚫 hard-block | 🚫 hard-block | ⏸️ approval | ⏸️ approval |
| critical | `/drop_table` `/read_secrets` `/destructive_migration` `/cross_tenant_export` `/disable_killswitch` | 🚫 hard-block | 🚫 hard-block | 🚫 hard-block | 🚫 hard-block |

Unknown commands 預設為 `risk='high'`、`outcome='block'`、`rejection_reason='unknown_command'`（預設拒絕）。

## 6. 硬性封鎖（安全邊界）

與 `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` §10 以及 `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` 對齊。

Command plane **永遠不會**做以下任何事項——即使 actor auth 有效也一樣：

- production deploy
- DB migration（任何 ALTER / DROP / TRUNCATE）
- 讀取 secrets / vault
- DNS / Cloudflare changes
- payment / refund / payout
- customer data deletion / cross-tenant export
- 修改 RLS 或 approval policies 本身
- 修改 `system_modes`（kill switch 必須來自 ops console SSO）

只要 Args 包含 `--no-verify`、`--force`、`;`、`&`、`|`、backtick 或 `$(`，不論來源為何，都會被拒絕為 `risk='critical'`。

## 7. 新增 command

1. 將 command + risk 加到 `lib/command-plane/policyEngine.ts:RISK_TABLE`。
2. 在 `lib/command-plane/handlers/<name>.ts` 底下新增 handler，並 export 一個 `CommandHandler`。
3. 在 `lib/command-plane/handlers/index.ts:phase1Handlers` 註冊 handler。
4. 更新本檔 §5 的表格。
5. （可選）在 `scripts/configure-telegram-webhook.ps1` 的 `setMyCommands` list 中新增 entry。
6. 重新跑 `scripts/command-plane-smoke.ps1`，確認沒有 regression。

## 8. 新增 ingress source（Phase 2 / 3）

每個 source 都是一個很薄的 Next.js route，負責：

1. 驗證該 source 的 authentication scheme（HMAC、signed JWT 等）。
2. 將 payload 正規化為 `NormalizedCommand`（見 `lib/command-plane/types.ts`）。
3. 呼叫 `routeCommand(supabase, input, { handlers: phase1Handlers })`。
4. 回傳任何 source-specific reply。

Slack 與 Email 會重用整個 `lib/command-plane` core——只有 route file 是新的。

## 9. Operations runbook

### 設定 kill switch（emergency stop）

```sql
-- as service role, from ops console SQL editor
update public.system_modes
   set mode = 'emergency_stop',
       reason = '<incident link or one-line>',
       set_at = now(),
       set_by = '<your profile.id>'
 where scope_type = 'global' and scope_id is null;
```

### Reset to normal

```sql
update public.system_modes
   set mode = 'normal', reason = 'incident closed', set_at = now()
 where scope_type = 'global' and scope_id is null;
```

### 不碰 DB，停用 Telegram ingress

```powershell
.\scripts\configure-telegram-webhook.ps1 -Clear
```

Telegram 會在數秒內停止送出 updates；route 仍保持 deployed（不需要 rebuild）。

### Replay failed commands（手動，Phase 1）

```sql
select id, source, command, rejection_reason, received_at
  from public.command_requests
 where status = 'failed' and received_at > now() - interval '24 hours'
 order by received_at desc;

-- Inspect the matching error_events:
select error_message, event_payload, occurred_at
  from public.error_events
 where source_type like 'command_%'
   and trace_ref = '<trace_id from command_requests>'
 order by occurred_at desc;
```

若要 replay，從 Telegram 用新訊息送出同一個 command（Telegram update_id 會不同，因此 idempotency 不會擋 replay）。

## 10. Client Management

本節涵蓋 WordPress 與 SaaS client operations 的完整 tooling stack。

### 10.1 Ops Dashboard — `/ops/clients`

Web UI 位於 `https://app.aware-wave.com/ops/clients`。它會針對每個 client 顯示：
- Real-time health probe（HTTP HEAD → status code + latency）
- Platform 與 hosting type
- 最近一次 WP plugin update run（updated / failed / license counts、date）
- WP update wave buttons（wave1 / wave2 / wave3）——僅限 SSH；當未設定 `ssh_host` 時按鈕會隱藏

Source：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/clients/`  
API：`apps/next-admin/app/api/ops/clients/route.ts`  
Data store：`organizations.metadata.client_config` + `organizations.metadata.wp_update_latest`（Supabase）

### 10.2 Telegram — `/client_status`

Risk：**low**（read-only）。可隨時從 Telegram 使用；除了 `emergency_stop` 以外，任何 kill-switch mode 都可用（`system_modes` 讀不到時也會被擋下——fail closed）。

```
/client_status              # earliest 30 clients with a site_url (total shown) — compact summary table
/client_status soulful      # single client — full detail + wave assignments + last update results
```

Handler：`lib/command-plane/handlers/clientStatus.ts`  
Policy：`policyEngine.ts:RISK_TABLE["/client_status"] = "low"`  
Data：與 web dashboard 查詢相同的 `organizations.metadata`。

**All-clients output** — 每個 client 一個 block：
- health emoji + HTTP status
- 最近一次 WP update：updated count、failed、license-blocked、距離 run 已過幾天
- `/ops/clients` link

**Single-client output** — 完整 detail：
- platform / hosting type / site URL
- health status + latency
- WP update results：最近 8 筆 plugin records（✅ updated / ❌ failed / 🔑 license）
- wave assignments（wave1 / wave2 / wave3 plugin slugs）
- `/ops/clients/<slug>` link

### 10.3 Client Onboarding — `client-onboarding` subagent

Claude Code subagent 位於 `.claude/agents/client-onboarding.md`。  
當被要求新增 client 時會自動觸發。處理兩條路徑：

| 路徑 | 何時使用 | 主要步驟 |
|---|---|---|
| **§SSH** | Agency 管理 server（有 SSH credentials） | SQL `INSERT` → SSH key 以 `SSH_KEY_<LABEL>` env var 儲存在 SG → 透過 `wp plugin list` 做 wave classification |
| **§MainWP** | Client 自行管理自己的 server | SQL `INSERT` → MainWP Dashboard plugin → Client's Child plugin → webhook 到 `/api/ops/clients/<slug>/wp-report` |

SQL seed templates：`agency-os/reports/sql-seeds/`  
本 subagent 的 owner doc：`.claude/agents/client-onboarding.md`（self-contained）

### 10.4 WP Plugin Updates — SSH streaming

Endpoint：`POST /api/ops/clients/[slug]/wp-update?wave=wave1|wave2|wave3`  
Transport：SSE（`text/event-stream`）——progress 會即時 stream 到 browser。

Wave-based risk classification：

| Wave | Risk | Plugins | Update behaviour |
|---|---|---|---|
| wave1 | High | WooCommerce、auth、payment、security | One-by-one；每次後做 HTTP health check；第一次 failure 就停止 |
| wave2 | Medium | Forms、SEO、caching、URL structure | One-by-one |
| wave3 | Low | Utilities、analytics、widgets | Batch（`--all`） |

SSH key storage on SG：
```bash
# Key stored as base64 env var in docker-compose environment section:
SSH_KEY_HOSTINGER_SOULFUL: ${SSH_KEY_HOSTINGER_SOULFUL:-}

# Key loaded by the API route:
const keyB64 = process.env[`SSH_KEY_${cfg.ssh_key_name.toUpperCase()}`]
```

`organizations.metadata.client_config` 中的 config fields：
- `ssh_host`、`ssh_port`、`ssh_user`、`ssh_key_name`、`wp_path`
- `waves.wave1`、`waves.wave2`、`waves.wave3`（WP plugin slugs arrays）

Results 會在 run 完成時寫入 `organizations.metadata.wp_update_latest`。

### 10.5 Weekly WP Scan（Phase 3 — planned）

Anthropic Routine（`AgencyOS-WpWeeklyScan`）會：
1. 每週一 08:00 Asia/Taipei 執行
2. 對每個 WP client：SSH → `wp plugin list --update=available --format=json`
3. 如果發現 pending updates：送出 Telegram message，列出 plugin names 與 risk wave
4. 以 `source='schedule'` 寫入 `command_requests`

**Status：planned.** 目前 workaround：從 Telegram 傳 `/client_status`，或查看 Ops Dashboard。

---

## 11. Verification

每次 deploy 後，從 monorepo root 執行：

```powershell
.\scripts\command-plane-smoke.ps1 `
  -BaseUrl https://app.aware-wave.com `
  -SupabaseUrl https://supabase.aware-wave.com `
  -SupabaseServiceRoleKey $env:SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY `
  -TelegramWebhookSecret $env:TELEGRAM_WEBHOOK_SECRET `
  -TestUserId $env:TELEGRAM_ALLOWED_USER_IDS.Split(',')[0] `
  -TestChatId $env:TELEGRAM_ALLOWED_CHAT_IDS.Split(',')[0] `
  -ReportPath .\agency-os\reports\status\command-plane-smoke-LATEST.json
```

Smoke test 會跑八項檢查（見 script header）。Exit 0 = 全綠。

## 12. Phase 2 / 3 roadmap

- **Phase 2**：將 `/api/internal/commands/dispatch` 接到 Trigger.dev 的 `dispatch-action-run` task；釋放 medium-risk commands；新增 approvals + system_modes 的 ops console UI。
- **Phase 3**：Slack / Email ingress、Anthropic Routines integration、自動化 monthly restore drills、kill-switch one-click UI。（註：原機器本地 `run-weekly-automation.ps1` 已於 2026-05-30 退役 → GitHub Actions `weekly-workflows-security-audit.yml`。）

## 13. 相關文件

- `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE_OPERATIONS.md` — **operator manual**（roles / functions / settings / troubleshooting）
- `agency-os/docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md` — **出國 / 沒筆電 必看**（5 步出國前驗證、緊急 SOP、Termius 設定、解鎖路徑）
- `agency-os/docs/operations/TELEGRAM_COMMAND_POLICY.md` — Telegram-specific authentication and rate-limiting policy
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` — tool / MCP boundary spec
- `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` — 30-year execution contract
- `agency-os/docs/operations/AWARE_WAVE_OBSERVABILITY_BASELINE.md` — Sentry / PostHog / Uptime Kuma baseline this plane reuses

_Last updated: 2026-05-08_
