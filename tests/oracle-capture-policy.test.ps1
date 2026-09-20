# Regression tests for the cross-model oracle capture boundary.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/oracle-capture-policy.test.ps1

$ErrorActionPreference = 'Stop'
$policyPath = Join-Path $PSScriptRoot '..\scripts\oracle-capture-policy.ps1'
. (Resolve-Path -LiteralPath $policyPath).Path
$policy = Get-OracleCapturePolicy
$root = Join-Path ([IO.Path]::GetTempPath()) ("oracle-capture-test-" + [guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

try {
    New-Item -ItemType Directory -Force -Path (Join-Path $root '.claude\sessions'), (Join-Path $root 'scripts') | Out-Null
    [IO.File]::WriteAllText((Join-Path $root '.claude\sessions\transcript.md'), ('x' * 100), (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $root 'scripts\new.ps1'), 'Write-Output ok', (New-Object Text.UTF8Encoding($false)))

    $result = Invoke-OracleUntrackedCapture -Root $root -Candidates @('.claude/sessions/transcript.md', 'scripts/new.ps1') -Policy $policy
    Assert-True ($result.Inlined -contains 'scripts/new.ps1') 'new source file was not captured'
    Assert-True ($result.Inlined -notcontains '.claude/sessions/transcript.md') 'session transcript was captured'
    Assert-True (($result.Skipped -join "`n") -match [regex]::Escape('.claude/sessions/transcript.md')) 'skipped transcript was not reported'

    # Mutation proof: removing the runtime guard must make the transcript visible
    # again; otherwise the regression test would be decorative.
    $mutatedPolicy = Get-OracleCapturePolicy
    $mutatedPolicy.RuntimePathPatterns = @()
    $mutated = Invoke-OracleUntrackedCapture -Root $root -Candidates @('.claude/sessions/transcript.md') -Policy $mutatedPolicy
    Assert-True ($mutated.Inlined -contains '.claude/sessions/transcript.md') 'mutation did not disable the runtime guard'

    $tooLarge = ('x' * ($policy.MaxPacketBytes + 1))
    $rejected = $false
    try { [void](Assert-OraclePacketSize -Packet $tooLarge -Policy $policy) } catch { $rejected = $true }
    Assert-True $rejected 'oversized packet was not rejected'
    Write-Output 'oracle-capture-policy: PASS (runtime exclusion + packet cap)'
} finally {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
