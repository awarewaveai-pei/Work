# MCP & API 服務憑證地圖

> **重要**：此檔不含明文密鑰。實際值存於 `mcp/user-env.ps1`（gitignored）。
> 請將 `user-env.ps1` 備份到 Google Drive / 1Password / 加密隨身碟。

---

## 自架服務（Hetzner VPS 5.223.93.113）

| 服務 | 對外 URL | 驗證方式 | 環境變數 |
|---|---|---|---|
| **Supabase Kong API** | `https://supabase.aware-wave.com` | Bearer JWT | `SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY` |
| **Supabase Studio** | `https://studio.aware-wave.com` | Basic Auth | 見 memory/reference_vps_access.md |
| **Supabase Postgres** | `localhost:5432`（需 SSH tunnel） | DSN | `SUPABASE_AWAREWAVE_POSTGRES_DSN` |
| **n8n** | `https://n8n.aware-wave.com` | Basic Auth / JWT / API Key | `N8N_BASIC_AUTH_USER/PASSWORD` `N8N_AUTH_BEARER_TOKEN` `N8N_API_KEY` |
| **n8n MCP** | `https://n8n.aware-wave.com/mcp-server/http`（子網域根 + **`N8N_PATH=/`**）；若 compose 仍為 **`N8N_PATH=/n8n/`**（僅 apex `/n8n/` 部署），則為 `…/n8n/mcp-server/http` | Bearer JWT | `N8N_MCP_URL` `N8N_AUTH_BEARER_TOKEN` |
| **Supabase MCP（自架 AwareWave）** | **`https://supabase.aware-wave.com/mcp`**（已寫入 repo **`.cursor/mcp.json`** 鍵 **`supabase`**） | 依 [Enable MCP（自架）](https://supabase.com/docs/guides/self-hosting/enable-mcp)；Bearer：`SUPABASE_AUTH_BEARER_TOKEN`（`sync-cursor-mcp-user-env`） | `SUPABASE_AUTH_BEARER_TOKEN` |
| **Trigger.dev** | `https://trigger.aware-wave.com` | Bearer Token | `TRIGGER_ACCESS_TOKEN` |
| **Uptime Kuma** | `https://uptime.aware-wave.com` | API Key | `UPTIME_KUMA_API_KEY` |
| **Grafana** | `http://localhost:3009`（SSH tunnel） | Basic Auth | `GRAFANA_BASIC_USER` `GRAFANA_BASIC_PASSWORD` |
| **api.aware-wave.com** | `https://api.aware-wave.com` | Bearer | `API_AWAREWAVE_BEARER_TOKEN` |
| **app.aware-wave.com** | `https://app.aware-wave.com` | Bearer | `APP_AWAREWAVE_BEARER_TOKEN` |
| **WordPress** | `https://aware-wave.com` | JWT or application password | `WORDPRESS_JWT_TOKEN` |

---

## 雲端服務

| 服務 | URL / Project | 驗證方式 | 環境變數 |
|---|---|---|---|
| **Soulful Expression Supabase（雲端）** | `https://mffjqjiidbeibilmxzef.supabase.co` | Service Role Key / PAT | `SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY` `SUPABASE_SOULFULEXPRESSION_AUTH_BEARER_TOKEN` |
| **Soulful Expression Supabase MCP** | `mcp.supabase.com/mcp?project_ref=mffjqjiidbeibilmxzef` | PAT | `SUPABASE_SOULFULEXPRESSION_AUTH_BEARER_TOKEN` |
| **Cloudflare** | `api.cloudflare.com/client/v4` | API Token | `CLOUDFLARE_API_TOKEN` `CLOUDFLARE_AUTH_BEARER_TOKEN` |
| **GitHub** | `api.github.com` | PAT | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| **GitHub Copilot MCP** | `api.githubcopilot.com/mcp` | Bearer | `COPILOT_MCP_BEARER_TOKEN` |
| **Hetzner** | `api.hetzner.cloud/v1` | API Token | `HETZNER_API_TOKEN` |
| **Sentry** | `sentry.io/api/0` | Auth Token | `SENTRY_AUTH_TOKEN` |
| **PostHog** | `app.posthog.com` | API Key / Personal Key | `POSTHOG_API_KEY` `POSTHOG_PERSONAL_API_KEY` |
| **PostHog MCP** | `mcp.posthog.com/mcp` | API Key | `POSTHOG_API_KEY` |
| **Resend** | `api.resend.com` | API Key | `RESEND_API_KEY` |
| **Slack** | `slack.com/api` | Bot Token (xoxp) | `SLACK_BOT_TOKEN` |
| **Slack Webhook** | `hooks.slack.com/...` | URL 即憑證 | `SLACK_WEBHOOK_URL` |
| **Netdata** | `app.netdata.cloud` | API Token | `NETDATA_API_TOKEN` |
| **OpenAI** | `api.openai.com` | API Key | `OPENAI_API_KEY` |
| **Anthropic** | `api.anthropic.com` | API Key | `ANTHROPIC_API_KEY` |
| **Gemini** | `generativelanguage.googleapis.com` | API Key | `GEMINI_API_KEY` |
| **Perplexity** | `api.perplexity.ai` | API Key | `PERPLEXITY_API_KEY` |
| **Replicate** | `api.replicate.com` | API Token | `REPLICATE_API_TOKEN` |
| **Airtable** | `api.airtable.com` | API Key | `AIRTABLE_API_KEY` |
| **Canva MCP** | `mcp.canva.com/mcp` | OAuth（無需 token） | — |

---

## MCP Server 對應表

| MCP 名稱 | 類型 | 服務 |
|---|---|---|
| `n8n` | HTTP | n8n MCP Server |
| `supabase` | HTTP | 雲端 Supabase（僅雲端專案預留；勿用於 AwareWave 自架） |
| `supabase-soulfulexpression` | HTTP | Soulful Expression Supabase |
| `supabase-awarewave-postgres` | stdio | 自架 AwareWave Supabase Postgres（需 tunnel） |
| `awarewave-ops` | stdio | 所有自架 + 雲端 REST API 統一入口 |
| `cloudflare` | HTTP | Cloudflare |
| `posthog` | HTTP | PostHog |
| `github` | stdio | GitHub |
| `resend` | stdio | Resend |
| `trigger` | stdio | Trigger.dev |
| `wordpress` | stdio | WordPress |
| `airtable` | stdio | Airtable |
| `perplexity` | stdio | Perplexity |
| `replicate` | stdio | Replicate |
| `copilot` | HTTP | GitHub Copilot |
| `canva` | stdio | Canva |
| `claude-fast/latest` | stdio | Claude Haiku / Sonnet |
| `chatgpt-fast/latest` | stdio | GPT |
| `gemini-fast/latest` | stdio | Gemini |
| `work-global` | stdio | 本機檔案系統 |

---

## SSH Tunnel 指令

```powershell
# Supabase（postgres + studio + kong）
.\scripts\open-supabase-ssh-tunnel.ps1 -Background

# Grafana
.\scripts\open-grafana-ssh-tunnel.ps1 -Background

# 關閉所有 tunnel
Get-Process ssh | Stop-Process
```

---

## 實際密鑰備份位置

| 位置 | 內容 |
|---|---|
| `mcp/user-env.ps1` | **主檔**，所有明文 key（gitignored，只在本機） |
| `C:\Users\user1115\.claude\projects\d--Work\memory\reference_vps_access.md` | VPS 密碼、JWT keys、SSH 指令 |
| Windows Registry（`setx` 寫入） | 所有 env vars，開機後自動載入 |

> **備份建議**：定期將 `mcp/user-env.ps1` 複製到 Google Drive 或 1Password Secure Note。

---

_建立：2026-04-22_
