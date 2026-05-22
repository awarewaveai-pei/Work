#requires -Version 5.1
<#
.SYNOPSIS
    Detect deploy drift: how many commits behind production lobster-next-admin (and other apps) are.

.DESCRIPTION
    Compares the deployed commit on the SG server (5.223.93.113) against local origin/main.
    Source of truth on the server is /root/lobster-phase1/.deployed-commit, written by sg-deploy.sh.
    Falls back to /root/Work HEAD if .deployed-commit is missing (legacy mode pre-sg-deploy).

    Exit codes:
        0  PASS  - server is at origin/main (behind == 0)
        1  WARN  - server is 1..(FailAt-1) commits behind
        2  FAIL  - server is FailAt commits behind, OR git/SSH error in -Strict mode
        3  ERROR - SSH/git unreachable; emits warning but does not fail unless -Strict

.PARAMETER ServerHost
    SG server IP/hostname. Default: 5.223.93.113

.PARAMETER ServerUser
    SSH user. Default: root

.PARAMETER PrivateKey
    SSH private key path. Default: $env:USERPROFILE\.ssh\hetzner_trigger

.PARAMETER WarnAt
    Behind count to start warning at. Default: 1 (any drift = warn)

.PARAMETER FailAt
    Behind count to fail at. Default: 6

.PARAMETER Strict
    Treat WARN as FAIL (exit 2 instead of 1). Use this in verify-build-gates.

.PARAMETER Json
    Emit JSON to stdout instead of human text.

.PARAMETER SkipFetch
    Skip 'git fetch' (use cached origin/main).

.EXAMPLE
    .\scripts\check-deploy-drift.ps1
    # Soft check, exits 1 if any drift

.EXAMPLE
    .\scripts\check-deploy-drift.ps1 -FailAt 1 -Strict
    # Fails immediately on any drift (use in CI)
#>
[CmdletBinding()]
param(
    [string]$ServerHost = "5.223.93.113",
    [string]$ServerUser = "root",
    [string]$PrivateKey = (Join-Path $env:USERPROFILE ".ssh\hetzner_trigger"),
    [int]$WarnAt = 1,
    [int]$FailAt = 6,
    [switch]$Strict,
    [switch]$Json,
    [switch]$SkipFetch,
    [switch]$AppCodeOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# CP950 protection for ssh stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

function Resolve-RepoRoot {
    $here = $PSScriptRoot
    if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }
    $cur = $here
    while ($cur -and (Test-Path $cur)) {
        if (Test-Path (Join-Path $cur ".git")) { return $cur }
        $parent = Split-Path -Parent $cur
        if ($parent -eq $cur) { break }
        $cur = $parent
    }
    return $here
}

function Invoke-Ssh {
    param([string]$Cmd)
    $sshArgs = @(
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=8",
        "-i", $PrivateKey,
        ("{0}@{1}" -f $ServerUser, $ServerHost),
        $Cmd
    )
    # Force UTF-8 console for SSH stdout (CP950 trap protection).
    $out = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }
    return @{ ExitCode = $LASTEXITCODE; Output = ($out -join "`n") }
}

function Emit-Result {
    param(
        [string]$Status,
        [int]$ExitCode,
        [string]$Message,
        [hashtable]$Data
    )
    if ($Json) {
        $payload = [ordered]@{
            status = $Status
            exitCode = $ExitCode
            message = $Message
            checkedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        }
        foreach ($k in $Data.Keys) { $payload[$k] = $Data[$k] }
        $payload | ConvertTo-Json -Depth 6
    } else {
        Write-Output ("[{0}] {1}" -f $Status, $Message)
        foreach ($k in $Data.Keys) {
            Write-Output ("  - {0}: {1}" -f $k, $Data[$k])
        }
    }
    exit $ExitCode
}

# 1. Sanity: SSH key + ssh.exe
if (-not (Test-Path $PrivateKey)) {
    $msg = "SSH private key not found: $PrivateKey"
    if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data @{} }
    Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data @{}
}
if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
    $msg = "ssh.exe not on PATH (install OpenSSH Client via Optional Features or Git for Windows)"
    if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data @{} }
    Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data @{}
}

# 2. Local origin/main
$repoRoot = Resolve-RepoRoot
Push-Location $repoRoot
try {
    if (-not $SkipFetch) {
        $null = git fetch origin main 2>&1
    }
    $localHead = (git rev-parse origin/main 2>&1).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $localHead) {
        $msg = "Cannot resolve origin/main (is this a git repo with a 'main' branch on origin?)"
        if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data @{ repoRoot = $repoRoot } }
        Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data @{ repoRoot = $repoRoot }
    }
} finally {
    Pop-Location
}

# 3. SSH probe deployed commit
$probe = Invoke-Ssh -Cmd "cat /root/lobster-phase1/.deployed-commit 2>/dev/null || (cd /root/Work && git rev-parse HEAD) 2>/dev/null"
if ($probe.ExitCode -ne 0) {
    $msg = "SSH probe failed (exit $($probe.ExitCode)): $($probe.Output)"
    if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data @{ host = $ServerHost } }
    Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data @{ host = $ServerHost }
}
$deployedCommit = ($probe.Output -split "`n" | Where-Object { $_ -match '^[0-9a-f]{7,40}$' } | Select-Object -First 1)
if (-not $deployedCommit) {
    $msg = "Could not extract deployed commit from SSH output: $($probe.Output)"
    if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data @{} }
    Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data @{}
}

# 4. Compute behind
Push-Location $repoRoot
try {
    git cat-file -e "$deployedCommit^{commit}" 2>&1 | Out-Null
    $haveDeployed = ($LASTEXITCODE -eq 0)
    if (-not $haveDeployed) {
        # Try fetching the specific commit (deep fetch fallback)
        $null = git fetch origin $deployedCommit 2>&1
        git cat-file -e "$deployedCommit^{commit}" 2>&1 | Out-Null
        $haveDeployed = ($LASTEXITCODE -eq 0)
    }
    if (-not $haveDeployed) {
        $msg = "Deployed commit $deployedCommit not present in local clone (try 'git fetch origin')."
        if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data @{ deployed = $deployedCommit } }
        Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data @{ deployed = $deployedCommit }
    }
    if ($AppCodeOnly) {
        # Count only commits that touch SG next-admin app paths (ignores governance/tooling noise).
        $appPaths = @(
            "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/",
            "lobster-factory/infra/hetzner-phase1-core/nginx/",
            "lobster-factory/infra/hetzner-phase1-core/docker-compose.yml"
        )
        $behindCommits = @(git rev-list "$deployedCommit..$localHead" -- @appPaths 2>&1 | Where-Object { $_ -match '^[0-9a-f]{7,40}$' })
        $aheadCommits  = @(git rev-list "$localHead..$deployedCommit" -- @appPaths 2>&1 | Where-Object { $_ -match '^[0-9a-f]{7,40}$' })
        $behind = $behindCommits.Count
        $ahead  = $aheadCommits.Count
    } else {
        $behindStr = (git rev-list --count "$deployedCommit..$localHead" 2>&1).Trim()
        $aheadStr  = (git rev-list --count "$localHead..$deployedCommit" 2>&1).Trim()
        $behind = [int]$behindStr
        $ahead  = [int]$aheadStr
    }
} finally {
    Pop-Location
}

# 5. Verdict
$data = @{
    server          = $ServerHost
    deployedCommit  = $deployedCommit
    localOriginMain = $localHead
    behind          = $behind
    ahead           = $ahead
    warnAt          = $WarnAt
    failAt          = $FailAt
    appCodeOnly     = [bool]$AppCodeOnly
}

if ($behind -ge $FailAt) {
    Emit-Result -Status "FAIL" -ExitCode 2 -Message ("Production is {0} commit(s) behind origin/main (>= FailAt={1}). Run sg-deploy.sh on the server." -f $behind, $FailAt) -Data $data
}
if ($behind -ge $WarnAt) {
    $code = if ($Strict) { 2 } else { 1 }
    $status = if ($Strict) { "FAIL" } else { "WARN" }
    Emit-Result -Status $status -ExitCode $code -Message ("Production is {0} commit(s) behind origin/main." -f $behind) -Data $data
}
Emit-Result -Status "PASS" -ExitCode 0 -Message ("Production is at origin/main (commit {0})." -f $deployedCommit.Substring(0,7)) -Data $data
