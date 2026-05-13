#requires -Version 5.1
<#
.SYNOPSIS
  One-shot Always-On Command Plane setup (client side).

.DESCRIPTION
  Walks the operator through:
    1. Storing Telegram secrets in the local DPAPI vault
    2. Syncing them to Windows user environment variables
    3. Calling Telegram setWebhook + setMyCommands

  Server-side deployment (migration + env injection + container rebuild) is a
  separate step — see agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md §10.

.PARAMETER BotToken
  Token from BotFather, format `123456789:ABC-DEF...`.
.PARAMETER UserId
  Your Telegram numeric user_id (find via @userinfobot).
.PARAMETER ChatId
  Optional. Defaults to UserId (private chat).
.PARAMETER OrgId
  UUID of the organizations row that represents you (Supabase). Required.
.PARAMETER WorkspaceId
  Optional UUID of a workspaces row.
.PARAMETER BaseUrl
  Public origin of next-admin, default https://app.aware-wave.com.
.PARAMETER SkipWebhook
  Set to skip the setWebhook call (use when next-admin is not yet deployed).

.EXAMPLE
  .\scripts\setup-command-plane.ps1 `
    -BotToken '123456789:ABC-DEF...' `
    -UserId  '12345678' `
    -OrgId   '39ad4149-5044-4077-8d9a-b6b916de0e21'
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $BotToken,
  [Parameter(Mandatory = $true)] [string] $UserId,
  [string] $ChatId,
  [Parameter(Mandatory = $true)] [string] $OrgId,
  [string] $WorkspaceId = "",
  [string] $BaseUrl = "https://app.aware-wave.com",
  [switch] $SkipWebhook,
  # Force regeneration of TELEGRAM_WEBHOOK_SECRET even if one already exists.
  # Use ONLY when you also rebuild and redeploy next-admin in the same operation,
  # otherwise Telegram and the server will have mismatched secrets.
  [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ChatId)) { $ChatId = $UserId }

$repoRoot   = Split-Path -Parent $PSScriptRoot
$vault      = Join-Path $PSScriptRoot 'secrets-vault.ps1'
$webhook    = Join-Path $PSScriptRoot 'configure-telegram-webhook.ps1'
if (-not (Test-Path $vault))   { throw "secrets-vault.ps1 not found at $vault" }

# 1) Webhook secret: reuse existing vault value to prevent secret drift.
#    A new secret is only generated if one has never been stored before.
#    REASON: every regeneration causes Telegram→server secret mismatch until
#    the server is rebuilt — the most common cause of "working then broken".
Write-Host ""
Write-Host "Step 1/3: writing secrets to local DPAPI vault..." -ForegroundColor Cyan

$existingSecret = & $vault -Action get -Name TELEGRAM_WEBHOOK_SECRET 2>$null
if (-not [string]::IsNullOrWhiteSpace($existingSecret) -and -not $Force) {
  $secret = $existingSecret.Trim()
  Write-Host "  [reuse] TELEGRAM_WEBHOOK_SECRET already in vault — keeping existing value." -ForegroundColor DarkGray
  Write-Host "          (Pass -Force to regenerate; also requires server rebuild + redeploy.)" -ForegroundColor DarkGray
} else {
  if ($Force -and -not [string]::IsNullOrWhiteSpace($existingSecret)) {
    Write-Host "  [force] Regenerating TELEGRAM_WEBHOOK_SECRET (-Force specified)." -ForegroundColor Yellow
    Write-Host "  [WARN]  You MUST rebuild + redeploy next-admin after this, or Telegram" -ForegroundColor Yellow
    Write-Host "          and the server will have mismatched secrets (silent failure)." -ForegroundColor Yellow
  }
  $rand   = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rand)
  $secret = [Convert]::ToBase64String($rand)
  Write-Host "  [new]   Generated fresh TELEGRAM_WEBHOOK_SECRET." -ForegroundColor Cyan
}

& $vault -Action set -Name TELEGRAM_BOT_TOKEN              -Value $BotToken
& $vault -Action set -Name TELEGRAM_WEBHOOK_SECRET         -Value $secret
& $vault -Action set -Name TELEGRAM_ALLOWED_USER_IDS       -Value $UserId
& $vault -Action set -Name TELEGRAM_ALLOWED_CHAT_IDS       -Value $ChatId
& $vault -Action set -Name COMMAND_PLANE_DEFAULT_ORG_ID    -Value $OrgId
if (-not [string]::IsNullOrWhiteSpace($WorkspaceId)) {
  & $vault -Action set -Name COMMAND_PLANE_DEFAULT_WORKSPACE_ID -Value $WorkspaceId
}

# 2) Push to Windows user environment so next shell + child processes inherit them.
Write-Host ""
Write-Host "Step 2/3: syncing vault -> Windows user environment..." -ForegroundColor Cyan
& $vault -Action sync-cursor-mcp-user-env

# Also set in current process so the webhook call below works without restart.
$env:TELEGRAM_BOT_TOKEN              = $BotToken
$env:TELEGRAM_WEBHOOK_SECRET         = $secret
$env:TELEGRAM_ALLOWED_USER_IDS       = $UserId
$env:TELEGRAM_ALLOWED_CHAT_IDS       = $ChatId
$env:COMMAND_PLANE_DEFAULT_ORG_ID    = $OrgId
if (-not [string]::IsNullOrWhiteSpace($WorkspaceId)) {
  $env:COMMAND_PLANE_DEFAULT_WORKSPACE_ID = $WorkspaceId
}

# 3) Call Telegram setWebhook + setMyCommands.
if ($SkipWebhook) {
  Write-Host ""
  Write-Host "Step 3/3: SKIPPED (-SkipWebhook). Run scripts\configure-telegram-webhook.ps1 once next-admin is deployed." -ForegroundColor Yellow
} else {
  if (-not (Test-Path $webhook)) { throw "configure-telegram-webhook.ps1 not found at $webhook" }
  Write-Host ""
  Write-Host "Step 3/3: registering Telegram webhook..." -ForegroundColor Cyan
  & $webhook -BaseUrl $BaseUrl
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Client-side setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "Server-side TODO (do these once on $BaseUrl host):" -ForegroundColor Yellow
Write-Host "  1) Apply migration (if not already applied):"
Write-Host "       lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql"
Write-Host "  2) Add these lines to .env on the server (all now in docker-compose.yml):"
Write-Host "       TELEGRAM_BOT_TOKEN=$BotToken"
Write-Host "       TELEGRAM_WEBHOOK_SECRET=<vault value — run: .\scripts\secrets-vault.ps1 -Action get -Name TELEGRAM_WEBHOOK_SECRET>"
Write-Host "       TELEGRAM_ALLOWED_USER_IDS=$UserId"
Write-Host "       TELEGRAM_ALLOWED_CHAT_IDS=$ChatId"
Write-Host "       COMMAND_PLANE_DEFAULT_ORG_ID=$OrgId"
Write-Host "       ANTHROPIC_API_KEY=<your Anthropic key>"
Write-Host "  3) Rebuild + restart:"
Write-Host "       cd /root/lobster-phase1 && docker compose --env-file .env up -d --build next-admin"
Write-Host "  4) Verify (URL + recent errors):"
Write-Host "       .\scripts\configure-telegram-webhook.ps1 -Verify"
Write-Host "  5) Full smoke test:"
Write-Host "       .\scripts\command-plane-smoke.ps1 -BaseUrl https://app.aware-wave.com ..."
Write-Host "==========================================================" -ForegroundColor Green
