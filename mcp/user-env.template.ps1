<#
.SYNOPSIS
  Example user-level environment bootstrap for MCP clients.

.DESCRIPTION
  Copy this file to a machine-local path outside git, fill in your real values,
  and run it once in a PowerShell session. The final setx calls persist the
  variables for future shells on that machine.
#>

$vars = @{
    GITHUB_PERSONAL_ACCESS_TOKEN = "github_pat_xxx"
    AIRTABLE_API_KEY             = "pat_xxx"
    REPLICATE_API_TOKEN          = "r8_xxx"
    REPLICATE_WEBHOOK_SIGNING_KEY = ""
    PERPLEXITY_API_KEY           = "pplx_xxx"
    RESEND_API_KEY               = "re_xxx"
    RESEND_SENDER_EMAIL_ADDRESS  = "ops@example.com"
    RESEND_REPLY_TO_EMAIL_ADDRESSES = "ops@example.com"
    WP_API_URL                   = "https://example.com/"
    WORDPRESS_JWT_TOKEN          = "app-password-or-jwt"
    N8N_MCP_URL                  = "https://your-n8n.example.com/mcp-server/http"
    N8N_AUTH_BEARER_TOKEN        = "..."
    N8N_API_BASE_URL             = "https://your-n8n.example.com/api/v1"
    TRIGGER_API_URL              = "https://trigger.example.com"
    TRIGGER_PROJECT_REF          = "prj_xxx"
    TRIGGER_ACCESS_TOKEN         = "tr_xxx"
    SUPABASE_MCP_URL             = "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&features=database,docs,development,debugging"
    SUPABASE_AUTH_BEARER_TOKEN   = "..."
    SUPABASE_B_URL               = "https://your-b-company-project.supabase.co"
    SUPABASE_B_SERVICE_ROLE_KEY  = "..."
    SUPABASE_A_MCP_URL           = "https://mcp.supabase.com/mcp?project_ref=YOUR_A_PROJECT_REF&features=database,docs,development,debugging"
    SUPABASE_A_AUTH_BEARER_TOKEN = "..."
    SUPABASE_A_URL               = "https://your-a-company-project.supabase.co"
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
    ANTHROPIC_API_KEY            = "sk-ant-..."
    GEMINI_API_KEY               = "AIza..."
    HETZNER_API_BASE_URL         = "https://api.hetzner.cloud/v1"
    HETZNER_API_TOKEN            = ""
    UPTIME_KUMA_BASE_URL         = "https://uptime.aware-wave.com"
    UPTIME_KUMA_API_KEY          = ""
    GRAFANA_BASE_URL             = "https://grafana.aware-wave.com"
    GRAFANA_SERVICE_ACCOUNT_TOKEN = ""
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
