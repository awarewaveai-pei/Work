# 桌機 MCP 環境對齊指引

> **檔案位置**：`mcp/DESKTOP_MCP_SETUP.md`（與 `registry.template.json` 同目錄；**不是**子資料夾 `DESKTOP_MCP_SETUP/`）。
>
> **給 Cursor AI 看的**：讀完這份文件後，直接照步驟執行，不需要詢問使用者。
>
> **執行環境**：Windows。以下 **`<WORK_ROOT>`** ＝ monorepo 根（等同 `git rev-parse --show-toplevel`）。常見實例：`C:\Users\USER\Work`、`D:\Work`—請替換成你本機 clone 根目錄。

---

## 背景說明

筆電側已完成以下 MCP 設定修正（commits `efe41aa`、`8c9677e`），桌機需要對齊：

- `supabase` MCP 條目已停用（自架 Supabase 無 `/mcp` endpoint，永遠黃燈）
- `n8n` MCP 正常運作，需要 `N8N_MCP_URL` 環境變數
- `GRAFANA_BASE_URL` 須為 `http://localhost:3009`（SSH tunnel，非公開 URL）
- `mcp/registry.template.json` 是所有 MCP 的唯一真相

---

## 步驟 1：pull 最新 repo

```powershell
cd <WORK_ROOT>   # 例：cd C:\Users\USER\Work
git pull origin main
```

確認 `git log --oneline -3` 看到 `[claude] fix(mcp)` 的 commit。

---

## 步驟 2：建立或更新 `mcp/user-env.ps1`

`mcp/user-env.ps1` **不進 git**（gitignored），每台機器獨立維護。

### 2a. 若此機器還沒有 user-env.ps1

```powershell
cd <WORK_ROOT>
copy .\mcp\user-env.template.ps1 .\mcp\user-env.ps1
```

### 2b. 打開 `mcp/user-env.ps1`，填入以下值

從 `C:\Users\<你的帳號>\Desktop\AWARE_WAVE_CREDENTIALS.md` 或 1Password 取得實際密鑰。

**必填（MCP 運作所需）：**

```powershell
N8N_MCP_URL                  = "https://n8n.aware-wave.com/mcp-server/http"
N8N_AUTH_BEARER_TOKEN        = "<從 n8n → Settings → MCP → Connection details 取得>"
N8N_API_BASE_URL             = "https://n8n.aware-wave.com/api/v1"
N8N_API_KEY                  = "<n8n Personal API Key>"
N8N_BASIC_AUTH_USER          = "<n8n 登入帳號>"
N8N_BASIC_AUTH_PASSWORD      = "<n8n 登入密碼>"

GRAFANA_BASE_URL             = "http://localhost:3009"   # 固定這個值，不要改成 https://
GRAFANA_SERVICE_ACCOUNT_TOKEN = "<Grafana service account token>"
GRAFANA_BASIC_USER           = "admin"
GRAFANA_BASIC_PASSWORD       = "<Grafana admin 密碼>"

SUPABASE_AWAREWAVE_URL       = "https://supabase.aware-wave.com"
SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY = "<service role JWT>"
SUPABASE_AWAREWAVE_POSTGRES_DSN = "postgresql://postgres:<password>@localhost:5432/postgres"

NETDATA_BASE_URL             = "https://app.netdata.cloud"
NETDATA_API_TOKEN            = "<Netdata API token>"

SLACK_API_BASE_URL           = "https://slack.com/api"
SLACK_BOT_TOKEN              = "<xoxp-... Slack bot token>"
SLACK_WEBHOOK_URL            = "<https://hooks.slack.com/...>"

SENTRY_API_BASE_URL          = "https://sentry.io/api/0"
SENTRY_AUTH_TOKEN            = "<Sentry auth token>"

UPTIME_KUMA_BASE_URL         = "https://uptime.aware-wave.com"
UPTIME_KUMA_API_KEY          = "<Uptime Kuma API key（可空白）>"

CLOUDFLARE_API_BASE_URL      = "https://api.cloudflare.com/client/v4"
CLOUDFLARE_API_TOKEN         = "<Cloudflare API token>"
CLOUDFLARE_AUTH_BEARER_TOKEN = "<Cloudflare Bearer token>"

POSTHOG_API_BASE_URL         = "https://us.i.posthog.com/api"
POSTHOG_PERSONAL_API_KEY     = "<PostHog personal API key>"

RESEND_API_KEY               = "<Resend API key>"
RESEND_API_BASE_URL          = "https://api.resend.com"
RESEND_SENDER_EMAIL_ADDRESS  = "<寄件 email>"
RESEND_REPLY_TO_EMAIL_ADDRESSES = "<回覆 email>"

HETZNER_API_BASE_URL         = "https://api.hetzner.cloud/v1"
HETZNER_API_TOKEN            = "<Hetzner API token>"

API_AWAREWAVE_BASE_URL       = "https://api.aware-wave.com"
API_AWAREWAVE_BEARER_TOKEN   = "<service role JWT（與 Supabase 同）>"
APP_AWAREWAVE_BASE_URL       = "https://app.aware-wave.com"
APP_AWAREWAVE_BEARER_TOKEN   = "<service role JWT（與 Supabase 同）>"

TRIGGER_API_URL              = "https://trigger.aware-wave.com"
TRIGGER_ACCESS_TOKEN         = "<Trigger.dev Personal Access Token>"
TRIGGER_PROJECT_REF          = "<prj_xxx>"

GITHUB_PERSONAL_ACCESS_TOKEN = "<GitHub PAT>"
COPILOT_MCP_BEARER_TOKEN     = "<GitHub PAT（同上或 Copilot 專用）>"

OPENAI_API_KEY               = "sk-..."
ANTHROPIC_API_KEY            = "sk-ant-..."
GEMINI_API_KEY               = "AIza..."
XAI_API_KEY                  = "xai-..."
PERPLEXITY_API_KEY           = "pplx-..."

AIRTABLE_API_KEY             = "pat_..."
REPLICATE_API_TOKEN          = "r8_..."

WP_API_URL                   = "https://aware-wave.com/"
WORDPRESS_JWT_TOKEN          = "<WordPress JWT>"

SUPABASE_SOULFULEXPRESSION_URL = "https://mffjqjiidbeibilmxzef.supabase.co"
SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY = "<Soulful Expression service role key>"
```

> **注意**：`SUPABASE_AUTH_BEARER_TOKEN` 和 `SUPABASE_MCP_URL` 不需要填，已廢棄。

---

## 步驟 3：執行 user-env.ps1，寫入 Windows 環境變數

```powershell
cd <WORK_ROOT>
powershell -ExecutionPolicy Bypass -File .\mcp\user-env.ps1
```

看到 `Persisted N8N_MCP_URL`、`Persisted N8N_AUTH_BEARER_TOKEN` 等輸出即成功。
空值的項目會顯示 `Skip empty ...`，正常。

---

## 步驟 4：執行 sync，產生所有 AI 客戶端的 MCP 設定

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1
```

成功輸出（路徑隨 `<WORK_ROOT>` 與使用者目錄而變）：
```
MCP sync complete.
  workspace : <WORK_ROOT>\.mcp.json
  cursor    : <WORK_ROOT>\.cursor\mcp.json
  claude    : C:\Users\...\mcp.json
  codex     : C:\Users\...\.codex\config.toml
  copilot   : C:\Users\...\.copilot\mcp-config.json
  gemini    : C:\Users\...\.gemini\settings.json
```

只剩 `REPLICATE_WEBHOOK_SIGNING_KEY` 的 Missing 警告可以忽略（選填）。

---

## 步驟 5：完全重啟 Cursor

完全關閉 Cursor（工作列右鍵 → 結束），再重新開啟。

**預期結果：**
- `n8n` → 綠燈
- `supabase` 條目不存在（已停用，不再顯示）
- `awarewave-ops`、`grafana`、`netdata`、`sentry`、`uptime-kuma` 全部透過 `awarewave-ops` 運作

---

## Grafana / Supabase Postgres 需要額外開 SSH tunnel

這兩個服務不是公開 HTTPS，需要先開 tunnel 才能使用：

```powershell
# Grafana（開後 localhost:3009 可用）
.\scripts\open-grafana-ssh-tunnel.ps1 -Background

# Supabase Postgres（開後 localhost:5432 可用）
.\scripts\open-supabase-ssh-tunnel.ps1 -Background
```

n8n / Sentry / PostHog / Cloudflare / Uptime Kuma 不需要 tunnel，直接 HTTPS。

---

## 驗證 n8n MCP 是否正常

```powershell
npm run n8n:mcp-smoke
```

或：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\n8n-mcp-smoke.ps1
```

看到 `INIT_STATUS: ok` 和 `TOOLS_COUNT: <數字>` 即完成。

---

_此文件由 Claude Sonnet 4.6 於 2026-04-30 產生，對應 commit `efe41aa`_
