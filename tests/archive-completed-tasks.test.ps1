# Regression tests for scripts/archive-completed-tasks.ps1 (AO-CLOSE TASKS.md archive step).
#   A1  a top-level [x] block with no open child moves whole to the archive section; open items stay
#   A2  a [x] parent with open [ ] children is split (2026-10-23): parent + its other lines are archived
#       with a note; each open child (with its deeper lines) stays in place as a top-level [ ] plus an
#       "出自：" line; a [x] child goes with the parent; no [x] is left in 未完成
#   A3  -DryRun writes nothing; a file with no [x] in 未完成 is left byte-identical
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/archive-completed-tasks.test.ps1
# Fixtures live under $env:TEMP (never inside the repo). Exit 0 = all pass.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script = Join-Path $repoRoot 'scripts\archive-completed-tasks.ps1'

$script:pass = 0; $script:fail = 0
function Assert-True { param([bool]$Condition, [string]$Message)
    if ($Condition) { $script:pass++ } else { $script:fail++; Write-Host "  FAIL: $Message" -ForegroundColor Red } }

$utf8 = New-Object Text.UTF8Encoding($false)
function New-Fixture { param([string[]]$Lines)
    $root = Join-Path ([IO.Path]::GetTempPath()) ("archive-tasks-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $root 'agency-os') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $root 'agency-os\TASKS.md'), (($Lines -join "`n") + "`n"), $utf8)
    $root }
function Read-Tasks { param([string]$Root) [IO.File]::ReadAllText((Join-Path $Root 'agency-os\TASKS.md'), $utf8) }
function Invoke-Archive { param([string]$Root, [switch]$DryRun)
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script, '-WorkRoot', $Root)
    if ($DryRun) { $a += '-DryRun' }
    & powershell.exe @a *> $null
    $LASTEXITCODE }

$fixture = @(
    '# Global Task Board',
    '',
    '### 未完成',
    '',
    '- [ ] open one',
    '  - detail of open one',
    '- [x] **done plain**',
    '  - done detail',
    '- [x] **done parent** with work left',
    '  - parent note',
    '  - [x] finished child',
    '  - [ ] open child A',
    '    - A detail',
    '    - [x] A done grandchild',
    '  - parent tail note',
    '  - [ ] open child B',
    '- [ ] open two',
    '',
    '## Next — 已完成歷程（查詢用）',
    '',
    '### older',
    '- [x] old item',
    ''
)
# A1 + A2
$root = New-Fixture $fixture
try {
    $dayBefore = (Get-Date).ToString('yyyy-MM-dd')
    $code = Invoke-Archive $root
    $dayAfter = (Get-Date).ToString('yyyy-MM-dd')
    $L = (Read-Tasks $root) -split "`n"
    Assert-True ($code -eq 0) "A1 exit 0 (got $code)"
    $arch = [array]::IndexOf($L, '## Next — 已完成歷程（查詢用）')
    $open = $L[0..($arch - 1)]; $done = $L[$arch..($L.Count - 1)]
    # the script stamps its own date; a run across midnight may differ from either side's
    $hdr = @($done | Where-Object { $_ -match '^### (\d{4}-\d{2}-\d{2}) — AO-CLOSE 自動歸檔$' })
    $today = if ($hdr.Count -eq 1) { $hdr[0].Substring(4, 10) } else { '' }
    Assert-True ($today -eq $dayBefore -or $today -eq $dayAfter) "A1 one dated archive header (got '$($hdr -join '|')')"
    Assert-True (@($open | Where-Object { $_ -match '^- \[x\]' }).Count -eq 0) 'A2 no top-level [x] left in 未完成'
    Assert-True ($open -contains '- [ ] open one' -and $open -contains '- [ ] open two') 'A1 open items stay'
    Assert-True ($done -contains '- [x] **done plain**' -and $done -contains '  - done detail') 'A1 plain [x] block archived'
    Assert-True ($done -contains '- [x] **done parent** with work left') 'A2 parent archived'
    Assert-True ($done -contains '  - [x] finished child' -and $done -contains '  - parent tail note') 'A2 parent keeps its non-open lines'
    Assert-True ($done -contains "  - 未完成子項已拆成獨立項，留在未完成區（$today）") 'A2 archived parent notes the split'
    $ia = [array]::IndexOf($open, '- [ ] open child A')
    Assert-True ($ia -ge 0 -and $open[$ia + 1] -eq '  - A detail') 'A2 child A promoted with its detail dedented'
    # an [x] inside an open item stays with it (same rule as [x] children of any open parent)
    Assert-True ($ia -ge 0 -and $open[$ia + 2] -eq '  - [x] A done grandchild') 'A2 child A keeps its [x] grandchild'
    $from = "  - 出自：done parent with work left（母項已完成，$today 歸檔）"
    Assert-True ($ia -ge 0 -and $open[$ia + 3] -eq $from) "A2 child A gets the 出自 line (got '$($open[$ia + 3])')"
    $ib = [array]::IndexOf($open, '- [ ] open child B')
    Assert-True ($ib -gt $ia -and $open[$ib + 1] -eq $from) 'A2 child B promoted with the 出自 line'
    Assert-True ($ib -lt [array]::IndexOf($open, '- [ ] open two')) 'A2 promoted children stay where the parent was'
    Assert-True (@($done | Where-Object { $_ -match '\[ \] open child' }).Count -eq 0) 'A2 no open child in the archive'
    Assert-True ($done -contains '- [x] old item') 'A1 older archive kept'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }

# A3
$root = New-Fixture $fixture
try {
    $before = Read-Tasks $root
    $code = Invoke-Archive $root -DryRun
    Assert-True ($code -eq 0 -and (Read-Tasks $root) -ceq $before) 'A3 -DryRun writes nothing'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
$root = New-Fixture @('### 未完成', '', '- [ ] only open', '  - [x] done child inside open parent', '', '## Next — 已完成歷程（查詢用）', '')
try {
    $before = Read-Tasks $root
    $code = Invoke-Archive $root
    Assert-True ($code -eq 0 -and (Read-Tasks $root) -ceq $before) 'A3 nothing to archive leaves the file unchanged'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }

Write-Host ("archive-completed-tasks tests: {0} passed, {1} failed" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 }
exit 0
