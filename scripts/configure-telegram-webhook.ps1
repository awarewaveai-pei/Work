#requires -Version 5.1
<#
.SYNOPSIS
  Register / clear the Telegram webhook for the Always-On Command Plane.

.DESCRIPTION
  Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from environment
  variables (synced from the local DPAPI vault by `vault-sync`). Sends
  setWebhook to Telegram pointing at the next-admin ingress endpoint.
  Use -Clear to remove the webhook (Telegram immediately stops sending updates).

.PARAMETER BaseUrl
  Public origin of the next-admin app, default https://app.aware-wave.com.
.PARAMETER Clear
  If set, calls deleteWebhook instead of setWebhook.

.NOTES
  Pre-requisite — secrets must already be in the vault:
    .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_BOT_TOKEN -Value '...'
    .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_WEBHOOK_SECRET -Value '<random32>'
    .\scripts\secrets-vault.ps1 -Action sync-mcp-user-env  # or run /vault-sync

  Then run:
    .\scripts\configure-telegram-webhook.ps1
#>

[CmdletBinding()]
param(
  [string] $BaseUrl = 'https://app.aware-wave.com',
  [switch] $Clear,
  # Print current webhook info from Telegram (getWebhookInfo) + compare with expected URL.
  # Use after any deploy or "bot not responding" incident for instant diagnosis.
  [switch] $Verify
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$token = $env:TELEGRAM_BOT_TOKEN
$secret = $env:TELEGRAM_WEBHOOK_SECRET

if ([string]::IsNullOrWhiteSpace($token)) {
  throw @"
TELEGRAM_BOT_TOKEN is not set in this shell.

From monorepo root:
  1) Set the secret:
       .\scripts\secrets-vault.ps1 -Action set -Name TELEGRAM_BOT_TOKEN -Value '<paste from BotFather>'
  2) Sync vault to user environment:
       .\scripts\secrets-vault.ps1 -Action sync-mcp-user-env
  3) Open a NEW PowerShell session (env vars only refresh on shell start).
  4) Re-run this script.
"@
}

if (-not $Clear -and [string]::IsNullOrWhiteSpace($secret)) {
  throw "TELEGRAM_WEBHOOK_SECRET is not set. See script docstring."
}

if ($Verify) {
  $info = Invoke-RestMethod -Method GET -Uri "https://api.telegram.org/bot$token/getWebhookInfo"
  $expected = ($BaseUrl.TrimEnd('/')) + '/api/internal/commands/telegram'
  $current  = $info.result.url
  $urlMatch  = ($current -eq $expected)
  $pending   = $info.result.pending_update_count
  $lastErr   = if ($info.result.PSObject.Properties.Name -contains 'last_error_message') { $info.result.last_error_message } else { $null }
  $lastErrAt = if ($info.result.PSObject.Properties.Name -contains 'last_error_date')    { $info.result.last_error_date    } else { $null }
  Write-Host ""
  Write-Host "── Telegram Webhook Diagnostic ─────────────────────────────" -ForegroundColor Cyan
  Write-Host "  Expected URL : $expected"
  Write-Host "  Current URL  : $current"
  if ($urlMatch) {
    Write-Host "  URL match    : OK" -ForegroundColor Green
  } else {
    Write-Host "  URL match    : MISMATCH — re-run without -Verify to fix" -ForegroundColor Red
  }
  Write-Host "  Pending msgs : $pending"
  if ($lastErr) {
    $errTime = if ($lastErrAt) { [DateTimeOffset]::FromUnixTimeSeconds($lastErrAt).ToString('yyyy-MM-dd HH:mm:ssZ') } else { '?' }
    Write-Host "  Last error   : $lastErr (at $errTime)" -ForegroundColor Yellow
  } else {
    Write-Host "  Last error   : none" -ForegroundColor Green
  }
  Write-Host ""
  Write-Host "  NOTE: Telegram cannot expose whether the secret_token matches." -ForegroundColor DarkGray
  Write-Host "  If bot is silent but URL is correct, the server's TELEGRAM_WEBHOOK_SECRET" -ForegroundColor DarkGray
  Write-Host "  may not match the vault value. Fix: ensure server .env has the vault value" -ForegroundColor DarkGray
  Write-Host "  then rebuild: docker compose --env-file .env up -d --build next-admin" -ForegroundColor DarkGray
  Write-Host "────────────────────────────────────────────────────────────" -ForegroundColor Cyan
  exit 0
}

if ($Clear) {
  $resp = Invoke-RestMethod -Method POST `
    -Uri "https://api.telegram.org/bot$token/deleteWebhook" `
    -Body @{ drop_pending_updates = 'true' } `
    -ContentType 'application/x-www-form-urlencoded'
  Write-Host "deleteWebhook -> ok=$($resp.ok), description=$($resp.description)"
  exit 0
}

$webhookUrl = ($BaseUrl.TrimEnd('/')) + '/api/internal/commands/telegram'

$body = @{
  url                  = $webhookUrl
  secret_token         = $secret
  drop_pending_updates = 'true'
  allowed_updates      = (@('message') | ConvertTo-Json -Compress)
}

$resp = Invoke-RestMethod -Method POST `
  -Uri "https://api.telegram.org/bot$token/setWebhook" `
  -Body $body -ContentType 'application/x-www-form-urlencoded'

Write-Host "setWebhook -> ok=$($resp.ok)  description=$($resp.description)  url=$webhookUrl"

# Register the slash-menu Telegram shows when typing '/'.
# Telegram only accepts [a-z0-9_] for command names — no hyphens.
$commands = @(
  @{ command = 'status'           ; description = 'System status: mode + recent commands + open incidents' },
  @{ command = 'health'           ; description = 'Open incidents + 24h error counts' },
  @{ command = 'daily_review'     ; description = 'AI summary of last 24h activity' },
  @{ command = 'weekly_review'    ; description = 'AI summary of last 7 days activity' },
  @{ command = 'list_failed_runs' ; description = 'Recent failed command_requests + workflow_runs' },
  @{ command = 'client_status'    ; description = 'Health + WP update status for clients with a site (first 30), or /client_status <slug>' },
  @{ command = 'deploy_status'    ; description = 'SG deploy events + drift (read-only; deploy via GitHub app -> SG Deploy)' },
  # Kill-switch commands stay executable when typed manually, but are hidden
  # from Telegram's slash menu to reduce accidental taps.
  @{ command = 'trigger_staging_workflow' ; description = 'Kick off allowlisted Trigger.dev task (e.g. ao-infrastructure-check)' },
  @{ command = 'replay_dead_letter'       ; description = 'Diagnostic lookup of error_event by uuid' }
)
$cmdResp = Invoke-RestMethod -Method POST `
  -Uri "https://api.telegram.org/bot$token/setMyCommands" `
  -Body @{ commands = ($commands | ConvertTo-Json -Compress) } `
  -ContentType 'application/x-www-form-urlencoded'
Write-Host "setMyCommands -> ok=$($cmdResp.ok)"

Write-Host ""
Write-Host "Webhook is live. Test by sending '/status' to your bot in Telegram." -ForegroundColor Green
