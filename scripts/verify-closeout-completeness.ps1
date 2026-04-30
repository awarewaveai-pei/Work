<#
.SYNOPSIS
  Blocks AO-CLOSE push when staged "significant" changes lack WORKLOG evidence for today.

.DESCRIPTION
  ASCII-only for Windows PowerShell 5.1.
  Evidence = WORKLOG today section contains `- AUTO_TASK_DONE:`, `- AUTO_TASK_DONE_APPLIED`, or merged inbox verbatim block.
  Excludes generated-only paths (reports, integrated-status snapshot, etc.).
#>
param(
    [string]$WorkRoot = "",
    [ValidateSet("off", "warn", "strict")]
    [string]$Gate = "strict"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Gate -eq "off") {
    exit 0
}

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

Push-Location $WorkRoot
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        exit 0
    }

    $staged = @(git diff --cached --name-only | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($staged.Count -eq 0) {
        exit 0
    }

    $excludePattern = '(?i)^(reports/|agency-os/reports/)|integrated-status-LATEST\.md$|LAST_SYSTEM_STATUS\.md$|doc-sync-state\.json$|^agency-os/\.agency-state/closeout-inbox\.md$'

    $significant = @(
        $staged | Where-Object { $_ -notmatch $excludePattern }
    )

    if ($significant.Count -eq 0) {
        exit 0
    }

    $today = (Get-Date).ToString("yyyy-MM-dd")
    $worklogPath = Join-Path $WorkRoot "agency-os\WORKLOG.md"
    if (-not (Test-Path -LiteralPath $worklogPath)) {
        $msg = "verify-closeout-completeness: WORKLOG.md missing but staged changes exist."
        if ($Gate -eq "strict") {
            Write-Error $msg
            exit 1
        }
        Write-Warning $msg
        exit 0
    }

    $utf8 = [System.Text.UTF8Encoding]::new($false)
    $lines = [System.IO.File]::ReadAllLines($worklogPath, $utf8)
    $hdr = "## $today"
    $start = -1
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i].Trim() -eq $hdr) {
            $start = $i
            break
        }
    }

    if ($start -lt 0) {
        $msg = "verify-closeout-completeness: no WORKLOG section $hdr but staged edits exist. Run scaffold or add section."
        if ($Gate -eq "strict") {
            Write-Error $msg
            exit 1
        }
        Write-Warning $msg
        exit 0
    }

    $sb = New-Object System.Text.StringBuilder
    for ($j = $start + 1; $j -lt $lines.Length; $j++) {
        if ($lines[$j] -match '^\s*##\s+\d{4}-\d{2}-\d{2}\s*$') {
            break
        }
        [void]$sb.AppendLine($lines[$j])
    }
    $section = $sb.ToString()

    $hasEvidence = $false
    if ($section -match '(?m)^\s*-\s*AUTO_TASK_DONE:') {
        $hasEvidence = $true
    }
    if ($section -match '(?m)^\s*-\s*AUTO_TASK_DONE_APPLIED') {
        $hasEvidence = $true
    }
    if ($section -match 'Closeout inbox \(AO-CLOSE auto') {
        $hasEvidence = $true
    }

    if (-not $hasEvidence) {
        $list = ($significant -join ", ")
        $msg = "verify-closeout-completeness: staged changes ($list) require today's WORKLOG evidence: add line `- AUTO_TASK_DONE: <substring>` and/or ensure inbox merge appended `Closeout inbox (AO-CLOSE auto`. Gate=$Gate"
        if ($Gate -eq "strict") {
            Write-Error $msg
            exit 1
        }
        Write-Warning $msg
    }

    # Daily note quality gate: block closeout if today's scaffold placeholders remain.
    $dailyPath = Join-Path $WorkRoot ("agency-os\memory\daily\{0}.md" -f $today)
    if (Test-Path -LiteralPath $dailyPath) {
        $dailyText = [System.IO.File]::ReadAllText($dailyPath, $utf8)
        $hasTbd = ($dailyText -match '(?m)^\s*-\s*\(TBD\)\s*$')
        if ($hasTbd) {
            $msg = "verify-closeout-completeness: daily note still contains scaffold placeholders `(TBD)` in $dailyPath. Fill Done today / Current state / Next steps before closeout. Gate=$Gate"
            if ($Gate -eq "strict") {
                Write-Error $msg
                exit 1
            }
            Write-Warning $msg
        }
    }
} finally {
    Pop-Location
}

exit 0
