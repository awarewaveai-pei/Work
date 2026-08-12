# Command Plane — Telegram Silence Runbook

> **Owner**: 本檔
> **觸發時機**: Telegram bot 不回覆任何指令（包含 `/status`、`/start`）
> **相關 owner docs**: `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md`（架構）、`TELEGRAM_OPERATOR_CHEATSHEET.md`（操作）

---

## TL;DR 診斷順序（3 根因，按出現頻率）

```
1. 先跑 -Verify 看 webhook URL 和最近錯誤
2. 再查 docker env 是否有 TELEGRAM_WEBHOOK_SECRET
3. 最後確認 secret 值是否與 vault 一致（有沒有跑 -Force 後沒 rebuild）
```

---

## Step 1：執行 Webhook 診斷

```powershell
.\scripts\configure-telegram-webhook.ps1 -Verify
```

讀懂輸出：

| 輸出欄位 | 正常 | 問題訊號 |
|---------|------|---------|
| `URL match: OK` | ✅ | MISMATCH → 重跑 `configure-telegram-webhook.ps1`（不帶 `-Verify`）重設 |
| `Pending msgs:` | 0 | 數字很大 → bot 有收到但沒處理，是 server 端問題 |
| `Last error: none` | ✅ | 有 error → 看錯誤訊息，通常是 `401 Unauthorized`（secret mismatch）|

> **注意**：Telegram 無法告訴你 secret 是否吻合，只能確認 URL。secret mismatch 時 `last_error` 會顯示 `400 Bad Request`。

---

## Step 2：確認 Docker Container 有 `TELEGRAM_WEBHOOK_SECRET`（最常見根因）

**從 SG VPS 上確認**（via Termius 或 SSH）：

```bash
cd /root/lobster-phase1
docker inspect lobster-next-admin --format '{{range .Config.Env}}{{println .}}{{end}}' | grep TELEGRAM
```

正常應看到：
```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_ALLOWED_USER_IDS=...
TELEGRAM_ALLOWED_CHAT_IDS=...
```

**若 `TELEGRAM_WEBHOOK_SECRET` 不存在** → root cause 確認：docker-compose.yml 沒有把這個 env var 傳進 container。

修法：
```bash
# 確認 .env 有這些 key
grep TELEGRAM /root/lobster-phase1/.env
grep COMMAND_PLANE /root/lobster-phase1/.env

# 若缺少，需把真值加入 .env。真值來源＝本機 mcp\user-env.ps1 的 TELEGRAM_WEBHOOK_SECRET。
# 【不要】用 -Action get 取值：那是確認存在用，只會印出遮罩 abcd****xy，貼進 .env 會讓 bot 永久靜默。
# 只確認「vault 裡有沒有這把」時才用：
.\scripts\secrets-vault.ps1 -Action get -Name TELEGRAM_WEBHOOK_SECRET   # 輸出為遮罩，僅供確認存在

# 加進 server .env 後 rebuild：
cd /root/lobster-phase1
docker compose --env-file .env up -d --build next-admin
```

**必須在 server `.env` 的完整 env var 清單（Command Plane 相關）：**

```env
TELEGRAM_BOT_TOKEN=<from vault>
TELEGRAM_WEBHOOK_SECRET=<from vault>
TELEGRAM_ALLOWED_USER_IDS=<your numeric telegram user_id>
TELEGRAM_ALLOWED_CHAT_IDS=<same as USER_IDS for private chat>
COMMAND_PLANE_DEFAULT_ORG_ID=<Supabase organizations.id UUID>
COMMAND_PLANE_DEFAULT_WORKSPACE_ID=<workspaces UUID or empty string — 不能只設為空格>
ANTHROPIC_API_KEY=<from vault>
```

> **`COMMAND_PLANE_DEFAULT_WORKSPACE_ID` 警告**：必須是合法 UUID 或**完全空字串**。
> 空格或換行會造成 `invalid input syntax for type uuid`，bot 靜默但 Sentry 會有 error。

---

## Step 3：確認 Secret 值吻合（避免 `-Force` 造成的 drift）

**Root cause**：`setup-command-plane.ps1` 在早期版本每次執行都會重新產生 `TELEGRAM_WEBHOOK_SECRET`，導致 Telegram 傳來的 secret 和 server 上的不吻合。

**現在的行為**：script 預設 reuse vault 中的 secret；`-Force` 才會重產（並印出警告，提醒必須同時 rebuild）。

**確認兩端 secret 一致**：

```powershell
# 本機 vault 是否有這把（輸出為遮罩，不可拿去比對值）
.\scripts\secrets-vault.ps1 -Action get -Name TELEGRAM_WEBHOOK_SECRET
# 要比對兩端是否一致，用指紋（不外洩真值）：
. .\scripts\_vault-helpers.ps1; Get-VaultSecretFingerprint -Store (Read-VaultStore (Resolve-VaultPath)) -Name TELEGRAM_WEBHOOK_SECRET
```

```bash
# SG server 上的 secret
grep TELEGRAM_WEBHOOK_SECRET /root/lobster-phase1/.env
```

若兩者不同：

```bash
# 用 vault 值更新 .env，再 rebuild
cd /root/lobster-phase1
docker compose --env-file .env up -d --build next-admin
```

---

## Step 4：確認 Sentry 沒有 Cold-Start Guard Event

Container 啟動時若 `TELEGRAM_WEBHOOK_SECRET` / `TELEGRAM_ALLOWED_USER_IDS` 缺失，會在 Sentry 發出一個 `command_plane.startup.env_missing` event（每次 cold-start 最多一次）。

在 Sentry 搜尋：
```
command_plane.startup.env_missing
```

若有這個 event，代表 container 現在缺 env var，回到 Step 2 修。

---

## Step 5：驗證修復

1. Rebuild 完成後，等 30 秒讓 container healthy：
   ```bash
   docker ps --format '{{.Names}} {{.Status}}'
   # 確認看到: lobster-next-admin Up X seconds (healthy)
   ```

2. 從 Telegram 送 `/status` → 應在 5 秒內收到回覆。

3. 跑 Command Plane smoke test（若在本機）：
   ```powershell
   .\scripts\command-plane-smoke.ps1 -BaseUrl https://app.aware-wave.com
   ```

---

## 快速參考：已知根因對照表

| 症狀 | 根因 | 修法 |
|------|------|------|
| bot 靜默，`-Verify` 顯示 URL MISMATCH | webhook URL 指到舊端點 | 重跑 `configure-telegram-webhook.ps1` |
| bot 靜默，URL OK，pending msgs 累積 | server 沒收到 or 拒絕 secret | 確認 server `.env` 有 `TELEGRAM_WEBHOOK_SECRET`，rebuild |
| bot 靜默，`-Verify` 顯示 `last_error: 400` | Telegram↔server secret 不吻合 | 同步 vault secret 到 server `.env`，rebuild |
| bot 偶爾回覆、偶爾不 | `COMMAND_PLANE_DEFAULT_WORKSPACE_ID` 有空白 | 改成空字串 `""` 或合法 UUID，rebuild |
| bot 靜默，Sentry 有 `command_plane.startup.env_missing` | container 啟動時缺 env var | 確認 docker-compose.yml 傳入所有 TELEGRAM_ 和 COMMAND_PLANE_ vars |
| bot 前幾次回覆、後來靜默（3-layer retry 後） | Telegram 下行不穩 or 回覆超過 60 秒 timeout | 看 Sentry `telegram_send_failed`；通常等 5 分鐘自動恢復 |

---

## Related

- `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` — 整體架構（owner）
- `agency-os/docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md` — 操作者 cheat sheet
- `scripts/configure-telegram-webhook.ps1` — `-Verify` 診斷工具
- `scripts/command-plane-smoke.ps1` — 8-check 完整 smoke test
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/` — 程式碼

_Last updated: 2026-05-13 — 3 根因修復後補齊_
