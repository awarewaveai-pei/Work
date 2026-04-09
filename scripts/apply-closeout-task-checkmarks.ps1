param(
    [string]$WorkRoot = "",
    [switch]$PendingFileOnly,
    [switch]$WorklogMarkersOnly
)

# Applies - [ ] -> - [x] in agency-os/TASKS.md from:
#   (1) Today's ## yyyy-MM-dd section in agency-os/WORKLOG.md: lines
#       "- AUTO_TASK_DONE: <unique substring matching one open task>"
#   (2) Optional agency-os/.agency-state/pending-task-completions.txt (same as legacy; gitignored)
# -PendingFileOnly / -WorklogMarkersOnly: narrow sources (for tests / manual recovery).
# Idempotent: substring already satisfied by a checked [x] line → skip TASKS change, still clear WORKLOG marker.
# All-or-nothing for ambiguous UNKNOWN needles (typo / multi-match on OPEN items).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

$agencyRoot = Join-Path $WorkRoot "agency-os"
$tasksPath = Join-Path $agencyRoot "TASKS.md"
$worklogPath = Join-Path $agencyRoot "WORKLOG.md"
$stateDir = Join-Path $agencyRoot ".agency-state"
$pendingPath = Join-Path $stateDir "pending-task-completions.txt"
$utf8 = [System.Text.UTF8Encoding]::new($false)

$today = (Get-Date).ToString("yyyy-MM-dd")
$needlesOrdered = New-Object System.Collections.Generic.List[string]
$seen = @{}

function Add-NeedleUnique([string]$n) {
    if ([string]::IsNullOrWhiteSpace($n)) { return }
    $t = $n.Trim()
    if (-not $t) { return }
    if ($seen.ContainsKey($t)) { return }
    $seen[$t] = $true
    $script:needlesOrdered.Add($t)
}

# --- (1) WORKLOG markers under ## today
$worklogNeedleSet = @{}
if (-not $PendingFileOnly -and (Test-Path -LiteralPath $worklogPath)) {
    $wl = @([System.IO.File]::ReadAllLines($worklogPath, $utf8))
    $header = "## $today"
    $start = -1
    for ($i = 0; $i -lt $wl.Length; $i++) {
        if ($wl[$i].Trim() -eq $header) { $start = $i; break }
    }
    if ($start -ge 0) {
        $rxDone = [regex]'^\s*-\s*AUTO_TASK_DONE:\s*(.+)$'
        for ($j = $start + 1; $j -lt $wl.Length; $j++) {
            if ($wl[$j] -match '^\s*##\s+') { break }
            $m = $rxDone.Match($wl[$j])
            if ($m.Success) {
                $raw = $m.Groups[1].Value.Trim()
                Add-NeedleUnique $raw
                $worklogNeedleSet[$raw] = $true
            }
        }
    }
}

# --- (2) pending file
$hadPendingFile = $false
if (-not $WorklogMarkersOnly -and (Test-Path -LiteralPath $pendingPath)) {
    $hadPendingFile = $true
    foreach ($line in [System.IO.File]::ReadAllLines($pendingPath, $utf8)) {
        if ($null -eq $line) { continue }
        $t = $line.Trim()
        if (-not $t -or $t.StartsWith("#")) { continue }
        Add-NeedleUnique $t
    }
}

if ($needlesOrdered.Count -eq 0) {
    if ($hadPendingFile) {
        Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $tasksPath)) {
    Write-Error "apply-closeout-task-checkmarks: TASKS.md missing at $tasksPath"
    exit 1
}

$lines = [System.Collections.Generic.List[string]]::new()
foreach ($l in [System.IO.File]::ReadAllLines($tasksPath, $utf8)) { $lines.Add($l) }

$rxUnchecked = [regex]'^\s*-\s+\[\s+\]\s+'
$rxChecked = New-Object System.Text.RegularExpressions.Regex(
    '^\s*-\s+\[\s*x\s*\]\s+',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

function Find-Hits([string]$needle, [regex]$rxLine) {
    $h = New-Object System.Collections.Generic.List[int]
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($rxLine.IsMatch($lines[$i]) -and ($lines[$i].IndexOf($needle, [System.StringComparison]::Ordinal) -ge 0)) {
            $h.Add($i)
        }
    }
    return $h
}

$planned = @()
$alreadyDone = New-Object System.Collections.Generic.List[string]

foreach ($needle in $needlesOrdered) {
    $openHits = Find-Hits $needle $rxUnchecked
    if ($openHits.Count -eq 1) {
        $planned += [pscustomobject]@{ Index = $openHits[0]; Needle = $needle }
        continue
    }
    if ($openHits.Count -gt 1) {
        $preview = ($openHits | ForEach-Object { "    line {0}: {1}" -f ($_ + 1), $lines[$_] }) -join [Environment]::NewLine
        Write-Error ("apply-closeout-task-checkmarks: OPEN substring matches multiple tasks ({0}):`n{1}`nNeedle: {2}" -f $openHits.Count, $preview, $needle)
        exit 1
    }
    $doneHits = Find-Hits $needle $rxChecked
    if ($doneHits.Count -ge 1) {
        $alreadyDone.Add($needle) | Out-Null
        Write-Host ("apply-closeout-task-checkmarks: already [x], skip: {0}" -f $(if ($needle.Length -le 72) { $needle } else { $needle.Substring(0, 72) + "..." })) -ForegroundColor DarkGray
        continue
    }
    Write-Error ("apply-closeout-task-checkmarks: no OPEN or DONE task contains substring: {0}" -f $needle)
    exit 1
}

$idxDup = $planned | Group-Object Index | Where-Object { $_.Count -gt 1 }
if ($idxDup) {
    Write-Error "apply-closeout-task-checkmarks: duplicate line index (overlapping needles)."
    exit 1
}

foreach ($p in $planned) {
    $ln = $lines[$p.Index]
    $newLine = [regex]::Replace($ln, '(?m)^(\s*-\s+)\[\s+\](\s+)', '${1}[x]$2', 1)
    if ($newLine -eq $ln) {
        Write-Error ("apply-closeout-task-checkmarks: failed to flip checkbox at line {0}" -f ($p.Index + 1))
        exit 1
    }
    $lines[$p.Index] = $newLine
    $snippet = if ($p.Needle.Length -le 72) { $p.Needle } else { $p.Needle.Substring(0, 72) + "..." }
    Write-Host ("apply-closeout-task-checkmarks: checked: {0}" -f $snippet) -ForegroundColor Green
}

if ($planned.Count -gt 0) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $body = ($lines -join [Environment]::NewLine) + [Environment]::NewLine
    [System.IO.File]::WriteAllText($tasksPath, $body, $utf8NoBom)
}

# --- Rewrite WORKLOG AUTO_TASK_DONE -> APPLIED (today section only)
$resolved = @{}
foreach ($p in $planned) { $resolved[$p.Needle] = $true }
foreach ($d in $alreadyDone) { $resolved[$d] = $true }

if (-not $PendingFileOnly -and (Test-Path -LiteralPath $worklogPath) -and $worklogNeedleSet.Count -gt 0) {
    $wl2 = [System.Collections.Generic.List[string]]::new()
    foreach ($x in [System.IO.File]::ReadAllLines($worklogPath, $utf8)) { $wl2.Add($x) }
    $header2 = "## $today"
    $start2 = -1
    for ($i = 0; $i -lt $wl2.Count; $i++) {
        if ($wl2[$i].Trim() -eq $header2) { $start2 = $i; break }
    }
    if ($start2 -ge 0) {
        $rxLineDone = [regex]'^(?<indent>\s*-\s*)AUTO_TASK_DONE:\s*(?<needle>.+)$'
        $utc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $changedWl = $false
        for ($j = $start2 + 1; $j -lt $wl2.Count; $j++) {
            if ($wl2[$j] -match '^\s*##\s+') { break }
            $m2 = $rxLineDone.Match($wl2[$j])
            if (-not $m2.Success) { continue }
            $nd = $m2.Groups["needle"].Value.Trim()
            if ($resolved.ContainsKey($nd)) {
                $ind = $m2.Groups["indent"].Value
                $wl2[$j] = ("{0}AUTO_TASK_DONE_APPLIED ({1}): {2}" -f $ind, $utc, $nd)
                $changedWl = $true
            }
        }
        if ($changedWl) {
            $wbody = ($wl2 -join [Environment]::NewLine) + [Environment]::NewLine
            [System.IO.File]::WriteAllText($worklogPath, $wbody, (New-Object System.Text.UTF8Encoding $false))
            Write-Host "apply-closeout-task-checkmarks: updated WORKLOG markers for $today." -ForegroundColor DarkGray
        }
    }
}

if ($hadPendingFile) {
    Remove-Item -LiteralPath $pendingPath -Force
    Write-Host "apply-closeout-task-checkmarks: removed pending-task-completions.txt" -ForegroundColor DarkGray
}

$total = $planned.Count + $alreadyDone.Count
if ($total -gt 0) {
    Write-Host ("apply-closeout-task-checkmarks: done (new checks: {0}, already-done: {1})." -f $planned.Count, $alreadyDone.Count) -ForegroundColor DarkGray
}
exit 0
