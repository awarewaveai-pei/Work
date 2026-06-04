---
name: reference_aware_wave_credentials
description: Where to find all API keys and credentials — check here before ever asking the user
metadata: 
  node_type: memory
  type: reference
  originSessionId: ac7d845c-d72c-46c1-9698-715335da8257
---

# Credential Locations — ALWAYS check before asking

**NEVER ask the user for an API key or password.** Read the file below first.

## Primary SSOT per machine

| 機器 | 路徑 |
|------|------|
| 公司桌機 | `C:\Users\USER\Work\mcp\user-env.ps1` |
| 筆電 | `D:\Users\USER1115\Work\mcp\user-env.ps1` |

Both files are PowerShell hashtables with identical keys. Read whichever exists in the current session.

## Keys available in user-env.ps1

- RESEND_API_KEY
- CLOUDFLARE_API_TOKEN / CLOUDFLARE_AUTH_BEARER_TOKEN
- POSTHOG_PERSONAL_API_KEY
- HETZNER_API_TOKEN (may be empty — pull from Hetzner Cloud console if so)
- GRAFANA_SERVICE_ACCOUNT_TOKEN / GRAFANA_BASIC_USER / GRAFANA_BASIC_PASSWORD
- OPS_BASIC_USER / OPS_BASIC_PASSWORD (nginx auth_basic for app.aware-wave.com)
- NETDATA_API_TOKEN
- SLACK_BOT_TOKEN / SLACK_WEBHOOK_URL / AGENCY_OS_SLACK_WEBHOOK_URL
- SENTRY_AUTH_TOKEN
- API_AWAREWAVE_BEARER_TOKEN / SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY
- SUPABASE_AWAREWAVE_POSTGRES_DSN
- N8N_AUTH_BEARER_TOKEN / N8N_API_KEY / N8N_BASIC_AUTH_USER / N8N_BASIC_AUTH_PASSWORD
- TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET / TELEGRAM_ALLOWED_USER_IDS
- UPTIME_KUMA_API_KEY / KUMA_HEARTBEAT_SG_ENDPOINT_ALERT
- TRIGGER_ACCESS_TOKEN (may be empty) / TRIGGER_PROJECT_REF
- WORDPRESS_JWT_TOKEN
- GITHUB_PERSONAL_ACCESS_TOKEN / COPILOT_MCP_BEARER_TOKEN
- OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / PERPLEXITY_API_KEY / XAI_API_KEY
- AIRTABLE_API_KEY
- REPLICATE_API_TOKEN / REPLICATE_WEBHOOK_SIGNING_KEY
- COMMAND_PLANE_DEFAULT_ORG_ID

## Secondary

`AWARE_WAVE_CREDENTIALS.md` on Desktop — master human-readable inventory.
Note: §24 has an EU/SG server mistake awaiting fix.
