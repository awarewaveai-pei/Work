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
  [switch] $SkipWebhook
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ChatId)) { $ChatId = $UserId }

$repoRoot   = Split-Path -Parent $PSScriptRoot
$vault      = Join-Path $PSScriptRoot 'secrets-vault.ps1'
$webhook    = Join-Path $PSScriptRoot 'configure-telegram-webhook.ps1'
if (-not (Test-Path $vault))   { throw "secrets-vault.ps1 not found at $vault" }

# 1) Generate the webhook secret (32 random bytes -> base64).
$rand   = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rand)
$secret = [Convert]::ToBase64String($rand)

Write-Host ""
Write-Host "Step 1/3: writing secrets to local DPAPI vault..." -ForegroundColor Cyan

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
Write-Host "  1) apply lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql"
Write-Host "  2) inject these env vars into the next-admin container:"
Write-Host "       TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,"
Write-Host "       TELEGRAM_ALLOWED_USER_IDS, TELEGRAM_ALLOWED_CHAT_IDS,"
Write-Host "       COMMAND_PLANE_DEFAULT_ORG_ID, ANTHROPIC_API_KEY"
Write-Host "  3) rebuild + restart next-admin: docker compose up -d --build next-admin"
Write-Host "  4) verify: scripts\command-plane-smoke.ps1"
Write-Host "==========================================================" -ForegroundColor Green
