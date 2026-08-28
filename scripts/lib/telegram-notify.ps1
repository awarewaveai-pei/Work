#requires -Version 5.1
<#
.SYNOPSIS
  Shared Telegram notifier for ops scripts.

.DESCRIPTION
  Why this exists (2026-08-12): `ao-resume.ps1` (monthly review) and
  `phase4-weekly-check.ps1` both built their Telegram call by parsing
  `secrets-vault.ps1 -Action get -Name TELEGRAM_BOT_TOKEN`. That CLI action is
  CONFIRM-ONLY - it prints `NAME=8584****pI`, a MASKED value (see Mask-Value in
  secrets-vault.ps1). Both scripts posted to
  `https://api.telegram.org/bot<masked>/sendMessage`, Telegram answered
  `404 Not Found`, and each script swallowed it into a yellow WARN line. Slack
  kept working (it reads `$env:` via notify-ops.ps1), so the operator saw Slack
  alerts and silently received nothing on the phone for weeks.

  Secret resolution order (both sources hold REAL values):
    1. process environment - already populated in a normal shell
    2. the DPAPI vault, read via _vault-helpers.ps1 (no side effects)

  It deliberately does NOT dot-source `mcp/user-env.ps1`: that file runs `setx`
  for every key it defines, which persists ~72 User-level environment variables
  machine-wide and can overwrite values that `secrets-vault.ps1
  -Action sync-mcp-user-env` just synced from the vault - i.e. it would
  re-create the very credential-drift class this fix exists to remove.

  Guards: a value that still looks masked, or does not match the documented
  Telegram format, is refused loudly instead of being sent.

.EXAMPLE
  . (Join-Path $WorkRoot 'scripts\lib\telegram-notify.ps1')
  $r = Send-OpsTelegram -Text "..." -WorkRoot $WorkRoot
  if (-not $r.Sent) { Write-Host "WARN: $($r.Reason)" }
#>

Set-StrictMode -Version Latest

# Vault read helpers + the shared masked-value predicate live in one place.
# Loaded UNCONDITIONALLY and on purpose: if this were best-effort, a missing lib
# would leave Test-VaultValueLooksMasked undefined, and under a caller running
# $ErrorActionPreference='SilentlyContinue' (phase4-weekly-check.ps1) the masked
# guard below would evaluate to $false and FAIL OPEN - sending with whatever
# credential it was handed. Failing fast here is caught by both callers' try/catch
# and degrades to "no notification", never to "unguarded notification".
$script:OpsVaultLib = Join-Path (Split-Path -Parent $PSScriptRoot) '_vault-helpers.ps1'
if (-not (Test-Path -LiteralPath $script:OpsVaultLib)) {
    throw "telegram-notify.ps1 requires scripts\_vault-helpers.ps1 (not found at $script:OpsVaultLib)"
}
. $script:OpsVaultLib
if (-not (Get-Command Test-VaultValueLooksMasked -ErrorAction SilentlyContinue)) {
    throw "scripts\_vault-helpers.ps1 loaded but Test-VaultValueLooksMasked is undefined - refusing to run with the masked-credential guard disabled."
}

function Get-OpsTelegramCredential {
    param([string]$WorkRoot)

    $token = "$($env:TELEGRAM_BOT_TOKEN)".Trim()
    $chats = "$($env:TELEGRAM_ALLOWED_CHAT_IDS)".Trim()

    if ((-not $token) -or (-not $chats)) {
        # Read real values straight from the vault. Failure here is non-fatal:
        # the caller reports a Reason instead of throwing, so a notifier problem
        # can never abort the script that is merely trying to notify.
        try {
            if (Get-Command Read-VaultStore -ErrorAction SilentlyContinue) {
                $store = Read-VaultStore (Resolve-VaultPath)
                if (-not $token) { $token = "$(Get-VaultSecret -Store $store -Name 'TELEGRAM_BOT_TOKEN' -AllowMissing)".Trim() }
                if (-not $chats) { $chats = "$(Get-VaultSecret -Store $store -Name 'TELEGRAM_ALLOWED_CHAT_IDS' -AllowMissing)".Trim() }
            }
        } catch {
            # Swallow deliberately: reported through the Reason field below.
        }
    }

    $chatId = $null
    if ($chats) { $chatId = ($chats -split ',')[0].Trim() }

    return [pscustomobject]@{
        Token  = $token
        ChatId = $chatId
    }
}

function Send-OpsTelegram {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$WorkRoot
    )

    $cred = Get-OpsTelegramCredential -WorkRoot $WorkRoot

    if (-not $cred.Token) {
        return [pscustomobject]@{ Sent = $false; Reason = 'TELEGRAM_BOT_TOKEN not found in environment or vault' }
    }
    if (-not $cred.ChatId) {
        return [pscustomobject]@{ Sent = $false; Reason = 'TELEGRAM_ALLOWED_CHAT_IDS not found in environment or vault' }
    }
    # The exact defect this helper exists to make impossible.
    if ((Test-VaultValueLooksMasked -Value $cred.Token) -or (Test-VaultValueLooksMasked -Value $cred.ChatId)) {
        return [pscustomobject]@{ Sent = $false; Reason = "credential looks MASKED (contains '*') - it came from 'secrets-vault -Action get', which is confirm-only. Real values live in the environment or the vault." }
    }
    # Positive format checks - strictly stronger than "contains no asterisk".
    if ($cred.Token -notmatch '^\d+:[A-Za-z0-9_-]{30,}$') {
        return [pscustomobject]@{ Sent = $false; Reason = 'TELEGRAM_BOT_TOKEN does not match the documented format <digits>:<30+ base64url chars>' }
    }
    if ($cred.ChatId -notmatch '^-?\d+$') {
        # Report shape only. This branch fires precisely when the value is not what
        # we expect - including a bot token mis-set into TELEGRAM_ALLOWED_CHAT_IDS -
        # and this Reason is written to ao-resume's on-disk log.
        return [pscustomobject]@{ Sent = $false; Reason = "TELEGRAM_ALLOWED_CHAT_IDS first entry is not a numeric chat id (length=$($cred.ChatId.Length))" }
    }

    # PS 5.1's ConvertTo-Json emits literal CJK rather than \uXXXX escapes, so the
    # body must be handed over as UTF-8 bytes or Chinese text arrives mangled.
    $body = @{ chat_id = $cred.ChatId; text = $Text } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$($cred.Token)/sendMessage" `
            -ContentType 'application/json; charset=utf-8' `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
            -TimeoutSec 20 -ErrorAction Stop
        # HTTP 200 with ok=false is a real failure; do not report it as delivered.
        if ($resp -and ($resp.PSObject.Properties.Name -contains 'ok') -and (-not $resp.ok)) {
            $desc = if ($resp.PSObject.Properties.Name -contains 'description') { $resp.description } else { '(no description)' }
            return [pscustomobject]@{ Sent = $false; Reason = "Telegram returned ok=false: $desc" }
        }
        # Chat id is vault-managed credential material and this Reason lands in
        # agency-os/.agency-state/ao-resume-hook-last.{log,json}. Last 4 only.
        $tail = if ($cred.ChatId.Length -gt 4) { $cred.ChatId.Substring($cred.ChatId.Length - 4) } else { '****' }
        return [pscustomobject]@{ Sent = $true; Reason = "delivered (chat ...$tail)" }
    } catch {
        # $_.Exception.Message carries the HTTP status, never the URI, so the
        # token cannot leak through this path (verified 2026-08-12).
        return [pscustomobject]@{ Sent = $false; Reason = "Telegram API error: $($_.Exception.Message)" }
    }
}
