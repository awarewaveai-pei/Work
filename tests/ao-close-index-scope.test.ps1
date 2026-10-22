# Regression tests for AO-CLOSE commit scope (2026-10-23: sync commit 6c5572280 untracked 5
# oracle reports another session had `git rm --cached`-ed).
#   I1  a staged deletion whose file is still on disk (porcelain `D  f` + `?? f`) is foreign
#       (Get-AoCloseStagePaths in scripts/ao-close.ps1)
#   I2  the index splits into what this session may commit and the rest; an own rename's old
#       path counts as its own (Get-AoCloseCommitScope)
#   I3  the commit carries ONLY the scope snapshot, whatever else sits in (or later leaves) the
#       shared index, and leaves the rest staged (Invoke-AoCloseScopedCommit)
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/ao-close-index-scope.test.ps1
# Fixtures live under $env:TEMP (never inside the repo). Exit 0 = all pass.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $repoRoot 'scripts\_console-encoding-helpers.ps1')

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ao-close-index-scope-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

# ao-close.ps1 is a script, not a library: load just these functions. Dot-sourced from a file
# (not a scriptblock) so their $PSScriptRoot is non-empty; no verify-sid-shared.ps1 sits there,
# so no session tracker is read.
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repoRoot 'scripts\ao-close.ps1'), [ref]$null, [ref]$null)
foreach ($n in 'Get-AoCloseStagePaths', 'Get-AoCloseCommitScope', 'New-AoCloseScopedIndex', 'Invoke-AoCloseScopedCommit') {
    $fn = $ast.Find({ param($a) $a -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq $n }, $true)
    if (-not $fn) { throw "function $n not found in scripts/ao-close.ps1" }
    $f = Join-Path $tmp "$n.ps1"
    [IO.File]::WriteAllText($f, $fn.Extent.Text, (New-Object Text.UTF8Encoding($true)))
    . $f
}

$script:pass = 0; $script:fail = 0
function Assert-True { param([bool]$Condition, [string]$Message)
    if ($Condition) { $script:pass++ } else { $script:fail++; Write-Host "  FAIL: $Message" -ForegroundColor Red } }
function G { param([string[]]$A) $o = & git -c user.email=t@t -c user.name=t @A; if ($LASTEXITCODE -ne 0) { throw "git $($A -join ' ') failed" }; $o }
function W { param([string]$P, [string]$T) [IO.File]::WriteAllText((Join-Path $repo $P), $T) }

$repo = Join-Path $tmp 'repo'
New-Item -ItemType Directory -Path $repo -Force | Out-Null
Push-Location $repo
try {
    G @('init', '-q') | Out-Null; G @('config', 'core.autocrlf', 'false') | Out-Null
    G @('config', 'user.email', 't@t') | Out-Null; G @('config', 'user.name', 't') | Out-Null
    foreach ($p in 'f.md', 'A.md', 'B.md', 'D.md') { W $p "$p line 1`n$p line 2`n$p line 3`n" }
    G @('add', '-A') | Out-Null; G @('commit', '-q', '-m', 'init') | Out-Null
    G @('rm', '-q', '--cached', 'f.md') | Out-Null   # another session untracks f.md; file stays on disk
    $baseline = (Invoke-WithUtf8Console { git -c core.quotepath=false status --porcelain -z --untracked-files=all }) -join ''
    W 'A.md' "A.md v2`n"                              # this run's pipeline output
    G @('mv', 'B.md', 'C.md') | Out-Null              # this session's own rename ...
    W 'C.md' "rewritten completely`n"                 # ... with the content replaced (no longer an R entry)
    G @('add', '--', 'C.md') | Out-Null

    $r = Get-AoCloseStagePaths -RepoRoot $repo -BaselineStatusRawZ $baseline
    Assert-True (@($r.ForeignStagedAtBaseline) -contains 'f.md') 'I1 staged deletion with file on disk is foreign'
    Assert-True (@($r.StagePaths) -contains 'A.md') 'I1 pipeline edit is staged'

    G @('add', '--', 'A.md') | Out-Null
    W 'E.md' "foreign`n"; G @('add', '--', 'E.md') | Out-Null   # another session stages after the scope check
    # the tracker (--no-renames) records both sides of the session's own rename
    $scope = Get-AoCloseCommitScope -RepoRoot $repo -AllowedPaths @('A.md', 'B.md', 'C.md')
    $scopePaths = @($scope.Commit | ForEach-Object { $_.Path }) -join ','
    Assert-True ($scopePaths -eq 'A.md,B.md,C.md') "I2 commit set is own paths only (got '$scopePaths')"
    Assert-True ((@($scope.Leaked) -contains 'f.md') -and (@($scope.Leaked) -contains 'E.md')) 'I2 foreign deletion and late foreign add are left out'
    $mvOnly = Get-AoCloseCommitScope -RepoRoot $repo -AllowedPaths @('C.md')
    Assert-True (-not (@($mvOnly.Leaked) -contains 'C.md')) 'I2 allowed new path never reported'

    $idx = New-AoCloseScopedIndex -RepoRoot $repo -Entries @($scope.Commit)
    Assert-True ([bool]$idx) 'I3 scoped index built'
    # what every staged-content gate sees (they run with GIT_INDEX_FILE = the scoped index)
    $env:GIT_INDEX_FILE = $idx
    $gateView = @(G @('diff', '--cached', '--name-only', '--no-renames') | Where-Object { $_ }) -join ','
    Remove-Item Env:\GIT_INDEX_FILE
    Assert-True ($gateView -eq 'A.md,B.md,C.md') "I3 gates see only this session's paths (got '$gateView')"
    G @('reset', '-q', '--', 'A.md') | Out-Null   # another session unstages A.md after the scope snapshot
    $exit = Invoke-AoCloseScopedCommit -RepoRoot $repo -IndexFile $idx -Message 'sync' -Quiet
    Assert-True ($exit -eq 0) "I3 scoped commit exits 0 (got '$exit')"
    $files = @(G @('show', '--name-status', '--no-renames', '--format=', 'HEAD') | Where-Object { $_ })
    Assert-True (($files -join ';') -eq "M`tA.md;D`tB.md;A`tC.md") ("I3 commit = snapshot: A.md modified (not deleted by the late unstage), B.md deletion, C.md (got '" + ($files -join ';') + "')")
    $after = @(G @('-c', 'core.quotepath=false', 'diff', '--cached', '--name-status', '--no-renames') | Where-Object { $_ })
    # A.md: the other session's unstage stays theirs (old blob vs new HEAD); nothing was rewritten
    Assert-True (($after -join ';') -eq "M`tA.md;A`tE.md;D`tf.md") ("I3 shared index untouched by the commit (got '" + ($after -join ';') + "')")
    Assert-True (Test-Path (Join-Path $repo 'f.md')) 'I3 f.md left on disk'
} finally { Pop-Location }

Write-Host ("ao-close-index-scope: {0} passed, {1} failed" -f $script:pass, $script:fail)
exit $script:fail
