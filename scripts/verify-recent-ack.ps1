<#
.SYNOPSIS
  Atomic "acknowledge risk + clear" for /verify-recent --ack.

.DESCRIPTION
  Replaces the previous markdown-prose --skip flow with an explicit script that:
    1. Reads the tracker file (matches the SID derivation in _verify-shared.js)
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
  Companion to mcp/claude-userlevel/hooks/verify-gate-{stop,commit}.js + /verify-recent slash command.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Reason,

    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

# Dot-source the shared SID derivation. Single source of truth — must stay byte-compatible
# with mcp/claude-userlevel/hooks/_verify-shared.js getSessionId().
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

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
try {
    # Append-with-create using atomic temp + replace pattern is overkill for append —
    # use File.AppendAllText which is atomic for append on NTFS for small writes.
    $body = ($auditBlock -join [Environment]::NewLine) + [Environment]::NewLine
    if (-not (Test-Path -LiteralPath $dailyPath)) {
        # Scaffold the daily file if missing
        $header = "# Daily Note - $today" + [Environment]::NewLine + [Environment]::NewLine
        [System.IO.File]::WriteAllText($dailyPath, $header + $body, $utf8NoBom)
    } else {
        # Read current, append, atomic-write back via tmp + Move-Item -Force.
        # NOTE: NO explicit BOM stripping needed. [System.IO.File]::ReadAllText with any UTF-8
        # encoding instance auto-detects + strips a leading BOM (verified empirically 2026-05-22 —
        # StreamReader default detectEncodingFromByteOrderMarks=true).
        $existing = [System.IO.File]::ReadAllText($dailyPath, [System.Text.Encoding]::UTF8)
        $combined = $existing.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $body
        $tmpPath = "$dailyPath.tmp"
        [System.IO.File]::WriteAllText($tmpPath, $combined, $utf8NoBom)
        Move-Item -LiteralPath $tmpPath -Destination $dailyPath -Force
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
