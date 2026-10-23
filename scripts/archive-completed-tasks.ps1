param(
    [string]$WorkRoot = "",
    [switch]$DryRun
)

# AO-CLOSE step: moves top-level "- [x]" blocks (the line + every deeper-indented child line) out of
# agency-os/TASKS.md "### 未完成" into the top of "## Next — 已完成歷程（查詢用）" under
# "### YYYY-MM-DD — AO-CLOSE 自動歸檔". Indented "  - [x]" items inside open parents are NOT moved.
# Sub-headings (#### ...) never move. Lines are moved verbatim (line count grows by header/blank lines only).
# Also gates duplicate open tasks (only two conservative rules, fuzzy matching is deliberately absent):
#   (1) one handoffs/<file> referenced by >=2 open "- [ ]" lines in 未完成
#   (2) normalized-identical text on >=2 open "- [ ]" lines in 未完成
# Exit 1: anchor missing/ambiguous, TASKS.md missing, or duplicate found (nothing written).
# Exit 0: moved, or nothing to move (no write). -DryRun: report counts, never write.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'lib\repo-text.ps1')

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

$tasksPath = Join-Path (Join-Path $WorkRoot "agency-os") "TASKS.md"
if (-not (Test-Path -LiteralPath $tasksPath)) {
    Write-Error "archive-completed-tasks: TASKS.md missing at $tasksPath"
    exit 1
}

$utf8 = [System.Text.UTF8Encoding]::new($false)
$lines = [System.Collections.Generic.List[string]]::new()
foreach ($l in [System.IO.File]::ReadAllLines($tasksPath, $utf8)) { $lines.Add($l) }

$openAnchor = '### 未完成'
$archiveAnchor = '## Next — 已完成歷程（查詢用）'

$openHits = @(for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].TrimEnd() -ceq $openAnchor) { $i } })
$archHits = @(for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].TrimEnd() -ceq $archiveAnchor) { $i } })
if ($openHits.Count -ne 1 -or $archHits.Count -ne 1) {
    Write-Error ("archive-completed-tasks: anchor must match exactly once (open '{0}': {1}, archive '{2}': {3}). Nothing written." -f $openAnchor, $openHits.Count, $archiveAnchor, $archHits.Count)
    exit 1
}
$openStart = [int]$openHits[0]
$archIdx = [int]$archHits[0]
if ($openStart -ge $archIdx) {
    Write-Error "archive-completed-tasks: '$openAnchor' (line $($openStart + 1)) is not before '$archiveAnchor' (line $($archIdx + 1)). Nothing written."
    exit 1
}

# --- duplicate gate on open tasks
$rxOpen = [regex]'^\s*-\s+\[ \]\s+(?<text>.*)$'
$rxHandoff = [regex]'handoffs[\\/](?<f>[A-Za-z0-9_.\-]+\.md)'
$byHandoff = @{}
$byText = @{}
for ($i = $openStart + 1; $i -lt $archIdx; $i++) {
    $m = $rxOpen.Match($lines[$i])
    if (-not $m.Success) { continue }
    foreach ($hm in $rxHandoff.Matches($m.Groups['text'].Value)) {
        $f = $hm.Groups['f'].Value
        if (-not $byHandoff.ContainsKey($f)) { $byHandoff[$f] = [System.Collections.Generic.HashSet[int]]::new() }
        [void]$byHandoff[$f].Add($i + 1)
    }
    $norm = ([regex]::Replace($m.Groups['text'].Value, '\s+', ' ')).Trim().ToLowerInvariant()
    if ($norm) {
        if (-not $byText.ContainsKey($norm)) { $byText[$norm] = [System.Collections.Generic.List[int]]::new() }
        $byText[$norm].Add($i + 1)
    }
}
$dups = New-Object System.Collections.Generic.List[string]
foreach ($k in $byHandoff.Keys) {
    if ($byHandoff[$k].Count -ge 2) {
        $dups.Add(("same handoff handoffs/{0} on open lines {1}" -f $k, ((@($byHandoff[$k]) | Sort-Object) -join ', ')))
    }
}
foreach ($k in $byText.Keys) {
    if ($byText[$k].Count -ge 2) {
        $dups.Add(("identical open task text on lines {0}: {1}" -f ($byText[$k] -join ', '), $(if ($k.Length -le 72) { $k } else { $k.Substring(0, 72) + '...' })))
    }
}
if ($dups.Count -gt 0) {
    Write-Error ("archive-completed-tasks: duplicate open tasks (resolve in TASKS.md; nothing written):`n  " + (($dups | Sort-Object) -join "`n  "))
    exit 1
}

# --- collect top-level [x] blocks inside 未完成
$rxDone = New-Object System.Text.RegularExpressions.Regex('^- \[x\]\s', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
$moveIdx = [System.Collections.Generic.List[int]]::new()
$blocks = 0
$i = $openStart + 1
while ($i -lt $archIdx) {
    if (-not $rxDone.IsMatch($lines[$i])) { $i++; continue }
    $block = [System.Collections.Generic.List[int]]::new()
    $block.Add($i)
    $i++
    while ($i -lt $archIdx) {
        $ln = $lines[$i]
        if ($ln -match '^[ \t]+\S') { $block.Add($i); $i++; continue }
        if ($ln.Trim().Length -eq 0) {
            $j = $i
            while ($j -lt $archIdx -and $lines[$j].Trim().Length -eq 0) { $j++ }
            if ($j -lt $archIdx -and $lines[$j] -match '^[ \t]+\S') {
                for ($k = $i; $k -lt $j; $k++) { $block.Add($k) }
                $i = $j
                continue
            }
        }
        break
    }
    # A checked parent that still holds an open child is not done: leave it in place, say so.
    $openChild = @($block | Where-Object { $lines[$_] -match '^[ \t]+- \[ \]' })
    if ($openChild.Count -gt 0) {
        Write-Host ("archive-completed-tasks: kept line {0} (checked, but open child at line {1})" -f ($block[0] + 1), ($openChild[0] + 1)) -ForegroundColor Yellow
        continue
    }
    $blocks++
    foreach ($k in $block) { $moveIdx.Add($k) }
}

if ($moveIdx.Count -eq 0) {
    Write-Host "archive-completed-tasks: nothing to archive (0 top-level [x] blocks in 未完成)." -ForegroundColor DarkGray
    exit 0
}

if ($DryRun) {
    Write-Host ("archive-completed-tasks: DRY RUN would move {0} blocks / {1} lines (file {2} lines)." -f $blocks, $moveIdx.Count, $lines.Count) -ForegroundColor Yellow
    exit 0
}

$moved = [System.Collections.Generic.List[string]]::new()
foreach ($ix in $moveIdx) { $moved.Add($lines[$ix]) }
for ($n = $moveIdx.Count - 1; $n -ge 0; $n--) { $lines.RemoveAt($moveIdx[$n]) }
$archIdx -= $moveIdx.Count   # every removed line sat before the archive anchor

$header = "### {0} — AO-CLOSE 自動歸檔" -f (Get-Date).ToString("yyyy-MM-dd")
$p = $archIdx + 1
while ($p -lt $lines.Count -and $lines[$p].Trim().Length -eq 0) { $p++ }
if ($p -lt $lines.Count -and $lines[$p].TrimEnd() -ceq $header) {
    # same-day rerun after new [x] appeared: extend the existing section
    $lines.InsertRange($p + 1, [string[]](@('') + $moved.ToArray()))
} else {
    $insert = [System.Collections.Generic.List[string]]::new()
    $insert.Add('')
    $insert.Add($header)
    $insert.Add('')
    $insert.AddRange($moved)
    $lines.InsertRange($archIdx + 1, $insert)
}

Write-RepoTextFile -Path $tasksPath -Content (($lines -join "`n") + "`n") -Atomic
Write-Host ("archive-completed-tasks: moved {0} blocks / {1} lines to the top of the archive section." -f $blocks, $moved.Count) -ForegroundColor Green
exit 0
