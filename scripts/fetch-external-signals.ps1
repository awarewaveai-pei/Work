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
    [int]$SlackMaxPerChan  = 5,
    # Optional explicit time range (ISO 8601 or "yyyy-MM-dd HH:mm", CST or UTC).
    # When -From is set it overrides ao-close-last.txt as the since anchor.
    # When -To is set it caps the query end (Slack latest= + digest until=).
    [string]$From          = "",
    [string]$To            = ""
)

# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

# --- resolve work root ---
if (-not $WorkRoot) {
    try { $WorkRoot = (Invoke-WithUtf8Console { git -C $PSScriptRoot rev-parse --show-toplevel 2>$null }).Trim() } catch {}
    if (-not $WorkRoot) { $WorkRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$stateDir  = Join-Path $WorkRoot "agency-os\.agency-state"
$null = New-Item -ItemType Directory -Force -Path $stateDir

Write-Host "== fetch-external-signals: building digest ==" -ForegroundColor Cyan

# --- determine "since" / "until" timestamps ---
$sinceUtc    = $null
$untilUtc    = $null
$sinceSource = "fallback-24h"   # updated below as we find a better anchor

# -From override: explicit start (supports "yyyy-MM-dd HH:mm" in CST or ISO UTC)
if ($From) {
    try {
        if (-not $From.Contains("Z") -and -not $From.Contains("+")) {
            # No timezone: treat as CST (UTC+8) → subtract 8h to get UTC
            $parsed  = [DateTime]::Parse($From, $null, [System.Globalization.DateTimeStyles]::None)
            $sinceUtc = [DateTime]::SpecifyKind($parsed.AddHours(-8), [DateTimeKind]::Utc)
        } else {
            $sinceUtc = [DateTime]::Parse($From, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
        }
        $sinceSource = "explicit-from-param"
        Write-Host "   since: $From (from -From param, UTC=$($sinceUtc.ToString('o')))" -ForegroundColor DarkGray
    } catch {
        Write-Host "   WARN: -From '$From' parse failed, using ao-close stamp" -ForegroundColor Yellow
        $sinceUtc = $null
    }
}

# Stamp fallback when -From not provided (or parse failed)
if (-not $sinceUtc) {
    foreach ($stampFile in @("ao-close-last.txt", "ao-resume-last.txt")) {
        $f = Join-Path $stateDir $stampFile
        if (Test-Path -LiteralPath $f) {
            try {
                $raw = (Get-Content -LiteralPath $f -Raw -Encoding UTF8).Trim()
                $sinceUtc    = [DateTime]::Parse($raw, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
                $sinceSource = $stampFile
                Write-Host "   since: $raw (from $stampFile)" -ForegroundColor DarkGray
                break
            } catch {}
        }
    }
}
if (-not $sinceUtc) {
    $sinceUtc = (Get-Date).ToUniversalTime().AddHours(-$MaxLookbackHours)
    # sinceSource already "fallback-24h"
    Write-Host "   since: no stamp found, using last $MaxLookbackHours h" -ForegroundColor DarkYellow
}

# is_fresh = true when the anchor is reliable (came from explicit param or ao-close stamp).
# false when falling back to ao-resume-last.txt or 24h — may include already-seen signals.
$isFresh = $sinceSource -in @("explicit-from-param", "ao-close-last.txt")

# -To override: explicit end cap
if ($To) {
    try {
        if (-not $To.Contains("Z") -and -not $To.Contains("+")) {
            # No timezone: treat as CST (UTC+8) → subtract 8h to get UTC
            $parsedTo  = [DateTime]::Parse($To, $null, [System.Globalization.DateTimeStyles]::None)
            $untilUtc = [DateTime]::SpecifyKind($parsedTo.AddHours(-8), [DateTimeKind]::Utc)
        } else {
            $untilUtc = [DateTime]::Parse($To, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
        }
        Write-Host "   until: $To (from -To param, UTC=$($untilUtc.ToString('o')))" -ForegroundColor DarkGray
    } catch {
        Write-Host "   WARN: -To '$To' parse failed, ignoring upper bound" -ForegroundColor Yellow
        $untilUtc = $null
    }
}

$sinceIso    = $sinceUtc.ToString("o")
$sinceEpoch  = [long]($sinceUtc - [DateTime]::new(1970,1,1,0,0,0,[DateTimeKind]::Utc)).TotalSeconds
$untilIso    = if ($untilUtc) { $untilUtc.ToString("o") } else { $null }
$untilEpoch  = if ($untilUtc) { [long]($untilUtc - [DateTime]::new(1970,1,1,0,0,0,[DateTimeKind]::Utc)).TotalSeconds } else { $null }

# --- load vault ---
$vaultStore = $null
try {
    . (Join-Path $WorkRoot "scripts\_vault-helpers.ps1") -ErrorAction Stop
    $vaultStore = Read-VaultStore (Resolve-VaultPath)
} catch {}

function Get-Secret {
    param([string]$Name)
    # Registry-always-wins: User registry has authoritative current values;
    # process env may be stale (set when IDE launched before vault-sync ran).
    $v = [System.Environment]::GetEnvironmentVariable($Name, 'User')
    if (-not $v) { $v = [System.Environment]::GetEnvironmentVariable($Name, 'Machine') }
    if (-not $v) { $v = [System.Environment]::GetEnvironmentVariable($Name) }
    if ($v) { return $v }
    if ($vaultStore) {
        try { return Get-VaultSecret -Store $vaultStore -Name $Name } catch {}
    }
    return $null
}

# ─────────────────────────────────────────────────────────────────────────────
# OPS_INBOX_COMMANDS — user Telegram commands (user → bot direction only; 0 = no operator commands, normal)
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
        if ($untilIso) { $uri += "&until=$([Uri]::EscapeDataString($untilIso))" }
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
        $tgUnread = $tgMessages.Count   # internal var kept for compat; JSON key is message_count
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

Write-Host ("   ops_inbox_commands: {0} ({1} msg)" -f $tgStatus, $tgUnread) `
    -ForegroundColor $(if ($tgStatus -eq "ok") { "Green" } else { "Yellow" })

# ─────────────────────────────────────────────────────────────────────────────
# DEPLOY EVENTS — VPS deploy events via ops_inbox incidents API (source=deploy)
# ─────────────────────────────────────────────────────────────────────────────
$deployStatus = "no_token"
$deployCount  = 0
$deployEvents = @()

if ($opsToken) {
    try {
        $uri  = "$opsBase/api/ops/inbox/incidents?source=deploy&since=$([Uri]::EscapeDataString($sinceIso))"
        if ($untilIso) { $uri += "&until=$([Uri]::EscapeDataString($untilIso))" }
        $resp = Invoke-RestMethod -Uri $uri `
                    -Headers @{ Authorization = "Bearer $opsToken" } `
                    -TimeoutSec 10 -ErrorAction Stop
        $deployEvents = @($resp.incidents | ForEach-Object {
            [ordered]@{
                date     = $_.last_seen_at
                title    = $_.title
                severity = $_.severity
                status   = $_.status
                service  = $_.service
            }
        })
        $deployCount  = $deployEvents.Count
        $deployStatus = "ok"
    } catch {
        $msg = ($_.Exception.Message -replace '\r?\n', ' ')
        if ($msg -match "404|Not Found") { $deployStatus = "endpoint_pending" }
        else { $deployStatus = "error: $msg" }
    }
}

Write-Host ("   deploy_events:      {0} ({1} events)" -f $deployStatus, $deployCount) `
    -ForegroundColor $(if ($deployStatus -eq "ok") { "Green" } elseif ($deployStatus -eq "endpoint_pending") { "Yellow" } else { "Red" })

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
        $slackChannels[$ch] = [ordered]@{ status = "no_token"; message_count = 0; messages = @() }
    }
} else {
    foreach ($ch in $channelMap.Keys) {
        $chId = $channelMap[$ch]
        if (-not $chId) {
            $slackChannels[$ch] = [ordered]@{ status = "no_channel_id"; message_count = 0; messages = @() }
            $slackStatus = "partial"
            continue
        }
        try {
            $uri  = "https://slack.com/api/conversations.history?channel=$chId&oldest=$sinceEpoch&limit=20&inclusive=false"
            if ($untilEpoch) { $uri += "&latest=$untilEpoch" }
            $resp = Invoke-RestMethod -Uri $uri `
                        -Headers @{ Authorization = "Bearer $slackToken" } `
                        -TimeoutSec 10 -ErrorAction Stop
            if (-not $resp.ok) {
                $slackChannels[$ch] = [ordered]@{ status = "slack_error: $($resp.error)"; message_count = 0; messages = @() }
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
                $slackChannels[$ch] = [ordered]@{ status = "ok"; message_count = $msgs.Count; messages = $msgs }
            }
        } catch {
            $err = ($_.Exception.Message -replace '\r?\n', ' ')
            $slackChannels[$ch] = [ordered]@{ status = "error: $err"; message_count = 0; messages = @() }
            $slackStatus = "partial"
        }
    }
}

Write-Host ("   Slack:    {0}" -f $slackStatus) `
    -ForegroundColor $(if ($slackStatus -eq "ok") { "Green" } else { "Yellow" })

# ─────────────────────────────────────────────────────────────────────────────
# Write digest
# ─────────────────────────────────────────────────────────────────────────────
$generatedUtc = (Get-Date).ToUniversalTime()
$endIso       = if ($untilUtc) { $untilUtc.ToString("o") } else { $generatedUtc.ToString("o") }

# Aggregate fetch_status: ok = all channels succeeded, partial = at least one ok, failed = none ok.
# endpoint_pending is a known-transient state (new endpoint not yet deployed); treat as neutral for aggregate.
$deployStatusForAggregate = if ($deployStatus -eq "endpoint_pending") { "ok" } else { $deployStatus }
$allStatuses  = @($tgStatus, $deployStatusForAggregate) + @($slackChannels.Values | ForEach-Object { $_.status })
# @() wrap is required: under Set-StrictMode -Version Latest (:33), a Where-Object
# result that isn't a real array (zero matches -> $null, exactly one match -> a bare
# scalar) has no synthetic .Count member and throws PropertyNotFoundStrict. That is
# precisely the 0-ok / 1-ok case this line exists to detect (codex-oracle.ps1:234
# review, 2026-08-29).
$okCount      = @($allStatuses | Where-Object { $_ -eq "ok" }).Count
$fetchStatus  = if ($okCount -eq $allStatuses.Count) { "ok" } elseif ($okCount -gt 0) { "partial" } else { "failed" }

$digest = [ordered]@{
    generated_utc = $generatedUtc.ToString("o")
    since_utc     = $sinceIso           # kept for backward compat
    fetch_status  = $fetchStatus        # ok | partial | failed
    gap_window    = [ordered]@{
        start_utc = $sinceIso           # last AO-CLOSE (or fallback)
        end_utc   = $endIso             # this AO-RESUME (or -To cap)
        source    = $sinceSource        # explicit-from-param | ao-close-last.txt | ao-resume-last.txt | fallback-24h
        is_fresh  = $isFresh            # true = gap is reliable; false = fallback anchor, may include old signals
    }
    ops_inbox_commands = [ordered]@{
        status        = $tgStatus
        message_count = $tgUnread
        messages      = $tgMessages
    }
    deploy_events = [ordered]@{
        status      = $deployStatus
        event_count = $deployCount
        events      = $deployEvents
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
