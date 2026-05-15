#requires -Version 5.1
<#
.SYNOPSIS
  Fetches Telegram bot inbox + Slack channel messages since last AO-CLOSE.
  Called by ao-resume.ps1 — always exits 0 (non-blocking / warn-only).

.OUTPUTS
  agency-os/.agency-state/external-signals-digest.json

.NOTES
  Telegram: reads from ops inbox API GET /api/ops/inbox/digest?since=<ISO>
            Requires: OPS_INBOX_INGEST_TOKEN (vault or env)
            Base URL:  OPS_INBOX_BASE_URL (default: https://app.aware-wave.com)

  Slack:    reads conversations.history for each configured channel
            Requires: SLACK_BOT_TOKEN (vault or env, scope: channels:history)
            Channels: SLACK_OPS_INCIDENTS_CHANNEL_ID
                      SLACK_INFRA_ALERTS_CHANNEL_ID
                      SLACK_GITHUB_PRS_CHANNEL_ID
            (vault keys match env var names; falls back gracefully if missing)
#>
param(
    [string]$WorkRoot      = "",
    [int]$MaxLookbackHours = 24,
    [int]$SlackMaxPerChan  = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

# --- resolve work root ---
if (-not $WorkRoot) {
    try { $WorkRoot = (git -C $PSScriptRoot rev-parse --show-toplevel 2>$null).Trim() } catch {}
    if (-not $WorkRoot) { $WorkRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$stateDir  = Join-Path $WorkRoot "agency-os\.agency-state"
$null = New-Item -ItemType Directory -Force -Path $stateDir

Write-Host "== fetch-external-signals: building digest ==" -ForegroundColor Cyan

# --- determine "since" timestamp (ao-close stamp preferred, ao-resume fallback) ---
$sinceUtc = $null
foreach ($stampFile in @("ao-close-last.txt", "ao-resume-last.txt")) {
    $f = Join-Path $stateDir $stampFile
    if (Test-Path -LiteralPath $f) {
        try {
            $raw = (Get-Content -LiteralPath $f -Raw -Encoding UTF8).Trim()
            $sinceUtc = [DateTime]::Parse($raw, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
            Write-Host "   since: $raw (from $stampFile)" -ForegroundColor DarkGray
            break
        } catch {}
    }
}
if (-not $sinceUtc) {
    $sinceUtc = (Get-Date).ToUniversalTime().AddHours(-$MaxLookbackHours)
    Write-Host "   since: no stamp found, using last $MaxLookbackHours h" -ForegroundColor DarkYellow
}
$sinceIso   = $sinceUtc.ToString("o")
$sinceEpoch = [long]($sinceUtc - [DateTime]::new(1970,1,1,0,0,0,[DateTimeKind]::Utc)).TotalSeconds

# --- load vault ---
$vaultStore = $null
try {
    . (Join-Path $WorkRoot "scripts\_vault-helpers.ps1") -ErrorAction Stop
    $vaultStore = Read-VaultStore (Resolve-VaultPath)
} catch {}

function Get-Secret {
    param([string]$Name)
    $v = [System.Environment]::GetEnvironmentVariable($Name)
    if (-not $v) { $v = [System.Environment]::GetEnvironmentVariable($Name, 'User') }
    if (-not $v) { $v = [System.Environment]::GetEnvironmentVariable($Name, 'Machine') }
    if ($v) { return $v }
    if ($vaultStore) {
        try { return Get-VaultSecret -Store $vaultStore -Name $Name } catch {}
    }
    return $null
}

# ─────────────────────────────────────────────────────────────────────────────
# TELEGRAM — ops inbox API
# ─────────────────────────────────────────────────────────────────────────────
$tgStatus   = "no_token"
$tgUnread   = 0
$tgMessages = @()

$opsBase  = Get-Secret "OPS_INBOX_BASE_URL"
if (-not $opsBase) { $opsBase = "https://app.aware-wave.com" }
$opsToken = Get-Secret "OPS_INBOX_INGEST_TOKEN"

if ($opsToken) {
    try {
        $uri  = "$opsBase/api/ops/inbox/digest?since=$([Uri]::EscapeDataString($sinceIso))"
        $resp = Invoke-RestMethod -Uri $uri `
                    -Headers @{ Authorization = "Bearer $opsToken" } `
                    -TimeoutSec 10 -ErrorAction Stop
        $tgMessages = @($resp.messages | ForEach-Object {
            [ordered]@{
                date   = $_.created_at
                type   = $_.event_type
                text   = ($_.summary -replace '\r?\n', ' ').Trim()
                source = "telegram"
            }
        })
        $tgUnread = $tgMessages.Count
        $tgStatus = "ok"
    } catch {
        $msg = ($_.Exception.Message -replace '\r?\n', ' ')
        # 404 = endpoint not yet deployed; mark as pending rather than error
        if ($msg -match "404|Not Found") {
            $tgStatus = "endpoint_pending"
        } else {
            $tgStatus = "error: $msg"
        }
    }
}

Write-Host ("   Telegram: {0} ({1} msg)" -f $tgStatus, $tgUnread) `
    -ForegroundColor $(if ($tgStatus -eq "ok") { "Green" } else { "Yellow" })

# ─────────────────────────────────────────────────────────────────────────────
# SLACK — conversations.history per channel
# ─────────────────────────────────────────────────────────────────────────────
$slackToken  = Get-Secret "SLACK_BOT_TOKEN"
$slackStatus = "ok"

$channelMap = [ordered]@{
    "ops-incidents" = Get-Secret "SLACK_OPS_INCIDENTS_CHANNEL_ID"
    "infra-alerts"  = Get-Secret "SLACK_INFRA_ALERTS_CHANNEL_ID"
    "github-prs"    = Get-Secret "SLACK_GITHUB_PRS_CHANNEL_ID"
}

$slackChannels = [ordered]@{}

if (-not $slackToken) {
    $slackStatus = "no_token"
    foreach ($ch in $channelMap.Keys) {
        $slackChannels[$ch] = [ordered]@{ status = "no_token"; unread_count = 0; messages = @() }
    }
} else {
    foreach ($ch in $channelMap.Keys) {
        $chId = $channelMap[$ch]
        if (-not $chId) {
            $slackChannels[$ch] = [ordered]@{ status = "no_channel_id"; unread_count = 0; messages = @() }
            $slackStatus = "partial"
            continue
        }
        try {
            $uri  = "https://slack.com/api/conversations.history?channel=$chId&oldest=$sinceEpoch&limit=20&inclusive=false"
            $resp = Invoke-RestMethod -Uri $uri `
                        -Headers @{ Authorization = "Bearer $slackToken" } `
                        -TimeoutSec 10 -ErrorAction Stop
            if (-not $resp.ok) {
                $slackChannels[$ch] = [ordered]@{ status = "slack_error: $($resp.error)"; unread_count = 0; messages = @() }
                $slackStatus = "partial"
            } else {
                $msgs = @($resp.messages `
                    | Where-Object { -not $_.subtype -or $_.subtype -notin @("channel_join","channel_leave") } `
                    | Select-Object -First $SlackMaxPerChan `
                    | ForEach-Object {
                        $ts  = [DateTime]::new(1970,1,1,0,0,0,[DateTimeKind]::Utc).AddSeconds([double]($_.ts -split '\.')[0])
                        $txt = ($_.text -replace '<[^>]+>', '' -replace '\r?\n', ' ').Trim()
                        if ($txt.Length -gt 200) { $txt = $txt.Substring(0,200) + "..." }
                        [ordered]@{ date = $ts.ToString("o"); text = $txt }
                    })
                $slackChannels[$ch] = [ordered]@{ status = "ok"; unread_count = $msgs.Count; messages = $msgs }
            }
        } catch {
            $err = ($_.Exception.Message -replace '\r?\n', ' ')
            $slackChannels[$ch] = [ordered]@{ status = "error: $err"; unread_count = 0; messages = @() }
            $slackStatus = "partial"
        }
    }
}

Write-Host ("   Slack:    {0}" -f $slackStatus) `
    -ForegroundColor $(if ($slackStatus -eq "ok") { "Green" } else { "Yellow" })

# ─────────────────────────────────────────────────────────────────────────────
# Write digest
# ─────────────────────────────────────────────────────────────────────────────
$digest = [ordered]@{
    generated_utc = (Get-Date).ToUniversalTime().ToString("o")
    since_utc     = $sinceIso
    telegram      = [ordered]@{
        status       = $tgStatus
        unread_count = $tgUnread
        messages     = $tgMessages
    }
    slack         = [ordered]@{
        status   = $slackStatus
        channels = $slackChannels
    }
}

$outPath = Join-Path $stateDir "external-signals-digest.json"
[System.IO.File]::WriteAllText($outPath, ($digest | ConvertTo-Json -Depth 8), $utf8NoBom)
Write-Host "   digest → agency-os/.agency-state/external-signals-digest.json" -ForegroundColor DarkGray

exit 0
