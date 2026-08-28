# Telegram 指令政策

> `COMMAND_PLANE_RUNBOOK.md` 的配套文件。本檔是 Telegram 專屬驗證、允許清單、硬性封鎖、稽核與速率限制規則的唯一真相來源。一般路由與風險表位於 command plane 文件中。

## 1. 驗證（請求層級）

每一個 `POST /api/internal/commands/telegram` 請求都必須同時滿足以下三項：

1. Header `X-Telegram-Bot-Api-Secret-Token` 等於環境變數 `TELEGRAM_WEBHOOK_SECRET`（使用 timing-safe compare）。此值於 `setWebhook` 時設定。
2. JSON body 可解析為 Telegram `Update`，且包含 `update_id` 與 `message.from.id`。
3. `message.from.id` 存在於環境變數 `TELEGRAM_ALLOWED_USER_IDS`（csv）**且** `message.chat.id` 存在於 `TELEGRAM_ALLOWED_CHAT_IDS`（csv）。

任何失敗情況：

- 寫入一筆 `error_events`，其中 `source_type = 'telegram_auth_failed'`，
- 捕捉一則 Sentry warning（除已遮罩 payload 外，不含 PII），
- 回傳空內容的 `200 OK`。我們不回傳 `401`，因為那會讓攻擊者列舉哪些 secret 值是錯的。

## 2. 風險路由（Telegram 專屬投影）

| 風險 | Telegram 行為 |
|---|---|
| low | inline dispatch；回覆 handler 文字 |
| medium | `command_requests.status = 'queued'`；回覆「queued for approval」；Phase 2 接手處理 |
| high | 從 Telegram 硬性封鎖；回覆「this command must be issued from ops console」 |
| critical | 從任何來源硬性封鎖；回覆「command not permitted from any external source」 |
| unknown | `status='blocked_by_policy'`，`rejection_reason='unknown_command'` |

完整的 RISK_TABLE 位於 `lib/command-plane/policyEngine.ts`。

## 3. 硬性封鎖（縱深防禦）

即使 actor 在允許清單內，只要指令 args 含有以下內容，policy engine 就會丟棄該指令：

- `--no-verify`
- `--force`
- shell metacharacters：`;`、`&`、`|`、backtick、`$(`

這些都是 `risk='critical'` 封鎖（status = `blocked_by_policy`，reason = `forbidden_arg_pattern`）。

## 4. 稽核

每一個 Telegram update——包含在驗證層被靜默丟棄的 update——都會至少產生一筆持久化紀錄：

- 成功或被 policy 封鎖的指令 → 一筆 `command_requests` row（`status` 反映結果）
- 驗證失敗 → 一筆 `error_events` row（`source_type = 'telegram_auth_failed'`）

兩種 row 都會帶有已遮罩 payload，供鑑識 replay 使用。PII keys（`token`、`password`、`auth*`、`cookie`、`session`、`credential`）會在 logging 前透過 `lib/ops-inbox/redactSecrets.ts` 清除。

## 5. 速率限制（Phase 1 立場）

Phase 1 不在程式碼中實作自動速率限制。單一 actor 部署 + Cloudflare DNS + Telegram 自身 server-side rate limits（約每秒 30 則訊息到單一 chat）讓濫用在實務上不太可行。Phase 2 會新增：

- `command_requests` 中的 per-actor rolling counter（已可透過 `actor_type, actor_ref` 建 index），
- 當單一 actor 在 60 秒內超過 10 個指令時，自動將 `system_modes.scope='client', mode='read_only'` 切換 30 分鐘，
- auto-flip 時發 Slack alert。

## 6. 建立 Bot（一次性，由操作者執行）

Telegram API **不允許**程式化建立 bot。操作者必須：

1. 打開 Telegram，搜尋 `@BotFather`，送出 `/newbot`。
2. 依照提示操作：選擇 display name，接著選擇一個以 `bot` 結尾的唯一 username。
3. 保存 BotFather 給的 bot token（格式 `123456789:ABC-...`）。
4. 在同一個 chat 中，傳 `/start` 給 `@userinfobot`（或任何等效工具）以取得自己的數字 user id。
5. 從 monorepo root 執行：
   ```powershell
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_BOT_TOKEN -Value '<paste from BotFather>'
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_WEBHOOK_SECRET -Value (
     [Convert]::ToBase64String([byte[]](1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   )
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_ALLOWED_USER_IDS -Value '<your numeric user id>'
   .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_ALLOWED_CHAT_IDS -Value '<your numeric user id>'
   .\scripts\secrets-vault.ps1 -Action sync-mcp-user-env
   ```
6. 開一個新的 PowerShell session，接著執行：
   ```powershell
   .\scripts\configure-telegram-webhook.ps1
   ```
7. 在 Telegram 中傳送 `/status` 給你的 bot。預期：大約 30 秒內收到 system-status 回覆。

## 7. 相關文件

- `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` — 整個 command plane 的 owner doc
- `lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql` — schema
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/` — implementation

_Last updated: 2026-05-07_
