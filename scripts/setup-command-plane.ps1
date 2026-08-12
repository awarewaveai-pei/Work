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

# Validate OPERATOR INPUT before anything is written. `-Action set` overwrites the
# DPAPI store with no backup (secrets-vault.ps1 Write-Store), and Step 2 then
# propagates it machine-wide, so a masked paste here is irreversible credential
# destruction. Several runbooks used to tell operators to obtain values by running
# `secrets-vault.ps1 -Action get`, whose output is masked - this is the guard for
# exactly that paste.
. (Join-Path $PSScriptRoot '_vault-helpers.ps1')
$BotToken = "$BotToken".Trim()
$UserId   = "$UserId".Trim()
$ChatId   = "$ChatId".Trim()
$OrgId    = "$OrgId".Trim()
if (-not [string]::IsNullOrWhiteSpace($WorkspaceId)) { $WorkspaceId = "$WorkspaceId".Trim() }

foreach ($p in 'BotToken', 'UserId', 'ChatId', 'OrgId') {
  $v = Get-Variable -Name $p -ValueOnly
  if (Test-VaultValueLooksMasked -Value $v) {
    throw "-$p looks MASKED (contains '*'). It came from 'secrets-vault.ps1 -Action get', which is confirm-only. Storing it would overwrite the real secret irreversibly. Use the real value from mcp\user-env.ps1 or the source system."
  }
}
if ($BotToken -notmatch '^\d+:[A-Za-z0-9_-]{30,}$') {
  throw "-BotToken does not look like a Telegram bot token (<digits>:<30+ base64url chars>). Refusing to write it to the vault."
}
if ($UserId -notmatch '^-?\d+$') { throw "-UserId must be a numeric Telegram user id." }
if ($ChatId -notmatch '^-?\d+$') { throw "-ChatId must be a numeric Telegram chat id." }
$webhook    = Join-Path $PSScriptRoot 'configure-telegram-webhook.ps1'
if (-not (Test-Path $vault))   { throw "secrets-vault.ps1 not found at $vault" }

# 1) Webhook secret: reuse existing vault value to prevent secret drift.
#    A new secret is only generated if one has never been stored before.
#    REASON: every regeneration causes Telegram→server secret mismatch until
#    the server is rebuilt — the most common cause of "working then broken".
Write-Host ""
Write-Host "Step 1/3: writing secrets to local DPAPI vault..." -ForegroundColor Cyan

# The vault is the SSOT for the real value and can be read directly.
# `secrets-vault.ps1 -Action get` must NOT be used here: it is confirm-only and
# prints "NAME=abcd****xy" (masked). Until 2026-08-12 this script took that whole
# masked line as the secret, then wrote it back with `-Action set` - the reuse
# path silently DESTROYED the real stored secret and registered the mask with
# Telegram. It also could not survive a first run, because `-Action get` throws
# when the secret is absent and `2>$null` does not catch a terminating error.
$vaultStore      = $null
$hasStoredSecret = $false
$vaultPresent    = $false
$entryPresent    = $false
try {
  $vaultStore      = Read-VaultStore (Resolve-VaultPath)
  $vaultPresent    = $true
  # Distinguish "no entry" from "entry present but undecryptable". DPAPI ciphertext
  # is bound to user+machine, so a vault copied to the second workstation has
  # entries that exist yet cannot be read there. Test-VaultSecret returns $false
  # for both cases; conflating them would silently regenerate the webhook secret on
  # machine B and re-register it with Telegram while SG still holds the old one -
  # the exact 401/silent-bot failure COMMAND_PLANE_TELEGRAM_SILENCE_RUNBOOK.md
  # exists to diagnose.
  $entryPresent    = $null -ne $vaultStore.secrets.PSObject.Properties['TELEGRAM_WEBHOOK_SECRET']
  $hasStoredSecret = Test-VaultSecret -Store $vaultStore -Name 'TELEGRAM_WEBHOOK_SECRET'
} catch {
  # No vault yet - first run on a fresh machine. Fall through and generate.
  Write-Host "  [init]  No vault found yet; a fresh secret will be generated." -ForegroundColor DarkGray
}

if ($entryPresent -and -not $hasStoredSecret) {
  throw "TELEGRAM_WEBHOOK_SECRET exists in this vault but cannot be decrypted on this machine (DPAPI is user+machine bound). Generating a new one here would silently desync Telegram from the SG server. Re-run the setup on the machine that owns the vault, or pass -Force only if you accept rebuilding + redeploying next-admin and re-registering the webhook."
}

if ($hasStoredSecret -and -not $Force) {
  $secret = "$(Get-VaultSecret -Store $vaultStore -Name 'TELEGRAM_WEBHOOK_SECRET')".Trim()
  if (Test-VaultValueLooksMasked -Value $secret) {
    throw "The stored TELEGRAM_WEBHOOK_SECRET is a MASKED value - an earlier run of this script wrote the output of 'secrets-vault -Action get' back into the vault. The real secret is lost; re-run with -Force to generate a new one, then rebuild + redeploy next-admin and re-register the webhook."
  }
  # Report drift instead of silently overwriting either side. Fingerprints only -
  # never print the values themselves.
  $envSecret = "$($env:TELEGRAM_WEBHOOK_SECRET)".Trim()
  if ($envSecret -and ($envSecret -ne $secret)) {
    Write-Host "  [drift] This machine's TELEGRAM_WEBHOOK_SECRET differs from the vault." -ForegroundColor Yellow
    Write-Host "          Using the VAULT value; Step 2 below realigns this machine." -ForegroundColor Yellow
  }
  Write-Host "  [reuse] TELEGRAM_WEBHOOK_SECRET already in vault - keeping existing value." -ForegroundColor DarkGray
  Write-Host "          (Pass -Force to regenerate; also requires server rebuild + redeploy.)" -ForegroundColor DarkGray
} else {
  if ($Force -and $hasStoredSecret) {
    Write-Host "  [force] Regenerating TELEGRAM_WEBHOOK_SECRET (-Force specified)." -ForegroundColor Yellow
  }
  # Printed on EVERY generation path, not just -Force. Any newly generated secret
  # desyncs Telegram from the server until it is redeployed; the only path where
  # that is harmless is a machine with no vault at all (nothing deployed yet).
  if ($vaultPresent) {
    Write-Host "  [WARN]  A NEW TELEGRAM_WEBHOOK_SECRET was generated. You MUST rebuild +" -ForegroundColor Yellow
    Write-Host "          redeploy next-admin, or Telegram and the server will have" -ForegroundColor Yellow
    Write-Host "          mismatched secrets (401 -> silent bot)." -ForegroundColor Yellow
  }
  $rand = New-Object byte[] 32
  $rng  = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($rand) } finally { $rng.Dispose() }
  # base64url: Telegram's setWebhook secret_token accepts only A-Z a-z 0-9 _ -
  # (core.telegram.org/bots/api#setwebhook). Standard base64 always ends in '='
  # and often contains '+' or '/', which the API rejects with 400.
  $secret = [Convert]::ToBase64String($rand).TrimEnd('=').Replace('+', '-').Replace('/', '_')
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
Write-Host "       TELEGRAM_WEBHOOK_SECRET=<real value from mcp\user-env.ps1 on this machine — NOT from 'secrets-vault -Action get', which prints a mask>"
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
