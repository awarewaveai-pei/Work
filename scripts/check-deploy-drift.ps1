#requires -Version 5.1
<#
.SYNOPSIS
    Detect deploy drift: how many commits behind production lobster-next-admin (and other apps) are.

.DESCRIPTION
    Compares the deployed commit on the deploy target (2026-08-28 consolidation: ks-aw-01,
    145.239.195.47 -- default below is already updated; this description previously said the
    retired SG box, 5.223.93.113, which stopped serving traffic on migration day) against
    local origin/main.
    Source of truth on the server is /root/lobster-phase1/.deployed-commit, written by sg-deploy.sh.
    Falls back to /root/Work HEAD if .deployed-commit is missing (legacy mode pre-sg-deploy).

    Exit codes:
        0  PASS  - server is at origin/main (behind == 0)
        1  WARN  - server is 1..(FailAt-1) commits behind
        2  FAIL  - server is FailAt commits behind, OR git/SSH error in -Strict mode
        3  ERROR - SSH/git unreachable; emits warning but does not fail unless -Strict

.PARAMETER ServerHost
    Deploy target IP/hostname. Default: 145.239.195.47 (ks-aw-01, since the 2026-08-31 KS-6 host switch)

.PARAMETER ServerUser
    SSH user. Default: ubuntu (ks-aw-01 uses the `ubuntu` working account, not root; this
    docstring previously said root, which was already stale before today's edit)

.PARAMETER PrivateKey
    SSH private key path. Default: $env:USERPROFILE\.ssh\id_ed25519 -- the only key authorized on
    ks-aw-01 for the operator (the old SG/EU key retired with those hosts).

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
    # 2026-08-28 consolidation: the deploy staging (/root/lobster-phase1) now lives on ks-aw-01.
    [string]$ServerHost = "145.239.195.47",
    [string]$ServerUser = "ubuntu",
    [string]$PrivateKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
    [int]$WarnAt = 1,
    [int]$FailAt = 6,
    [switch]$Strict,
    [switch]$Json,
    [switch]$SkipFetch,
    [switch]$AppCodeOnly
)

$ErrorActionPreference = "Stop"

# git 一律走 lib SSOT。PS 5.1 在 EAP=Stop 下把 native stderr 當 error record，
# 而 `git fetch` 正常運作時就會往 stderr 印 "From https://..."，所以裸的
# `git ... 2>&1` 會在**成功**路徑上拋 NativeCommandError（2026-08-25 實測：本腳本
# :138 每次都炸，部署前置閘等於長期不可用）。lib 內用 scoped EAP='Continue' + finally 還原。
. (Join-Path $PSScriptRoot 'lib\git-safe-ops.ps1')
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
        "-p", "58122",
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
            $v = $Data[$k]
            # A bare hashtable/array renders via .ToString() as "System.Collections.Hashtable" (no
            # override on that type) -- caught in review, 2026-09-20, for the new composeVarDrift
            # field. Flatten to something a human reading plain-text output can actually use; -Json
            # still gets the full structured value untouched (Depth 6 above).
            if ($v -is [hashtable]) {
                $v = (($v.Keys | ForEach-Object { "{0}=[{1}]" -f $_, (($v[$_] -join ", ")) }) -join "; ")
            } elseif ($v -is [array]) {
                $v = ($v -join ", ")
            }
            Write-Output ("  - {0}: {1}" -f $k, $v)
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
        # ExitCode 必須被消費。把「崩潰式失敗訊號」換成「回傳值式」時，每個呼叫點都得檢查
        # 回傳值 —— 否則等於把大聲失敗改成安靜的錯答案：fetch 失敗後 rev-parse origin/main
        # 會用**本地過期 ref** 照樣成功，於是這道部署閘回報一個過期的 drift 結論
        # （最糟情況：實際落後卻說「已同步」）。2026-08-25 路由到 lib 時漏掉這點，由 Codex
        # stop-time review 抓到。這正是本 repo 反覆出現的「偵測器啞了看起來像健康」bug class。
        $fetchRes = Invoke-SafeGitCapture -GitArgs @("fetch","origin","main")
        if ($fetchRes.ExitCode -ne 0) {
            $msg = "git fetch origin main failed (exit $($fetchRes.ExitCode)) — refusing to report drift against a stale origin/main. Use -SkipFetch only if you accept a possibly-stale local ref."
            $fetchData = @{ repoRoot = $repoRoot; fetchExitCode = $fetchRes.ExitCode; fetchOutput = $fetchRes.Text }
            if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data $fetchData }
            Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data $fetchData
        }
    }
    $rpRes = Invoke-SafeGitCapture -GitArgs @("rev-parse","origin/main")
    $localHead = $rpRes.Text.Trim()
    $global:LASTEXITCODE = $rpRes.ExitCode
    if ($LASTEXITCODE -ne 0 -or -not $localHead) {
        $msg = "Cannot resolve origin/main (is this a git repo with a 'main' branch on origin?)"
        if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data @{ repoRoot = $repoRoot } }
        Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data @{ repoRoot = $repoRoot }
    }
} finally {
    Pop-Location
}

# 3. SSH probe deployed commit
$probe = Invoke-Ssh -Cmd "sudo bash -c 'cat /root/lobster-phase1/.deployed-commit 2>/dev/null || (cd /root/Work && git rev-parse HEAD) 2>/dev/null'"
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
    $catRes = Invoke-SafeGitCapture -GitArgs @("cat-file","-e","$deployedCommit^{commit}")
    $haveDeployed = ($catRes.ExitCode -eq 0)
    if (-not $haveDeployed) {
        # Try fetching the specific commit (deep fetch fallback)
        $null = Invoke-SafeGitCapture -GitArgs @("fetch","origin",$deployedCommit)
        $catRes2 = Invoke-SafeGitCapture -GitArgs @("cat-file","-e","$deployedCommit^{commit}")
        $haveDeployed = ($catRes2.ExitCode -eq 0)
    }
    if (-not $haveDeployed) {
        $msg = "Deployed commit $deployedCommit not present in local clone (try 'git fetch origin')."
        if ($Strict) { Emit-Result -Status "FAIL" -ExitCode 2 -Message $msg -Data @{ deployed = $deployedCommit } }
        Emit-Result -Status "ERROR" -ExitCode 3 -Message $msg -Data @{ deployed = $deployedCommit }
    }
    if ($AppCodeOnly) {
        # Count only commits that touch SG next-admin app paths (ignores governance/tooling noise).
        # NOTE (2026-09-20): docker-compose.yml counting toward $behind here is a known imprecision,
        # not fixed today -- sg-deploy.sh stamps .deployed-commit on ANY app deploy regardless of
        # which files changed, so a compose-only commit can show $behind=0 (looks "deployed") while
        # never having been applied to the live file at all. That gap is exactly what the separate,
        # unconditional composeVarDrift check below exists to catch -- $behind was never a reliable
        # signal for this one path and should not be treated as one.
        $appPaths = @(
            "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/",
            "lobster-factory/infra/hetzner-phase1-core/nginx/",
            "lobster-factory/infra/hetzner-phase1-core/docker-compose.yml"
        )
        $behindCommits = @((Invoke-SafeGitCapture -GitArgs (@("rev-list","$deployedCommit..$localHead","--") + $appPaths)).Output | Where-Object { $_ -match '^[0-9a-f]{7,40}$' })
        $aheadCommits  = @((Invoke-SafeGitCapture -GitArgs (@("rev-list","$localHead..$deployedCommit","--") + $appPaths)).Output | Where-Object { $_ -match '^[0-9a-f]{7,40}$' })
        $behind = $behindCommits.Count
        $ahead  = $aheadCommits.Count
    } else {
        $behindStr = (Invoke-SafeGitCapture -GitArgs @("rev-list","--count","$deployedCommit..$localHead")).Text.Trim()
        $aheadStr  = (Invoke-SafeGitCapture -GitArgs @("rev-list","--count","$localHead..$deployedCommit")).Text.Trim()
        $behind = [int]$behindStr
        $ahead  = [int]$aheadStr
    }
} finally {
    Pop-Location
}

# 4.5 Compose variable drift (2026-09-20): docker-compose.yml is machine-local on the server
# (sg-deploy.sh's own header comment -- only apps/<APP> source is rsynced; safe-infra-patch.sh, not
# git, is the required way to change the live file per Auto-Repair 紅線). A repo edit to this file's
# environment: blocks has ZERO effect on production regardless of commit drift above -- a real
# incident: a vendor-swap env-var change sat inert in prod through a full sg-deploy.sh run, because
# `behind` was 0 (the commit shipped) but the compose file itself was never touched. This check does
# not gate on `behind` -- it is a genuinely separate axis of drift.
#
# KNOWN, ACCEPTED LIMITATION: this is a flat variable-NAME set diff, not a YAML/service-aware one --
# it cannot tell "present under the wrong service" from "present, correctly". docker-compose.yml
# genuinely declares the same name (`PORT`) three times under three different services with three
# different values (next-admin/node-api/hci-app) -- a real per-service drift there would cancel out
# in this set-difference and report clean. Accepted for now: this check's job is to catch the "never
# even declared" class (which is what actually bit this app -- a wholesale-missing var, not a
# cross-service value mixup), and a real per-service-scoped rewrite is a larger, separate change.
#
# Independent SSH call (not folded into the step-3 probe above) to avoid touching that probe's
# already-hardened parsing -- see its own comments for the CP950/exit-code history. Deliberately NO
# remote pipe (no `| sort -u` on the SSH side): a first attempt used `bash -o pipefail -c "grep ...
# | sort -u"` to stop a failing grep from being masked by sort succeeding on empty stdin, but nested
# single/double quoting across PowerShell -> Windows argv -> ssh.exe -> remote bash proved fragile
# in practice (grep received a mangled pattern live-tested, 2026-09-20). Simpler and more robust:
# grep alone (its own exit code is directly `$composeProbe.ExitCode`, nothing to mask), dedupe
# locally instead. No `2>/dev/null` either -- a real error is wanted in $composeVarDriftCheckError,
# not silently thrown away (the previous version hid exactly the diagnostic this field exists for).
$composeVarDrift = $null
$composeVarDriftCheckError = $null
$composeProbe = Invoke-Ssh -Cmd "sudo grep -ohP '^\s+\K[A-Z][A-Z0-9_]+(?=:)' /root/lobster-phase1/docker-compose.yml"
$serverVars = @($composeProbe.Output -split "`n" | Where-Object { $_ -match '^[A-Z][A-Z0-9_]+$' } | Sort-Object -Unique)
if ($composeProbe.ExitCode -ne 0 -or $serverVars.Count -eq 0) {
    # Distinguishable from "checked, no drift found" -- surfaced in $data so a WARN-suppressing PASS
    # can never come from a probe that silently found nothing to compare.
    $composeVarDriftCheckError = "compose var probe failed or found 0 vars (exit $($composeProbe.ExitCode)): $($composeProbe.Output)"
} else {
    $repoComposePath = Join-Path $repoRoot "lobster-factory\infra\hetzner-phase1-core\docker-compose.yml"
    if (Test-Path $repoComposePath) {
        # Explicit UTF-8 (repo .yml has no BOM): PS 5.1's Get-Content without -Encoding falls back to
        # the system codepage, which can misalign byte boundaries around the file's many CJK
        # comments and corrupt regex matches on nearby lines -- caught live, 2026-09-20: this exact
        # bug made REPLICATE_API_TOKEN/REMOTION_*/R2_VIDEO_BUCKET (each sitting right after a CJK
        # comment) falsely report as "only on server" when they were plainly present in repo too.
        $repoText = Get-Content -LiteralPath $repoComposePath -Raw -Encoding utf8
        $repoVars = @([regex]::Matches($repoText, '(?m)^[ \t]+([A-Z][A-Z0-9_]+):') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
        $onlyServer = @($serverVars | Where-Object { $repoVars -notcontains $_ })
        $onlyRepo   = @($repoVars   | Where-Object { $serverVars -notcontains $_ })
        if ($onlyServer.Count -gt 0 -or $onlyRepo.Count -gt 0) {
            $composeVarDrift = @{
                onlyOnServer = $onlyServer
                onlyInRepo   = $onlyRepo
                hint         = "repo docker-compose.yml env changes need scripts/safe-infra-patch.sh compose <file> <service> on the server -- sg-deploy.sh does not sync this file"
            }
        }
    } else {
        $composeVarDriftCheckError = "repo compose file not found at $repoComposePath"
    }
}

# 4.8 Deploy hold (2026-09-23). DEPLOY_HOLD on origin/main means the drift is deliberate --
# unfinished work is parked on main on purpose and sg-deploy.sh step 1.85 refuses to ship it. The
# verdict below still reports the real drift (a hold must not hide it), but every message that would
# otherwise say "run sg-deploy.sh" has to say the opposite while a hold is in force: that advice is
# exactly what the hold exists to stop.
# Read from origin/main, the same ref the server resolves -- an uncommitted local DEPLOY_HOLD is not
# in force anywhere (Codex review, 2026-09-23), so it gets its own explicit warning instead of being
# reported as a hold that is protecting anything.
$deployHold = $null
$holdNote   = ""
$holdRel    = "lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD"
$holdLocal  = Test-Path -LiteralPath (Join-Path $repoRoot ($holdRel -replace '/', '\'))
$holdRes    = Invoke-SafeGitCapture -GitArgs @("show", "origin/main:$holdRel")
if ($holdRes.ExitCode -eq 0 -and $holdRes.Text.Trim().Length -gt 0) {
    $holdText = $holdRes.Text
    $hReason  = @([regex]::Matches($holdText, '(?m)^reason=(.+)$')      | ForEach-Object { $_.Groups[1].Value.Trim() } | Select-Object -First 1)
    $hCreated = @([regex]::Matches($holdText, '(?m)^created_utc=(.+)$') | ForEach-Object { $_.Groups[1].Value.Trim() } | Select-Object -First 1)
    $deployHold = @{
        reason     = if ($hReason.Count  -gt 0) { $hReason[0] }  else { "unspecified" }
        createdUtc = if ($hCreated.Count -gt 0) { $hCreated[0] } else { "unknown" }
        file       = $holdRel
        source     = "origin/main"
        override   = "DEPLOY_HOLD_OVERRIDE=1 bash /root/lobster-phase1/scripts/sg-deploy.sh <app>"
    }
    $holdNote = " DEPLOY HOLD ACTIVE since $($deployHold.createdUtc) -- do NOT run sg-deploy.sh; this drift is intentional. Reason: $($deployHold.reason) To resume: git rm the DEPLOY_HOLD file."
} elseif ($holdLocal) {
    $deployHold = @{
        reason     = "local DEPLOY_HOLD file is NOT committed/pushed -- production reads origin/main and sees no hold"
        createdUtc = "n/a"
        file       = $holdRel
        source     = "working copy only"
        override   = "n/a"
    }
    $holdNote = " WARNING: a DEPLOY_HOLD file exists locally but is NOT on origin/main, so nothing is actually held -- commit and push it, or delete it."
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
    composeVarDrift = $composeVarDrift
    composeVarDriftCheckError = $composeVarDriftCheckError
    deployHold      = $deployHold
}

if ($behind -ge $FailAt) {
    Emit-Result -Status "FAIL" -ExitCode 2 -Message (("Production is {0} commit(s) behind origin/main (>= FailAt={1}). Run sg-deploy.sh on the server." -f $behind, $FailAt) + $holdNote) -Data $data
}
if ($behind -ge $WarnAt) {
    $code = if ($Strict) { 2 } else { 1 }
    $status = if ($Strict) { "FAIL" } else { "WARN" }
    Emit-Result -Status $status -ExitCode $code -Message (("Production is {0} commit(s) behind origin/main." -f $behind) + $holdNote) -Data $data
}
if ($composeVarDrift) {
    $code = if ($Strict) { 2 } else { 1 }
    $status = if ($Strict) { "FAIL" } else { "WARN" }
    Emit-Result -Status $status -ExitCode $code -Message ("Production is at origin/main (commit {0}), but docker-compose.yml declares different variables than repo (server-only: {1}; repo-only: {2}). Fix via safe-infra-patch.sh, NOT sg-deploy.sh -- see composeVarDrift." -f $deployedCommit.Substring(0,7), $composeVarDrift.onlyOnServer.Count, $composeVarDrift.onlyInRepo.Count) -Data $data
}
if ($composeVarDriftCheckError) {
    # Non-Strict WARN only -- this is "the supplementary check didn't run", not "everything is
    # broken" (the primary commit-drift verdict above already reported correctly). Never silently
    # dropped, unlike the pre-fix behavior this replaced.
    Emit-Result -Status "WARN" -ExitCode 1 -Message ("Production is at origin/main (commit {0}), but the compose-variable-drift check itself failed: {1}" -f $deployedCommit.Substring(0,7), $composeVarDriftCheckError) -Data $data
}
Emit-Result -Status "PASS" -ExitCode 0 -Message (("Production is at origin/main (commit {0})." -f $deployedCommit.Substring(0,7)) + $holdNote) -Data $data
