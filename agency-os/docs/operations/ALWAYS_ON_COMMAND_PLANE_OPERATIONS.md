# Always-On Command Plane — 操作手冊（小白版）

> 角色／功能／設定／故障 一站式日常使用指南。
> 技術 SSOT 在 `ALWAYS_ON_COMMAND_PLANE.md`；驗證/政策在 `TELEGRAM_COMMAND_POLICY.md`。本檔只給日常用。

---

## 一、角色（誰負責什麼）

### 1.1 操作者（Pei-Ching Huang）— 你
- 透過手機 Telegram `@awarewave_ops_bot` 下指令
- 你的 user_id：`8286448653`（已入白名單 `TELEGRAM_ALLOWED_USER_IDS`）
- 能做：5 個 low-risk 指令（查狀態 / 產報告）
- 不能做：production deploy / 改 secret / 改 DNS / 退款（hard-block 永遠擋）

### 1.2 Telegram Bot — `@awarewave_ops_bot`
- 顯示名：AwareWave Ops
- 持有人：Pei-Ching Huang
- Token 存放：本機 vault `TELEGRAM_BOT_TOKEN` + Desktop `AWARE_WAVE_CREDENTIALS.md` §二十四
- 流量路徑：你手機 → Telegram → Cloudflare → SG host nginx (443) → next-admin (3002)

### 1.3 next-admin（指令執行者）
- 位置：SG VPS `5.223.93.113`
- 容器：`lobster-next-admin`
- 部署目錄：`/root/lobster-phase1`
- env 來源：`/root/lobster-phase1/.env`
- Endpoint：`https://app.aware-wave.com/api/internal/commands/telegram`

### 1.4 Supabase（系統記憶）
- 位置：EU VPS `204.168.175.41`
- 容器：`supabase-db`（PostgreSQL 15）
- 表：`command_requests`（每個指令一行）、`system_modes`（kill switch 狀態）、`error_events`（失敗紀錄）、`workflow_runs`（既有）
- 對外 REST：`https://supabase.aware-wave.com`

### 1.5 Anthropic Claude API（AI 摘要引擎）
- 雲端服務（Anthropic）
- 跑 `/daily_review` `/weekly_review` 的摘要
- Key：next-admin 容器 env `ANTHROPIC_API_KEY`（同 Desktop §十九）

---

## 二、功能（全部 12 個 handler / 10 個 Telegram menu 入口）

### 2.1 Phase 1 — 唯讀查詢 / AI 摘要（low risk）

| 指令 | 用途 | 何時用 | 回應 |
|---|---|---|---|
| `/start` 或 `/help` | 完整選單 | 第一次用 / 忘記指令 | 列出指令 |
| `/status` | 系統健康快照 | 「現在怎樣？」 | mode + 最近 5 指令 + 開放 incidents |
| `/health` | 細部健康指標 | 「有沒有冒煙？」 | 開放 incident 數 + 24h 錯誤數 |
| `/daily_review` | 24h AI 摘要 | 早上看昨夜 | 2-3 句摘要 + 變化 + 下一步 |
| `/weekly_review` | 7d AI 摘要 | 週末/週一回顧 | 同上但週級 |
| `/list_failed_runs` | 最近失敗清單 | 找特定失敗 trace_id | 10 筆 command_requests + workflow_runs |

### 2.2 Phase 2a — Kill switch ENABLE（medium risk；解鎖必走 SQL/SSO）

| 指令 | 用途 | 設定 mode | 影響 |
|---|---|---|---|
| `/emergency_stop` | 🛑 緊急鎖死所有指令 | `emergency_stop` | 後續所有指令 → `blocked_by_killswitch` |
| `/maintenance_mode` | 🔧 例行維運期 | `maintenance` | 阻擋非 low-risk |
| `/read_only_mode` | 🔒 只允許讀 | `read_only` | 只 low-risk 通過 |

> **解鎖**：`/normal_mode` 從 Telegram 永遠 hard-block。必須 (a) Supabase Studio SQL editor 改 `mode='normal'`（見 §3.5），或 (b) Phase 2c 上線後 ops console SSO 簽核。設計理由：鎖系統要快、解鎖要慢，非對稱授權。

### 2.3 Phase 2b — Trigger.dev 工作流 dispatch（medium risk）

| 指令 | 用法 | 回應 | 備註 |
|---|---|---|---|
| `/trigger_staging_workflow <task>` | `/trigger_staging_workflow ao-infrastructure-check` | 📤 `run_id` + Trigger.dev URL | Allowlist 在 `triggerWorkflow.ts:ALLOWED_TASKS`（目前僅 `ao-infrastructure-check`） |
| `/replay_dead_letter <uuid>` | `/replay_dead_letter <error_event_id>` | 📋 error_event 細節 | **診斷模式**；自動 re-execution 是 Phase 3 |

> **新增 Trigger.dev 任務到 allowlist**：編輯 `lib/command-plane/handlers/triggerWorkflow.ts` 的 `ALLOWED_TASKS` Set → commit + redeploy。故意 hardcode 在 source — 每次新增需 PR review，符合「最小授權 + 可審計」。

### 2.4 風險分級（誰可以做什麼）

| 風險 | 範例 | Telegram | Slack（未實作） | ops console SSO |
|---|---|---|---|---|
| **low** | `/status` `/health` `/daily_review` 等 | ✅ 直接跑 | ✅ | ✅ |
| **medium** | `/emergency_stop` `/trigger_staging_workflow` `/replay_dead_letter` | ✅ inline（Phase 2a/2b） | ⏸️ | ✅ |
| **high** | `/normal_mode` `/deploy_production` `/refund` `/dns_change` | 🚫 永久擋 | 🚫 | ⏸️ approval |
| **critical** | `/drop_table` `/read_secrets` `/cross_tenant_export` `/disable_killswitch` | 🚫 任何 source | 🚫 | 🚫 |
| 未知 | `/asdf` | 🚫 預設 deny | 🚫 | 🚫 |

### 失敗時系統做什麼（不用你操心）

任何指令失敗 → 自動：
1. `command_requests.status = 'failed'`
2. `error_events` 寫一筆（`source_type` 對應失敗階段）
3. Sentry capture（既有 SDK）
4. Slack `#infra-alerts` 收通知（既有 webhook）

---

## 三、設定（怎麼改）

### 3.1 換 Bot Token（懷疑洩漏時）

1. Telegram 開 `@BotFather` → 傳 `/revoke` → 選 `awarewave_ops_bot` → 取得新 token
2. 你電腦 monorepo 根：
   ```powershell
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_BOT_TOKEN -Value '<新 token>'
   ```
3. SSH SG：改 `/root/lobster-phase1/.env` 內 `TELEGRAM_BOT_TOKEN=` 那行為新值
4. SG：`cd /root/lobster-phase1 && docker compose --env-file .env up -d --force-recreate next-admin`
5. 你電腦重設 webhook：
   ```powershell
   .\scripts\secrets-vault.ps1 -Action run -Names TELEGRAM_BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET -Command '.\scripts\configure-telegram-webhook.ps1'
   ```
6. 手機傳 `/status` 驗收
7. 更新 Desktop `AWARE_WAVE_CREDENTIALS.md` §二十四 token 那行

### 3.2 新增 user_id（讓夥伴/另一支手機也能用）

1. vault 把現有 + 新 id 逗號串：
   ```powershell
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_ALLOWED_USER_IDS -Value '8286448653,新id'
   ```
2. SSH SG：改 `.env` 對應行
3. SG：`docker compose --env-file .env up -d --force-recreate next-admin`
4. 新人在 Telegram 找 `@awarewave_ops_bot` 傳 `/start` 驗收

### 3.3 加新指令（low-risk）

1. 編 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/policyEngine.ts` `RISK_TABLE` 加一行 `"/your_cmd": "low"`
2. 寫 handler `lib/command-plane/handlers/yourCmd.ts`（複製 `status.ts` 改邏輯）
3. 編 `lib/command-plane/handlers/index.ts` import + 註冊到 `phase1Handlers`
4. 編 `scripts/configure-telegram-webhook.ps1` 內 `$commands` 加一筆（讓 BotFather menu 顯示）
5. commit + push 到 main
6. SSH SG：`cd /root/Work && git pull origin main`
7. SG：cp 改動的 ts 檔到 `/root/lobster-phase1/...`
8. SG：`cd /root/lobster-phase1 && docker compose --env-file .env build next-admin && docker stop lobster-next-admin && docker rm lobster-next-admin && docker compose --env-file .env up -d next-admin`
9. 你電腦：重跑 `configure-telegram-webhook.ps1` 更新 menu

### 3.4 緊急停 Telegram（不重啟容器）

```powershell
.\scripts\secrets-vault.ps1 -Action run -Names TELEGRAM_BOT_TOKEN -Command '.\scripts\configure-telegram-webhook.ps1 -Clear'
```
Telegram 5 秒內不再送 webhook。系統其他部分零影響。

### 3.5 手動拉 kill switch（從 Supabase Studio）

打開 https://studio.aware-wave.com（帳密在 Desktop §三）→ 進 SQL editor → 跑：
```sql
update public.system_modes
   set mode = 'emergency_stop', reason = '<說明>', set_at = now()
 where scope_type = 'global' and scope_id is null;
```
之後所有 Telegram 指令 → `blocked_by_killswitch`（連 `/status` 也擋）。

解除：
```sql
update public.system_modes
   set mode = 'normal', reason = 'incident closed', set_at = now()
 where scope_type = 'global' and scope_id is null;
```

> Phase 2 會把這個操作做成 `/emergency_stop` 指令，不必再開 SQL editor。

### 3.6 環境變數對照表

| 變數 | vault | SG `.env` | 用途 |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | ✅ | bot 識別 |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | ✅ | webhook header 驗證 |
| `TELEGRAM_ALLOWED_USER_IDS` | ✅ | ✅ | 白名單 user |
| `TELEGRAM_ALLOWED_CHAT_IDS` | ✅ | ✅ | 白名單 chat |
| `COMMAND_PLANE_DEFAULT_ORG_ID` | ✅ | ✅ | organizations.id |
| `ANTHROPIC_API_KEY` | ✅ | ✅ | AI 摘要 |

改任一個 → vault 改 + SG `.env` 改 + SG 重啟容器，三件都做才會生效。

---

## 四、故障排除

| 症狀 | 可能原因 | 修法 |
|---|---|---|
| 手機傳指令完全沒回應 | webhook 沒設 / next-admin 掛 | `curl https://app.aware-wave.com/api/internal/commands/telegram -X POST -d '{}'` 應 200；非 200 → SSH SG 看 `docker ps` |
| Bot 回「🚫 Blocked by policy」 | 指令名打錯 / 風險擋 | 對照 §二，用對的指令 |
| Bot 回「🛑 Blocked by killswitch」 | system_modes 在 emergency_stop | §3.5 改 mode='normal' |
| Bot 回「❌ ... failed」 | handler 內部錯誤 | 看 trace_id → SSH SG `docker logs lobster-next-admin --tail 100` 找堆疊 |
| 同一指令送兩次只跑一次 | idempotency（design intent，非 bug） | 改個字或等 1 分鐘 |
| `/daily_review` 拿到「AI summary unavailable」 | `ANTHROPIC_API_KEY` 沒注入容器 | SSH SG 看 `docker exec lobster-next-admin printenv ANTHROPIC_API_KEY` |
| Telegram 後台顯示 webhook 一直 fail | next-admin 重啟中 / 證書過期 | SSH SG `docker ps` 確認 healthy；證書 `certbot renew` |

驗收 smoke：
```powershell
.\scripts\secrets-vault.ps1 -Action run -Names TELEGRAM_WEBHOOK_SECRET,SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY -Command '.\scripts\command-plane-smoke.ps1 -BaseUrl https://app.aware-wave.com -SupabaseUrl https://supabase.aware-wave.com -SupabaseServiceRoleKey $env:SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY -TelegramWebhookSecret $env:TELEGRAM_WEBHOOK_SECRET -TestUserId 8286448653 -TestChatId 8286448653'
```
8/8 PASSED 即正常。

---

## 五、相關檔案（要查更深入時）

| 主題 | 檔案 |
|---|---|
| 技術 SSOT（架構、API、schema 設計理由） | `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md` |
| 驗證 / 政策（Telegram auth 規則） | `agency-os/docs/operations/TELEGRAM_COMMAND_POLICY.md` |
| Schema | `lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql` |
| Code（lib + handlers） | `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/` |
| API route | `lobster-factory/.../app/api/internal/commands/` |
| Scripts | `scripts/setup-command-plane.ps1` `scripts/configure-telegram-webhook.ps1` `scripts/command-plane-smoke.ps1` |
| 憑證 reference | Desktop `AWARE_WAVE_CREDENTIALS.md` §二十四 |

---

_Last updated: 2026-05-08_
