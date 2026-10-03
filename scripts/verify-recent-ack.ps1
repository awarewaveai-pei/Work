<#
.SYNOPSIS
  Atomic "acknowledge risk + clear" for /verify-recent --ack.

.DESCRIPTION
  Replaces the previous markdown-prose --skip flow with an explicit script that:
    1. Reads the tracker file (matches the SID derivation in hooks/lib/shared.js)
    2. Appends a verbatim audit record to agency-os/memory/daily/<today>.md
    3. ONLY THEN deletes the tracker (atomicity — never delete before log written)
  If step 2 fails, step 3 does not run (tracker stays, gate stays blocked).

  Why this exists: critic round 1 flagged M3 — markdown-prose --skip had no atomic
  log-then-delete guarantee. If WORKLOG write failed (CP950 / disk full / encoding bug
  again), operator could delete tracker without audit, or log without deleting.

.PARAMETER Reason
  One-line operator-supplied reason for skipping. Logged verbatim.

.PARAMETER WorkRoot
  Monorepo root (auto-detected if omitted).

.EXAMPLE
  powershell -File scripts/verify-recent-ack.ps1 -Reason "Comment-only edit, no functional change"

.NOTES
  Companion to mcp/claude-userlevel/hooks/rules/verify-gate-{stop,commit}.js + /verify-recent slash command.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Reason,

    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'lib\repo-text.ps1')

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

# Dot-source the shared SID derivation. Single source of truth — must stay byte-compatible
# with mcp/claude-userlevel/hooks/lib/shared.js getSessionId().
. (Join-Path $PSScriptRoot "verify-sid-shared.ps1")

$sid = Get-VerifySid
$tf  = Get-VerifyTrackerPath -Sid $sid

if (-not (Test-Path -LiteralPath $tf)) {
    Write-Host "verify-recent-ack: tracker is empty (sid=$sid) — nothing to acknowledge." -ForegroundColor DarkGray
    exit 0
}

$files = @(Get-Content -LiteralPath $tf -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '^#' })
if ($files.Count -eq 0) {
    Remove-Item -LiteralPath $tf -Force
    Write-Host "verify-recent-ack: tracker had only metadata; cleared." -ForegroundColor DarkGray
    exit 0
}

# Risk-tier classification (2026-06-12) — reuse the JS SSOT (hooks/lib/shared.js classifyRisk) via node so
# the high/normal tier definition NEVER drifts between the hooks and this script (R4). --ack still
# clears (the gate is accident-prevention, not adversarial), but high-risk files (auth/payment/RLS/
# migration/deploy) get a LOUD, distinct audit trail so an acknowledged shortcut on a dangerous path
# is never invisible. node failure degrades safe (empty list) -> behaves exactly as before.
# NOTE: this file is ASCII-only on purpose (no BOM) -- non-ASCII glyphs in a CP950-decoded .ps1 get
# written as '??' (CP950 trap, WORKLOG 2026-05-22 + critic 2026-06-12). Keep all output ASCII.
$highRisk = @()
try {
    $sharedJs = (Join-Path $WorkRoot "mcp\claude-userlevel\hooks\lib\shared.js") -replace '\\', '/'
    if (Test-Path -LiteralPath ($WorkRoot + "\mcp\claude-userlevel\hooks\lib\shared.js")) {
        $nodeCode = "const s=require(process.argv[1]);for(const f of process.argv.slice(2)){const c=s.classifyRisk(f);if(c.tier==='high')console.log(f+'\t'+c.why);}"
        $out = & node -e $nodeCode $sharedJs @files 2>$null
        if ($LASTEXITCODE -eq 0 -and $out) { $highRisk = @($out | Where-Object { $_ }) }
    }
} catch { $highRisk = @() }
if ($highRisk.Count -gt 0) {
    Write-Host "verify-recent-ack: [!] $($highRisk.Count) HIGH-RISK file(s) being acknowledged WITHOUT full verification:" -ForegroundColor Yellow
    foreach ($hr in $highRisk) { Write-Host "  [!] $hr" -ForegroundColor Yellow }
    Write-Host "verify-recent-ack: this is logged prominently to the daily audit. Prefer full /verify-recent for these." -ForegroundColor Yellow
}

# ── Step 1: Append audit record to today's daily memory (atomic via temp + Move) ──
$today = Get-Date -Format 'yyyy-MM-dd'
$dailyDir = Join-Path $WorkRoot "agency-os\memory\daily"
$dailyPath = Join-Path $dailyDir "$today.md"
if (-not (Test-Path -LiteralPath $dailyDir)) { New-Item -ItemType Directory -Path $dailyDir -Force | Out-Null }

$utc = (Get-Date).ToUniversalTime().ToString('o')
$auditBlock = @()
$auditBlock += ""
$auditBlock += "### verify-recent --ack ($utc)"
$auditBlock += ""
$auditBlock += "**Reason**: $Reason"
$auditBlock += ""
$auditBlock += "**Acknowledged unverified files** (count=$($files.Count)):"
$auditBlock += ""
foreach ($f in $files) { $auditBlock += "- ``$f``" }
$auditBlock += ""
if ($highRisk.Count -gt 0) {
    $auditBlock += "**[!] HIGH-RISK acknowledged WITHOUT full verification** (count=$($highRisk.Count)):"
    $auditBlock += ""
    foreach ($hr in $highRisk) {
        $parts = $hr -split "`t", 2
        $hrFile = $parts[0]
        $hrWhy = if ($parts.Count -gt 1) { $parts[1] } else { 'high-risk' }
        $auditBlock += "- ``$hrFile`` -- **$hrWhy** (auth/payment/RLS/migration/deploy class -- full verify was skipped)"
    }
    $auditBlock += ""
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
try {
    # Append-with-create using atomic temp + replace pattern is overkill for append —
    # use File.AppendAllText which is atomic for append on NTFS for small writes.
    $body = ($auditBlock -join [Environment]::NewLine) + [Environment]::NewLine
    if (-not (Test-Path -LiteralPath $dailyPath)) {
        # Scaffold the daily file if missing
        $header = "# Daily Note - $today" + [Environment]::NewLine + [Environment]::NewLine
        Write-RepoTextFile -Path $dailyPath -Content ($header + $body)
    } else {
        # Read current, append, atomic-write back via tmp + Move-Item -Force.
        # NOTE: NO explicit BOM stripping needed. [System.IO.File]::ReadAllText with any UTF-8
        # encoding instance auto-detects + strips a leading BOM (verified empirically 2026-05-22 —
        # StreamReader default detectEncodingFromByteOrderMarks=true).
        $existing = [System.IO.File]::ReadAllText($dailyPath, [System.Text.Encoding]::UTF8)
        $combined = $existing.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $body
        Write-RepoTextFile -Path $dailyPath -Content $combined -Atomic
    }
    Write-Host "verify-recent-ack: audit record appended to $dailyPath" -ForegroundColor Cyan
} catch {
    Write-Error "verify-recent-ack: FAILED to write audit record. Tracker NOT cleared (gate still blocks). Fix the error and re-run. Error: $_"
    exit 1
}

# ── Step 2 (only if step 1 succeeded): Delete tracker ──────────────────────────
try {
    Remove-Item -LiteralPath $tf -Force
    Write-Host "verify-recent-ack: tracker cleared. git commit is unblocked." -ForegroundColor Green
    Write-Host "verify-recent-ack: $($files.Count) file(s) flagged as 'risk acknowledged' — see $dailyPath" -ForegroundColor DarkGray
} catch {
    Write-Error "verify-recent-ack: audit record WAS written, but tracker delete failed. Manual cleanup needed: Remove-Item '$tf'. Error: $_"
    exit 1
}

exit 0
