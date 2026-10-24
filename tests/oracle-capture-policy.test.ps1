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

    # -Path scope: pathspec magic is stripped and brackets/parentheses are plain text, never wildcards
    # (2026-10-24: ":(literal)app/[id]/route.ts" scopes inlined no untracked file at all).
    Assert-True (Test-OracleInScope -Relative 'app/api/topics/[id]/route.ts' -Path @(':(literal)app/api/topics/[id]/route.ts')) 'literal pathspec with brackets did not match its own file'
    Assert-True (Test-OracleInScope -Relative 'app/(shell)/tools/topics/page.tsx' -Path @('app/(shell)/tools/topics')) 'folder scope with parentheses did not match a file under it'
    Assert-True (-not (Test-OracleInScope -Relative 'app/api/topics/i/route.ts' -Path @('app/api/topics/[id]/route.ts'))) 'brackets were read as a character class'
    Assert-True (-not (Test-OracleInScope -Relative 'lib/content/topicsX/a.ts' -Path @('lib/content/topics'))) 'a sibling folder with the same prefix matched'
    Assert-True (Test-OracleInScope -Relative 'anything.ts' -Path @()) 'no scope must mean everything'
    [IO.File]::WriteAllText((Join-Path $root 'scripts\[id].ps1'), 'Write-Output ok', (New-Object Text.UTF8Encoding($false)))
    $scoped = Invoke-OracleUntrackedCapture -Root $root -Candidates @('scripts/[id].ps1', 'scripts/new.ps1') -Policy $policy -Path @(':(literal)scripts/[id].ps1')
    Assert-True ((@($scoped.Inlined) -join ',') -eq 'scripts/[id].ps1') 'a literal -Path scope did not inline exactly its own untracked file'

    # Mutation proof: removing the runtime guard must make the transcript visible
    # again; otherwise the regression test would be decorative.
    $mutatedPolicy = Get-OracleCapturePolicy
    $mutatedPolicy.RuntimePaths = @()
    $mutated = Invoke-OracleUntrackedCapture -Root $root -Candidates @('.claude/sessions/transcript.md') -Policy $mutatedPolicy
    Assert-True ($mutated.Inlined -contains '.claude/sessions/transcript.md') 'mutation did not disable the runtime guard'


    # Both doors, one list. The untracked filter (regex) and the tracked `git diff` pathspecs
    # are both derived from $policy.RuntimePaths, so they cannot drift apart; excluding a path
    # from only one door is not an exclusion. Measured 2026-09-20: untracked closed + tracked
    # open left 81% of a 640KB packet as deleted .claude/sessions transcripts.
    $patterns  = @(Get-OracleRuntimePathPatterns -Policy $policy)
    $pathspecs = @(Get-OracleGitExcludePathspecs -Policy $policy)
    Assert-True ($patterns.Count -eq @($policy.RuntimePaths).Count) 'regex form lost an entry'
    Assert-True ($pathspecs.Count -eq @($policy.RuntimePaths).Count) 'pathspec form lost an entry'
    Assert-True ($pathspecs -contains ':(exclude).claude/sessions') 'tracked diff does not exclude session transcripts'
    Assert-True ($pathspecs -contains ':(exclude)agency-os/reports/oracle') 'tracked diff does not exclude the oracle artifact dir'
    Assert-True ($pathspecs -contains ':(exclude)**/node_modules') 'an Anywhere-scoped path lost its **/ prefix, so git would only match it at the repo root'
    Assert-True ('.claude/sessions/x.md' -match ($patterns -join '|')) 'regex form stopped matching a rooted runtime path'
    Assert-True ('a/b/node_modules/x.js' -match ($patterns -join '|')) 'regex form stopped matching a nested runtime path'
    Assert-True (-not ('scripts/.claude/sessions/x.md' -match ($patterns -join '|'))) 'a Rooted path must not match at depth'

    # Mutation proof for the tracked door too: emptying the one list must empty BOTH forms.
    $mutatedBoth = Get-OracleCapturePolicy
    $mutatedBoth.RuntimePaths = @()
    Assert-True (@(Get-OracleGitExcludePathspecs -Policy $mutatedBoth).Count -eq 0) 'mutation did not disable the tracked-diff exclusions'
    $tooLarge = ('x' * ($policy.MaxPacketBytes + 1))
    $rejected = $false
    try { [void](Assert-OraclePacketSize -Packet $tooLarge -Policy $policy) } catch { $rejected = $true }
    Assert-True $rejected 'oversized packet was not rejected'
    Write-Output 'oracle-capture-policy: PASS (runtime exclusion on BOTH doors + packet cap)'
} finally {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
