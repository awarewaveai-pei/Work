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
    WP_API_URL                   = "https://example.com/"
    WORDPRESS_JWT_TOKEN          = "app-password-or-jwt"
    N8N_MCP_URL                  = "https://your-n8n.example.com/mcp-server/http"
    N8N_AUTH_BEARER_TOKEN        = "..."
    TRIGGER_API_URL              = "https://trigger.example.com"
    TRIGGER_PROJECT_REF          = "prj_xxx"
    SUPABASE_MCP_URL             = "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&features=database,docs,development,debugging"
    SUPABASE_AUTH_BEARER_TOKEN   = "..."
    CLOUDFLARE_MCP_URL           = "https://mcp.cloudflare.com/mcp"
    CLOUDFLARE_AUTH_BEARER_TOKEN = ""
    POSTHOG_MCP_URL              = "https://mcp.posthog.com/mcp"
    POSTHOG_API_KEY              = ""
    OPENAI_API_KEY               = "sk-..."
    ANTHROPIC_API_KEY            = "sk-ant-..."
    GEMINI_API_KEY               = "AIza..."
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
