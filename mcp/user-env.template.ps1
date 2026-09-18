<#
.SYNOPSIS
  Example user-level environment bootstrap for MCP clients.

.DESCRIPTION
  Copy this file to a machine-local path outside git, fill in your real values,
  and run it once in a PowerShell session. The final setx calls persist the
  variables for future shells on that machine.
#>

$vars = @{
    COPILOT_MCP_BEARER_TOKEN     = "github_pat_xxx"
    GITHUB_PERSONAL_ACCESS_TOKEN = "github_pat_xxx"
    AIRTABLE_API_KEY             = "pat_xxx"
    REPLICATE_API_TOKEN          = "r8_xxx"
    REPLICATE_WEBHOOK_SIGNING_KEY = ""
    PERPLEXITY_API_KEY           = "pplx_xxx"
    RESEND_API_KEY               = "re_xxx"
    RESEND_SENDER_EMAIL_ADDRESS  = "ops@example.com"
    RESEND_REPLY_TO_EMAIL_ADDRESSES = "ops@example.com"
    WP_API_URL                   = "https://example.com/"
    WORDPRESS_JWT_TOKEN          = "jwt-token-only"
    # n8n MCP URL（shared registry 會同步到 Cursor/Codex/Copilot/Gemini/Claude）
    # Subdomain root: …/mcp-server/http. Apex path /n8n/: …/n8n/mcp-server/http — see hetzner-phase1-core/.env.example Pattern A/B.
    N8N_MCP_URL                  = "https://n8n.aware-wave.com/mcp-server/http"
    N8N_AUTH_BEARER_TOKEN        = "..."
    N8N_API_BASE_URL             = "https://your-n8n.example.com/api/v1"
    N8N_API_KEY                  = ""
    N8N_BASIC_AUTH_USER          = ""
    N8N_BASIC_AUTH_PASSWORD      = ""
    TRIGGER_API_URL              = "https://trigger.example.com"
    TRIGGER_PROJECT_REF          = "prj_xxx"
    TRIGGER_ACCESS_TOKEN         = "tr_xxx"
    # DEPRECATED: self-hosted Supabase has no /mcp endpoint. supabase MCP entry is disabled in registry.
    # Use awarewave-ops (REST) or supabase-awarewave-postgres (SQL via tunnel) instead.
    # SUPABASE_MCP_URL           = ""   # unused
    # SUPABASE_AUTH_BEARER_TOKEN = ""   # unused
    SUPABASE_AWAREWAVE_URL       = "https://supabase.aware-wave.com"
    SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY = "..."
    # SQL MCP：`supabase-awarewave-postgres` — 經 **`open-supabase-ssh-tunnel.ps1`** 時，EU 對外 `:5432` 多為 **Supavisor**。DSN **使用者名** 通常為 **`postgres.<POOLER_TENANT_ID>`**（與 VPS **`/root/supabase/.env`** 的 **`POOLER_TENANT_ID`** 一致）；見 **`docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md` §3.3**。
    SUPABASE_AWAREWAVE_POSTGRES_DSN = "postgresql://postgres.<POOLER_TENANT_ID>:<PASTE_POSTGRES_PASSWORD>@127.0.0.1:5432/postgres"
    # Optional: npm run apply:supabase-splinter-fixes — use supabase_admin when pooler/postgres cannot REPLACE functions owned by supabase_admin (see SUPABASE_SELF_HOSTED_RUNBOOK §3.4).
    # SUPABASE_SPLINTER_FIX_DSN = "postgresql://supabase_admin:<PASTE_POSTGRES_PASSWORD>@127.0.0.1:5432/postgres"
    # Optional: set to "true" to use READ ONLY transactions in Postgres MCP (default = full SQL).
    POSTGRES_MCP_READ_ONLY         = ""
    SUPABASE_SOULFULEXPRESSION_URL = "https://your-soulfulexpression-project.supabase.co"
    SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY = "..."
    # Legacy aliases retained for backward compatibility during migration:
    SUPABASE_B_URL               = "https://supabase.aware-wave.com"
    SUPABASE_B_SERVICE_ROLE_KEY  = "..."
    # 同上預設形狀（Supavisor + POOLER_TENANT_ID）。
    SUPABASE_B_POSTGRES_DSN      = "postgresql://postgres.<POOLER_TENANT_ID>:<PASTE_POSTGRES_PASSWORD>@127.0.0.1:5432/postgres"
    SUPABASE_A_MCP_URL           = "https://mcp.supabase.com/mcp?project_ref=YOUR_SOULFULEXPRESSION_PROJECT_REF&features=database,docs,development,debugging"
    SUPABASE_A_AUTH_BEARER_TOKEN = "..."
    SUPABASE_A_URL               = "https://your-soulfulexpression-project.supabase.co"
    SUPABASE_A_SERVICE_ROLE_KEY  = "..."
    CLOUDFLARE_MCP_URL           = "https://mcp.cloudflare.com/mcp"
    CLOUDFLARE_AUTH_BEARER_TOKEN = ""
    CLOUDFLARE_API_TOKEN         = ""
    CLOUDFLARE_API_BASE_URL      = "https://api.cloudflare.com/client/v4"
    POSTHOG_MCP_URL              = "https://mcp.posthog.com/mcp"
    POSTHOG_API_KEY              = ""
    POSTHOG_PERSONAL_API_KEY     = ""
    POSTHOG_API_BASE_URL         = "https://app.posthog.com/api"
    OPENAI_API_KEY               = "sk-..."
    XAI_API_KEY                  = "xai-..."
    GROK_MODEL                   = "grok-4.20-reasoning"
    ANTHROPIC_API_KEY            = "sk-ant-..."
    GEMINI_API_KEY               = "AIza..."
    HETZNER_API_BASE_URL         = "https://api.hetzner.cloud/v1"
    HETZNER_API_TOKEN            = ""
    # Hostinger SSH — Soulful Expression (soulfulexpression.org)
    # hetzner-ssh MCP passes these at runtime via ssh_connect; stored here for documentation only
    HOSTINGER_SOULFUL_SSH_HOST   = "191.101.230.176"
    HOSTINGER_SOULFUL_SSH_PORT   = "65002"
    HOSTINGER_SOULFUL_SSH_USER   = "u942075013"
    # Private key path (machine-local): C:\Users\<you>\.ssh\hostinger_soulful
    #
    # Which back end check-smoke-tests.ps1 queries for the soulful mail check.
    # "hostinger"  = live site on Hostinger shared hosting, via `wp db query`  (pre-cutover)
    # "ks-aw-01"   = container on 145.239.195.47, via `docker exec soulful-db`  (post-cutover)
    # Flip this ON CUTOVER DAY. It must live here rather than being a session-scoped
    # $env: assignment, because AO-RESUME spawns check-smoke-tests.ps1 in a child process
    # that would never see one. Any value other than the two above is now a LOUD
    # warn:unknown_profile, not a silent fall back to Hostinger — after cutover the
    # Hostinger path still returns real-looking rows from the decommissioned host.
    SOULFUL_DB_PROFILE           = "hostinger"
    UPTIME_KUMA_BASE_URL         = "https://uptime.aware-wave.com"
    UPTIME_KUMA_API_KEY          = ""
    # SSH tunnel required: .\scripts\open-grafana-ssh-tunnel.ps1 -Background
    GRAFANA_BASE_URL             = "http://localhost:3009"
    GRAFANA_SERVICE_ACCOUNT_TOKEN = ""
    GRAFANA_BASIC_USER           = ""
    GRAFANA_BASIC_PASSWORD       = ""
    # app.aware-wave.com + studio.aware-wave.com nginx auth_basic (htpasswd_studio).
    # Used by Playwright smoke spec smoke/04-onboard-page.spec.ts.
    # Fill from AWARE_WAVE_CREDENTIALS.md §三.
    OPS_BASIC_USER               = ""
    OPS_BASIC_PASSWORD           = ""
    NETDATA_BASE_URL             = "https://app.netdata.cloud"
    NETDATA_API_TOKEN            = ""
    SLACK_API_BASE_URL           = "https://slack.com/api"
    SLACK_BOT_TOKEN              = ""
    SLACK_WEBHOOK_URL            = ""
    SENTRY_API_BASE_URL          = "https://sentry.io/api/0"
    SENTRY_AUTH_TOKEN            = ""
    API_AWAREWAVE_BASE_URL       = "https://api.aware-wave.com"
    API_AWAREWAVE_BEARER_TOKEN   = ""
    APP_AWAREWAVE_BASE_URL       = "https://app.aware-wave.com"
    APP_AWAREWAVE_BEARER_TOKEN   = ""
    # Always-On Command Plane (Telegram ingress + kill switch).
    # See agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md and TELEGRAM_COMMAND_POLICY.md.
    TELEGRAM_BOT_TOKEN           = ""   # from BotFather /newbot
    TELEGRAM_WEBHOOK_SECRET      = ""   # random 32+ bytes; pass to setWebhook secret_token
    TELEGRAM_ALLOWED_USER_IDS    = ""   # csv of numeric user ids permitted to issue commands
    TELEGRAM_ALLOWED_CHAT_IDS    = ""   # csv of numeric chat ids the bot listens on
    COMMAND_PLANE_DEFAULT_ORG_ID = ""   # uuid of organizations row representing the operator
    COMMAND_PLANE_DEFAULT_WORKSPACE_ID = ""  # optional uuid; null lets routes work org-wide
    # Cognitive OS bridge (next-admin lib/cognitive-os/ -> cognitive-os-api). Service-account
    # tenant/identity created by ai_lego/apps/cli/bootstrap_service_identity.py -- NOT the human
    # operator's own Phase 1 login tenant. See docker-compose.yml (hetzner-phase1-core) for how
    # these reach the deployed next-admin container.
    COGNITIVE_OS_TENANT_ID       = ""
    COGNITIVE_OS_SERVICE_EMAIL   = ""
    COGNITIVE_OS_SERVICE_PASSWORD = ""
    # Bearer token for POST /api/internal/cognitive-os/import-project-sources — own dedicated
    # token, never shared with an unrelated internal-route caller.
    COGNITIVE_OS_IMPORT_INGEST_TOKEN = ""
    # HCI-30 (ADR-0021 gate 3): hci-postgres's own dedicated secret, distinct from the shared
    # ${POSTGRES_PASSWORD} every Supabase-instance service already reuses — never the same vault
    # entry as that one. See docker-compose.yml (hetzner-phase1-core) hci-postgres/hci-app blocks.
    HCI_DB_PASSWORD              = ""
    # HCI-30's isolated fetch-runner stack (ADR-0029) — its own generated secret/credentials, never
    # reused from any other service's MinIO or shared-secret values.
    HCI_FETCH_RUNNER_SHARED_SECRET       = ""
    HCI_FETCH_RUNNER_MINIO_ROOT_USER     = ""
    HCI_FETCH_RUNNER_MINIO_ROOT_PASSWORD = ""
}

foreach ($entry in $vars.GetEnumerator()) {
    $name = $entry.Key
    $value = [string]$entry.Value
    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-Host "Skip empty $name" -ForegroundColor Yellow
        continue
    }

    Set-Item -Path ("Env:\" + $name) -Value $value
    setx $name $value | Out-Null
    Write-Host "Persisted $name" -ForegroundColor Green
}

Write-Host ""
Write-Host "Open a new terminal after running this script so all CLIs inherit the updated environment." -ForegroundColor Cyan
