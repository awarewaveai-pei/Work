# Shared-worktree readiness: real Git state, real audit, and AO child-argument wiring.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/ao-resume-readiness.test.ps1
# All repositories, tool stubs and fake vault data live in one unique TEMP directory.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $repoRoot 'scripts\lib\git-safe-ops.ps1')
$script:passed = 0
$script:failed = 0
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('ao-readiness-' + [guid]::NewGuid().ToString('N'))
$oldPath = $env:PATH
$oldLocalAppData = $env:LOCALAPPDATA
$oldLocation = (Get-Location).Path
$utf8 = New-Object Text.UTF8Encoding($false)

function Assert-True { param([bool]$Condition, [string]$Message)
    if ($Condition) { $script:passed++ } else { $script:failed++; Write-Host ('FAIL: ' + $Message) }
}
function Set-File { param([string]$Path, [string]$Text)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path)) | Out-Null
    [IO.File]::WriteAllText($Path, $Text, $utf8)
}
function G { param([string]$Root, [string[]]$GitArgs)
    $r = Invoke-SafeGitCapture -WorkRoot $Root -GitArgs $GitArgs
    if ($r.ExitCode -ne 0) { throw ('fixture git failed: ' + ($GitArgs -join ' ') + ': ' + $r.Text) }
    return $r.Text.Trim()
}
function New-Repo { param([string]$Name)
    $root = Join-Path $tmp $Name
    [IO.Directory]::CreateDirectory($root) | Out-Null
    G $root @('-c', 'init.defaultBranch=main', 'init', '-q') | Out-Null
    G $root @('config', 'core.autocrlf', 'false') | Out-Null
    G $root @('config', 'core.hooksPath', (Join-Path $tmp 'empty-hooks')) | Out-Null
    Set-File (Join-Path $root 'tracked.txt') "base`n"
    G $root @('add', 'tracked.txt') | Out-Null
    G $root @('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture') | Out-Null
    G $root @('update-ref', 'refs/remotes/origin/main', 'HEAD') | Out-Null
    return $root
}
function New-Conflict { param([string]$Root)
    $blob = G $Root @('rev-parse', 'HEAD:tracked.txt')
    $lines = @("0 $blob`ttracked.txt", "100644 $blob 1`ttracked.txt", "100644 $blob 2`ttracked.txt", "100644 $blob 3`ttracked.txt")
    # Git index-info is LF-delimited; a PS5.1 native pipeline appends CRLF to paths.
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = (Get-Command git).Source
    $start.Arguments = '-C "' + $Root + '" update-index --index-info'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $process = [Diagnostics.Process]::Start($start)
    try {
        $process.StandardInput.Write(($lines -join "`n") + "`n")
        $process.StandardInput.Close()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw 'fixture conflict setup failed' }
    } finally { $process.Dispose() }
}
function Snapshot { param([string]$Root)
    return ((Get-FileHash -LiteralPath (Join-Path $Root '.git\index')).Hash + ':' +
        (Get-FileHash -LiteralPath (Join-Path $Root 'tracked.txt')).Hash + ':' +
        (G $Root @('stash', 'list')))
}
function Run-Audit { param([string]$Root, [switch]$AllowDirty)
    $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repoRoot 'scripts\machine-environment-audit.ps1'), '-WorkRoot', $Root, '-Strict')
    if ($AllowDirty) { $argv += '-AllowUnexpectedDirty' }
    $output = @(& powershell.exe @argv 2>&1)
    return [pscustomobject]@{ Exit = $LASTEXITCODE; Text = ($output -join "`n") }
}

try {
    [IO.Directory]::CreateDirectory($tmp) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $tmp 'empty-hooks')) | Out-Null
    Assert-True ([bool](Get-Command Get-GitWorktreeState -ErrorAction SilentlyContinue)) 'shared state helper exists'
    if (-not (Get-Command Get-GitWorktreeState -ErrorAction SilentlyContinue)) { throw 'Get-GitWorktreeState missing' }

    $root = New-Repo 'state'
    $before = Snapshot $root
    $s = Get-GitWorktreeState -WorkRoot $root
    Assert-True (-not $s.Dirty -and -not $s.HasConflicts) 'clean state'
    Assert-True ((Snapshot $root) -eq $before) 'clean query preserves index, bytes and stash'
    Set-File (Join-Path $root 'tracked.txt') "local`n"
    $before = Snapshot $root
    $s = Get-GitWorktreeState -WorkRoot $root
    Assert-True ($s.Dirty -and -not $s.HasConflicts) 'unstaged changes are not conflicts'
    Assert-True ((Snapshot $root) -eq $before) 'dirty query preserves index, bytes and stash'
    G $root @('add', 'tracked.txt') | Out-Null
    $before = Snapshot $root
    $s = Get-GitWorktreeState -WorkRoot $root
    Assert-True ($s.Dirty -and -not $s.HasConflicts) 'staged changes are not conflicts'
    Assert-True ((Snapshot $root) -eq $before) 'staged query preserves index, bytes and stash'
    G $root @('read-tree', 'HEAD') | Out-Null
    Set-File (Join-Path $root 'tracked.txt') "base`n"
    Set-File (Join-Path $root 'untracked.txt') "new`n"
    $s = Get-GitWorktreeState -WorkRoot $root
    Assert-True ($s.Dirty -and -not $s.HasConflicts) 'untracked files are not conflicts'
    Assert-True (@($s.StatusLines | Where-Object { -not $_ }).Count -eq 0) 'status lines contain no empty records'
    New-Conflict $root
    $before = Snapshot $root
    $s = Get-GitWorktreeState -WorkRoot $root
    Assert-True ($s.Dirty -and $s.HasConflicts) 'unmerged index is a conflict'
    Assert-True ((Snapshot $root) -eq $before) 'conflict query preserves index, bytes and stash'
    $notRepo = Join-Path $tmp 'not-repo'
    [IO.Directory]::CreateDirectory($notRepo) | Out-Null
    $threw = $false
    try { Get-GitWorktreeState -WorkRoot $notRepo | Out-Null } catch { $threw = $true }
    Assert-True $threw 'Git state query failure throws rather than declaring clean'

    # Deterministic local tool/vault fixtures. No external auth or real secret files are read.
    $bin = Join-Path $tmp 'bin'
    Set-File (Join-Path $bin 'node.cmd') "@echo off`r`necho v24.0.0`r`n"
    Set-File (Join-Path $bin 'npm.cmd') "@echo off`r`necho 11.0.0`r`n"
    Set-File (Join-Path $bin 'gh.cmd') "@echo off`r`necho Logged in fixture`r`n"
    $env:PATH = $bin + ';' + $oldPath
    $env:LOCALAPPDATA = Join-Path $tmp 'profile'
    Set-File (Join-Path $env:LOCALAPPDATA 'AgencyOS\secrets\vault.json') '{"secrets":{"fixture":"fake"}}'
    $auditRoot = New-Repo 'audit'
    [IO.Directory]::CreateDirectory((Join-Path $auditRoot 'agency-os')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $auditRoot 'lobster-factory\packages\workflows\node_modules')) | Out-Null
    Set-File (Join-Path $auditRoot 'scripts\verify-build-gates.ps1') 'exit 0'
    Set-File (Join-Path $auditRoot 'lobster-factory\packages\workflows\package-lock.json') '{}'
    $r = Run-Audit $auditRoot
    Assert-True ($r.Exit -ne 0 -and $r.Text -match 'Working tree is dirty') 'standalone strict audit still rejects dirty state'
    $before = Snapshot $auditRoot
    $r = Run-Audit $auditRoot -AllowDirty
    Assert-True ($r.Exit -eq 0) ('shared-worktree audit allows dirty state: ' + $r.Text)
    Assert-True ((Snapshot $auditRoot) -eq $before) 'audit preserves index, bytes and stash'
    Remove-Item -LiteralPath (Join-Path $auditRoot 'lobster-factory\packages\workflows\package-lock.json')
    $r = Run-Audit $auditRoot -AllowDirty
    Assert-True ($r.Exit -ne 0 -and $r.Text -match 'no package-lock.json') 'allow-dirty does not waive unrelated Strict warnings'
    Set-File (Join-Path $auditRoot 'lobster-factory\packages\workflows\package-lock.json') '{}'
    New-Conflict $auditRoot
    $r = Run-Audit $auditRoot -AllowDirty
    Assert-True ($r.Exit -ne 0 -and $r.Text -match '(?i)conflict|unmerged') 'allow-dirty audit rejects unresolved conflicts'

    $syncRoot = New-Repo 'sync'
    $origin = Join-Path $tmp 'origin.git'
    G $syncRoot @('clone', '-q', '--bare', $syncRoot, $origin) | Out-Null
    G $syncRoot @('remote', 'add', 'origin', $origin) | Out-Null
    Set-File (Join-Path $syncRoot 'tracked.txt') "preserved`n"
    $before = Snapshot $syncRoot
    $syncScript = Join-Path $repoRoot 'scripts\check-three-way-sync.ps1'
    $output = @(& powershell.exe -NoProfile -File $syncScript -WorkRoot $syncRoot -AutoFix -SkipVerify -AllowUnexpectedDirty 2>&1)
    Assert-True ($LASTEXITCODE -eq 0) ('shared sync accepts preserved work: ' + ($output -join "`n"))
    Assert-True ((Snapshot $syncRoot) -eq $before) 'shared sync preserves index, bytes and stash'
    Set-File (Join-Path $syncRoot 'scripts\verify-build-gates.ps1') 'exit 7'
    $output = @(& powershell.exe -NoProfile -File $syncScript -WorkRoot $syncRoot -AllowUnexpectedDirty 2>&1)
    Assert-True ($LASTEXITCODE -ne 0 -and ($output -join "`n") -match 'Exit code 7') 'allow-dirty sync retains correctness failures'
    New-Conflict $syncRoot
    $savedEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = @(& powershell.exe -NoProfile -File $syncScript -WorkRoot $syncRoot -AutoFix -SkipVerify -AllowUnexpectedDirty 2>&1) }
    finally { $ErrorActionPreference = $savedEap }
    Assert-True ($LASTEXITCODE -ne 0 -and ($output -join "`n") -match 'unresolved merge conflicts') 'shared sync rejects conflicts before autofix'

    # Execute the real AO script with only its required children replaced by argument probes.
    $aoRoot = New-Repo 'ao'
    Set-File (Join-Path $aoRoot 'agency-os\docs\operations\rules-version-and-enforcement.md') 'Version: 2026-10-27.1'
    Set-File (Join-Path $aoRoot 'agency-os\.agency-state\monthly-checks-last.txt') ([DateTime]::UtcNow.ToString('o'))
    $probe = @'
param([string]$WorkRoot, [switch]$AutoFix, [switch]$AllowUnexpectedDirty, [switch]$AllowStashBeforePull, [switch]$AllowPendingStash, [switch]$FetchOrigin, [switch]$Strict)
@{allow=[bool]$AllowUnexpectedDirty; stash=[bool]$AllowStashBeforePull; pending=[bool]$AllowPendingStash; strict=[bool]$Strict} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $WorkRoot ($MyInvocation.MyCommand.Name + '.json'))
exit 0
'@
    Set-File (Join-Path $aoRoot 'scripts\check-three-way-sync.ps1') $probe
    Set-File (Join-Path $aoRoot 'scripts\machine-environment-audit.ps1') $probe
    foreach ($explicitAllow in @($false, $true)) {
        $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repoRoot 'scripts\ao-resume.ps1'), '-WorkRoot', $aoRoot)
        if ($explicitAllow) { $argv += '-AllowUnexpectedDirty' }
        $output = @(& powershell.exe @argv 2>&1)
        Assert-True ($LASTEXITCODE -eq 0) ('AO fixture completes: ' + ($output -join "`n"))
        $preflight = Get-Content -LiteralPath (Join-Path $aoRoot 'check-three-way-sync.ps1.json') -Raw | ConvertFrom-Json
        $audit = Get-Content -LiteralPath (Join-Path $aoRoot 'machine-environment-audit.ps1.json') -Raw | ConvertFrom-Json
        Assert-True ($preflight.allow -and -not $preflight.stash -and -not $preflight.pending) ('AO allows dirty without implicit stash; explicit=' + $explicitAllow)
        Assert-True ($audit.allow -and $audit.strict) ('AO retains Strict and allows dirty; explicit=' + $explicitAllow)
    }

    # Real PS5.1 hook -> native -File binding, with a sentinel child (no network).
    # One conditional argument used to unwrap to String and fail before child execution.
    Set-File (Join-Path $aoRoot 'scripts\ao-resume.ps1') @'
param([switch]$FullMainlineParity, [switch]$WriteArchiveSkeleton)
@{parity=[bool]$FullMainlineParity; skeleton=[bool]$WriteArchiveSkeleton} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $PSScriptRoot '..\hook-child.json')
exit 0
'@
    $hook = Join-Path $repoRoot 'mcp\claude-userlevel\hooks\ao-resume-on-prompt.ps1'
    foreach ($explicitResume in @($true, $false)) {
        $prompt = if ($explicitResume) { 'AO-RESUME' } else { 'new fixture session' }
        $payload = @{prompt=$prompt; session_id=[guid]::NewGuid().ToString(); workspace_roots=@($aoRoot)} | ConvertTo-Json -Compress
        $output = @($payload | & powershell.exe -NoProfile -File $hook -HookHost claude 2>&1)
        $meta = Get-Content -LiteralPath (Join-Path $aoRoot 'agency-os\.agency-state\ao-resume-hook-last.json') -Raw | ConvertFrom-Json
        Assert-True ($meta.exit_code -eq 0) ('hook child starts in PS5.1; explicit=' + $explicitResume + ': ' + $meta.log_tail)
        $child = Get-Content -LiteralPath (Join-Path $aoRoot 'hook-child.json') -Raw | ConvertFrom-Json
        Assert-True ($child.parity -and $child.skeleton -eq $explicitResume) 'hook preserves zero/one argument cardinality'
    }
} catch {
    $script:failed++
    Write-Host ('FAIL: ' + $_.Exception.Message)
    Write-Host $_.ScriptStackTrace
} finally {
    $env:PATH = $oldPath
    $env:LOCALAPPDATA = $oldLocalAppData
    Set-Location -LiteralPath $oldLocation
    # Remove only this test's absolute, GUID-scoped TEMP tree.
    $resolvedTmp = [IO.Path]::GetFullPath($tmp)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTmp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolvedTmp) -match '^ao-readiness-[a-f0-9]{32}$' -and (Test-Path -LiteralPath $resolvedTmp)) {
        Remove-Item -LiteralPath $resolvedTmp -Recurse -Force
    }
}
Write-Host ('ao-resume-readiness: {0} passed, {1} failed' -f $script:passed, $script:failed)
exit $(if ($script:failed -eq 0) { 0 } else { 1 })
