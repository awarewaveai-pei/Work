# Regression tests for the shared-worktree AO-RESUME invariants (2026-09-23 churn incident).
#   I1  a session auto-triggers AO-RESUME at most once, however many sessions interleave
#       (Test-/Add-AoResumeSessionSeen in mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1)
#   I2  automatic mainline parity never stashes / resets / checks out / pushes: fetch + ff-only,
#       and git's own refusal to overwrite a dirty file is reported, not worked around
#       (Invoke-SharedWorktreeParity in scripts/lib/git-safe-ops.ps1)
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/ao-resume-shared-worktree.test.ps1
# All fixtures live under $env:TEMP (never inside the repo). Exit 0 = all pass.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $repoRoot 'scripts\lib\git-safe-ops.ps1')
. (Join-Path $repoRoot 'mcp\claude-userlevel\hooks\ao-resume-on-prompt.ps1')   # library mode: functions only

$script:pass = 0; $script:fail = 0
function Assert-True { param([bool]$Condition, [string]$Message)
    if ($Condition) { $script:pass++ } else { $script:fail++; Write-Host "  FAIL: $Message" -ForegroundColor Red } }
function Assert-Eq { param($Got, $Want, [string]$Message)
    Assert-True ($Got -eq $Want) ("$Message (want '$Want', got '$Got')") }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ao-resume-shared-worktree-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

function G { param([string]$Dir, [string[]]$A)
    $r = Invoke-SafeGitCapture -GitArgs (@('-c', 'user.email=t@t', '-c', 'user.name=t') + $A) -WorkRoot $Dir
    if ($r.ExitCode -ne 0) { throw "git $($A -join ' ') failed: $($r.Text)" }
    return $r.Text.Trim() }
function Set-File { param([string]$Path, [string]$Text)
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false))) }
function Read-File { param([string]$Path) return [IO.File]::ReadAllText($Path) }
function New-Fixture { param([string]$Name)
    # bare origin + the worktree under test + a second clone that advances origin
    $bare = Join-Path $tmp "$Name-origin.git"; $wt = Join-Path $tmp "$Name-wt"; $other = Join-Path $tmp "$Name-other"
    $null = Invoke-SafeGitCapture -GitArgs @('init', '-q', '--bare', '-b', 'main', $bare)
    $null = Invoke-SafeGitCapture -GitArgs @('-c', 'core.autocrlf=false', 'clone', '-q', $bare, $wt)   # LF end-to-end: byte-exact assertions on Windows
    G $wt @('config', 'core.autocrlf', 'false') | Out-Null
    Set-File (Join-Path $wt 'a.txt') "a1`n"; Set-File (Join-Path $wt 'b.txt') "b1`n"
    G $wt @('add', '-A') | Out-Null; G $wt @('commit', '-q', '-m', 'init') | Out-Null; G $wt @('push', '-q', '-u', 'origin', 'main') | Out-Null
    $null = Invoke-SafeGitCapture -GitArgs @('-c', 'core.autocrlf=false', 'clone', '-q', $bare, $other)
    G $other @('config', 'core.autocrlf', 'false') | Out-Null
    return [pscustomobject]@{ Bare = $bare; Wt = $wt; Other = $other } }
function Advance-Origin { param($F, [string]$File, [string]$Text)
    Set-File (Join-Path $F.Other $File) $Text
    G $F.Other @('add', '-A') | Out-Null; G $F.Other @('commit', '-q', '-m', "origin: $File") | Out-Null; G $F.Other @('push', '-q', 'origin', 'main') | Out-Null }
function Count-Reflog { param([string]$Dir) return @((Invoke-SafeGitCapture -GitArgs @('reflog') -WorkRoot $Dir).Output | Where-Object { $_ }).Count }
function Count-Stash  { param([string]$Dir) return @((Invoke-SafeGitCapture -GitArgs @('stash', 'list') -WorkRoot $Dir).Output | Where-Object { $_ }).Count }
function Origin-Main  { param($F) return (G $F.Other @('ls-remote', 'origin', 'refs/heads/main')) }

try {
    # ---------------- I1: seen-session ledger ----------------
    $ledger = Join-Path $tmp 'seen.txt'
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $ledger -SessionId 'A') $false 'L1 unknown id is not seen (first prompt triggers)'
    Add-AoResumeSessionSeen -LedgerPath $ledger -SessionId 'A'
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $ledger -SessionId 'A') $true 'L2 recorded id is seen'
    Add-AoResumeSessionSeen -LedgerPath $ledger -SessionId 'B'
    # Interleaving A,B,A,B: after each first prompt the id stays seen -> exactly one trigger per session.
    # (With the old single "last id" file, A's second prompt would look new again because B was last.)
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $ledger -SessionId 'A') $true 'L3 A still seen after B was recorded (no ping-pong)'
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $ledger -SessionId 'B') $true 'L3 B seen'
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $ledger -SessionId '') $true 'L4 empty id never auto-triggers'
    Add-AoResumeSessionSeen -LedgerPath $ledger -SessionId 'A'
    Assert-Eq @([IO.File]::ReadAllLines($ledger)).Count 2 'L5 duplicate add does not grow the ledger'
    1..600 | ForEach-Object { Add-AoResumeSessionSeen -LedgerPath $ledger -SessionId "s$_" -MaxEntries 500 }
    Assert-Eq @([IO.File]::ReadAllLines($ledger)).Count 500 'L6 ledger trimmed to MaxEntries'
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $ledger -SessionId 's600') $true 'L6 newest id kept'
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $ledger -SessionId 'A') $false 'L6 oldest id dropped'
    $asDir = Join-Path $tmp 'ledger-as-dir'; New-Item -ItemType Directory -Path $asDir | Out-Null
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $asDir -SessionId 'Z') $true 'L7 unreadable ledger fails safe (treated as seen)'
    $newDirLedger = Join-Path $tmp 'sub\dir\seen.txt'
    Add-AoResumeSessionSeen -LedgerPath $newDirLedger -SessionId 'C'
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $newDirLedger -SessionId 'C') $true 'L8 missing parent directory is created'
    # Register = atomic check-and-record: first call $true, every later call $false
    $reg = Join-Path $tmp 'reg.txt'
    Assert-Eq (Register-AoResumeSession -LedgerPath $reg -SessionId 'R1') $true  'L9 first registration triggers'
    Assert-Eq (Register-AoResumeSession -LedgerPath $reg -SessionId 'R1') $false 'L9 second prompt of the same session does not'
    Assert-Eq (Register-AoResumeSession -LedgerPath $reg -SessionId 'R2') $true  'L9 another session triggers once'
    Assert-Eq (Register-AoResumeSession -LedgerPath $reg -SessionId 'R1') $false 'L9 interleaved R1 still registered'
    Assert-Eq (Register-AoResumeSession -LedgerPath $reg -SessionId '') $false   'L9 empty id never triggers'
    # unwritable ledger => not registered => no trigger (and no per-prompt re-trigger loop)
    Assert-Eq (Register-AoResumeSession -LedgerPath $asDir -SessionId 'R3') $false 'L10 unwritable ledger => no trigger'
    Assert-Eq (Add-AoResumeSessionSeen -LedgerPath $asDir -SessionId 'R3') $false  'L10 Add reports the failed write'
    # mutex held by ANOTHER PROCESS (a Windows mutex is re-entrant for the owning thread, so it
    # must be held out-of-process to block) => Register waits, times out, and fails safe ($false)
    $holder = Start-Process -FilePath 'powershell.exe' -PassThru -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        "`$m = New-Object System.Threading.Mutex(`$true, 'AwareWave.AoResume.SeenSessions'); Start-Sleep -Seconds 4; `$m.ReleaseMutex()")
    Start-Sleep -Milliseconds 1500   # let the holder acquire it
    Assert-Eq (Register-AoResumeSession -LedgerPath $reg -SessionId 'R4' -MutexTimeoutMs 200) $false 'L11 mutex held by another process => no trigger'
    Assert-Eq (Test-AoResumeSessionSeen -LedgerPath $reg -SessionId 'R4') $false 'L11 nothing recorded while blocked'
    $holder.WaitForExit(15000) | Out-Null
    Assert-Eq (Register-AoResumeSession -LedgerPath $reg -SessionId 'R4') $true 'L11 registers once the mutex is free'

    # ---------------- I2: parity ----------------
    # P1 clean + behind -> fast-forward
    $f = New-Fixture 'p1'; Advance-Origin $f 'a.txt' "a2`n"
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'fast-forward' 'P1 action'; Assert-True $r.Ok 'P1 ok'
    Assert-Eq (G $f.Wt @('rev-parse', 'HEAD')) (G $f.Wt @('rev-parse', 'origin/main')) 'P1 HEAD == origin/main'
    Assert-Eq (Count-Stash $f.Wt) 0 'P1 no stash created'

    # P2 tracked-dirty file NOT touched upstream + behind -> ff applied, local edit preserved
    $f = New-Fixture 'p2'; Advance-Origin $f 'a.txt' "a2`n"; Set-File (Join-Path $f.Wt 'b.txt') "b-local`n"
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'fast-forward' 'P2 action'; Assert-Eq $r.TrackedDirty 1 'P2 tracked_dirty counted'
    Assert-Eq (Read-File (Join-Path $f.Wt 'b.txt')) "b-local`n" 'P2 local edit untouched'
    Assert-Eq (Read-File (Join-Path $f.Wt 'a.txt')) "a2`n" 'P2 upstream change applied'
    Assert-Eq (Count-Stash $f.Wt) 0 'P2 no stash'

    # P3 tracked-dirty file that upstream ALSO changed -> ff refused, nothing touched
    $f = New-Fixture 'p3'; Advance-Origin $f 'a.txt' "a2`n"; Set-File (Join-Path $f.Wt 'a.txt') "a-local`n"
    $head = G $f.Wt @('rev-parse', 'HEAD'); $rl = Count-Reflog $f.Wt
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'ff-refused' 'P3 action'; Assert-True (-not $r.Ok) 'P3 not ok'
    Assert-Eq (Read-File (Join-Path $f.Wt 'a.txt')) "a-local`n" 'P3 local edit untouched'
    Assert-Eq (G $f.Wt @('rev-parse', 'HEAD')) $head 'P3 HEAD unchanged'
    Assert-Eq (Count-Reflog $f.Wt) $rl 'P3 no reflog entry (no reset / checkout happened)'
    Assert-Eq (Count-Stash $f.Wt) 0 'P3 no stash'

    # P4 staged change on an untouched file + behind -> ff applied, index preserved
    $f = New-Fixture 'p4'; Advance-Origin $f 'a.txt' "a2`n"; Set-File (Join-Path $f.Wt 'b.txt') "b-staged`n"; G $f.Wt @('add', 'b.txt') | Out-Null
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'fast-forward' 'P4 action'
    Assert-Eq (G $f.Wt @('diff', '--cached', '--name-only')) 'b.txt' 'P4 staged file still staged'

    # P5 ahead (unpushed local commit), not behind -> report only, NO push
    $f = New-Fixture 'p5'; Set-File (Join-Path $f.Wt 'b.txt') "b2`n"; G $f.Wt @('commit', '-q', '-am', 'local') | Out-Null
    $originBefore = Origin-Main $f
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'ahead' 'P5 action'; Assert-Eq $r.Ahead 1 'P5 ahead=1'; Assert-True $r.Ok 'P5 ok (nothing to pull)'
    Assert-Eq (Origin-Main $f) $originBefore 'P5 origin was not pushed to'

    # P6 diverged -> report only
    $f = New-Fixture 'p6'; Advance-Origin $f 'a.txt' "a2`n"; Set-File (Join-Path $f.Wt 'b.txt') "b2`n"; G $f.Wt @('commit', '-q', '-am', 'local') | Out-Null
    $head = G $f.Wt @('rev-parse', 'HEAD')
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'diverged' 'P6 action'; Assert-Eq (G $f.Wt @('rev-parse', 'HEAD')) $head 'P6 HEAD unchanged'
    Assert-Eq $r.Ahead 1 'P6 ahead=1'; Assert-Eq $r.Behind 1 'P6 behind=1'

    # P7 not on main -> report only, branch untouched
    $f = New-Fixture 'p7'; Advance-Origin $f 'a.txt' "a2`n"; G $f.Wt @('checkout', '-q', '-b', 'feature') | Out-Null
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'not-on-branch' 'P7 action'
    Assert-Eq (G $f.Wt @('rev-parse', '--abbrev-ref', 'HEAD')) 'feature' 'P7 branch untouched'

    # P8 up-to-date
    $f = New-Fixture 'p8'
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'up-to-date' 'P8 action'; Assert-True $r.Ok 'P8 ok'

    # P9 origin unreachable -> fetch-failed, nothing touched (1 attempt so the test does not sleep)
    $f = New-Fixture 'p9'; Set-File (Join-Path $f.Wt 'b.txt') "b-local`n"; Remove-Item -LiteralPath $f.Bare -Recurse -Force
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt -FetchMaxAttempts 1
    Assert-Eq $r.Action 'fetch-failed' 'P9 action'; Assert-True (-not $r.Ok) 'P9 not ok'
    Assert-Eq (Read-File (Join-Path $f.Wt 'b.txt')) "b-local`n" 'P9 local edit untouched'

    # P10 untracked file that an upstream commit would create -> ff refused, file untouched
    $f = New-Fixture 'p10'; Advance-Origin $f 'c.txt' "c-origin`n"; Set-File (Join-Path $f.Wt 'c.txt') "c-local-untracked`n"
    $r = Invoke-SharedWorktreeParity -WorkRoot $f.Wt
    Assert-Eq $r.Action 'ff-refused' 'P10 action'
    Assert-Eq (Read-File (Join-Path $f.Wt 'c.txt')) "c-local-untracked`n" 'P10 untracked file untouched'
}
finally {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

$color = if ($script:fail -eq 0) { 'Green' } else { 'Red' }
Write-Host ("ao-resume-shared-worktree: {0} passed, {1} failed" -f $script:pass, $script:fail) -ForegroundColor $color
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
