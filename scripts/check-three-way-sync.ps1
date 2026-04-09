param(
    [string]$WorkRoot = "",
    [switch]$SkipVerify,
    [switch]$StrictDirty,
    [switch]$AutoFix,
    [switch]$AllowUnexpectedDirty,
    [switch]$AllowStashBeforePull,
    [switch]$AllowAutoStashUnexpected,
    [switch]$AllowPendingStash
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Result {
    param(
        [string]$Label,
        [bool]$Pass,
        [string]$Detail
    )
    $mark = if ($Pass) { "PASS" } else { "FAIL" }
    Write-Host ("{0}: {1}" -f $Label, $mark) -ForegroundColor $(if ($Pass) { "Green" } else { "Red" })
    if ($Detail) {
        Write-Host ("  - {0}" -f $Detail)
    }
}

function Get-GitStashCount {
    $list = @(git stash list 2>$null | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    return $list.Count
}

if (-not $WorkRoot) {
    if ($PSScriptRoot) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $WorkRoot = (Get-Location).Path
    }
} else {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
}

Push-Location $WorkRoot
try {
    # Native `git` writes progress to stderr; with $ErrorActionPreference Stop, PowerShell can treat that as a terminating error.
    $savedEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Not a git repository: $WorkRoot"
    }

    Write-Host "== Three-way sync check ==" -ForegroundColor Cyan
    Write-Host "Work root: $WorkRoot"
    Write-Host ""

    function Get-AheadBehindOriginMain {
        $line = (git rev-list --left-right --count HEAD...origin/main 2>$null | Select-Object -Last 1)
        if ($line -match '^\s*(\d+)\s+(\d+)\s*$') {
            return @{
                Ahead  = [int]$Matches[1]
                Behind = [int]$Matches[2]
            }
        }
        return @{ Ahead = -1; Behind = -1 }
    }

    # Machine-local paths that may differ per workstation and must NEVER be `git restore`d by AutoFix.
    # (Historically a long "knownNoise" list was restored here — that silently discarded uncommitted fixes to
    # repo-owned scripts and broke multi-machine alignment. Only true local-only files belong here.)
    $pathsAllowedDirtyWithoutFlag = @(
        "agency-os/settings/local.permissions.json"
    )

    function Get-DirtyPaths {
        $lines = @(git status --porcelain | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        $paths = @()
        foreach ($line in $lines) {
            if ($line.Length -ge 4) {
                $paths += $line.Substring(3).Trim()
            }
        }
        return $paths
    }

    $stashCountAtStart = Get-GitStashCount

    git fetch origin 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Result -Label "git fetch origin" -Pass $false -Detail "fetch failed (network/auth?)"
        exit 1
    }
    git rev-parse --verify origin/main 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Result -Label "origin/main" -Pass $false -Detail "Missing origin/main after fetch."
        exit 1
    }

    $head = (git rev-parse --short HEAD).Trim()
    $remote = (git rev-parse --short origin/main).Trim()
    $ab = Get-AheadBehindOriginMain
    $notBehindOrigin = ($ab.Behind -eq 0)

    if ($AutoFix) {
        git fetch origin 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Result -Label "git fetch (AutoFix)" -Pass $false -Detail "fetch failed"
            exit 1
        }
        $head = (git rev-parse --short HEAD).Trim()
        $remote = (git rev-parse --short origin/main).Trim()
        $ab = Get-AheadBehindOriginMain
        $notBehindOrigin = ($ab.Behind -eq 0)

        # Only fast-forward when **behind** origin/main. Local commits ahead (checkpoint not pushed) must not trigger pull.
        if ($ab.Behind -gt 0) {
            $dirtyForPull = @(Get-DirtyPaths)
            if ($dirtyForPull.Count -gt 0) {
                if (-not $AllowStashBeforePull) {
                    Write-Result -Label "AutoFix pull" -Pass $false -Detail "Behind origin/main but worktree is dirty. Commit, discard, stash manually, or pass -AllowStashBeforePull (with -AllowPendingStash if stash is created)."
                    Write-Host ("  Dirty: " + ($dirtyForPull -join "; ")) -ForegroundColor Yellow
                    exit 1
                }
                $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
                Write-Host "== AO-RESUME: stashing before fast-forward pull ==" -ForegroundColor Yellow
                git stash push -m "ao-resume-before-pull-$stamp" 2>&1 | Out-Host
                if ($LASTEXITCODE -ne 0) {
                    Write-Result -Label "AutoFix stash" -Pass $false -Detail "git stash push failed"
                    exit 1
                }
            }
            git pull --ff-only origin main 2>&1 | Out-Host
            if ($LASTEXITCODE -ne 0) {
                Write-Result -Label "AutoFix pull" -Pass $false -Detail "Fast-forward failed. Try: git status; git pull --rebase origin main; or reset to origin/main if remote is truth."
                exit 1
            }
            git fetch origin 2>&1 | Out-Host
            if ($LASTEXITCODE -ne 0) { exit 1 }
            $head = (git rev-parse --short HEAD).Trim()
            $remote = (git rev-parse --short origin/main).Trim()
            $ab = Get-AheadBehindOriginMain
            $notBehindOrigin = ($ab.Behind -eq 0)
        }

        $postFixDirty = @(Get-DirtyPaths)
        $postFixUnexpected = @()
        foreach ($p in $postFixDirty) {
            if ($pathsAllowedDirtyWithoutFlag -notcontains $p) { $postFixUnexpected += $p }
        }
        if (($postFixUnexpected.Count -gt 0) -and (-not $AllowUnexpectedDirty)) {
            if ($AllowAutoStashUnexpected) {
                $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
                Write-Host "== AO-RESUME: stashing unexpected (auto-repair) ==" -ForegroundColor Yellow
                git stash push -m "ao-resume-unexpected-dirty-$stamp" 2>&1 | Out-Host
                if ($LASTEXITCODE -ne 0) {
                    Write-Result -Label "stash unexpected" -Pass $false -Detail "git stash push failed"
                    exit 1
                }
            } else {
                Write-Result -Label "AutoFix worktree" -Pass $false -Detail ("Unexpected dirty: " + ($postFixUnexpected -join "; "))
                exit 1
            }
        }

        git fetch origin 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { exit 1 }
        $head = (git rev-parse --short HEAD).Trim()
        $remote = (git rev-parse --short origin/main).Trim()
        $ab = Get-AheadBehindOriginMain
        $notBehindOrigin = ($ab.Behind -eq 0)
    }

    $syncDetail = if ($ab.Ahead -lt 0) {
        "Could not parse ahead/behind; HEAD=$head, origin/main=$remote"
    } else {
        "ahead=$($ab.Ahead), behind=$($ab.Behind); HEAD=$head, origin/main=$remote"
    }
    Write-Result -Label "Origin/main (not behind)" -Pass $notBehindOrigin -Detail $syncDetail

    $dirtyPaths = @(Get-DirtyPaths)
    $unexpectedDirty = @()
    foreach ($p in $dirtyPaths) {
        if ($pathsAllowedDirtyWithoutFlag -notcontains $p) {
            $unexpectedDirty += $p
        }
    }

    $isCleanEnough = $StrictDirty -or ($unexpectedDirty.Count -eq 0) -or $AllowUnexpectedDirty
    if ($StrictDirty) {
        $isCleanEnough = $dirtyPaths.Count -eq 0
    }

    if ($isCleanEnough) {
        if ($dirtyPaths.Count -eq 0) {
            Write-Result -Label "Working tree" -Pass $true -Detail "Clean"
        } elseif ($unexpectedDirty.Count -eq 0) {
            Write-Result -Label "Working tree" -Pass $true -Detail ("Only allowed local drift: " + ($dirtyPaths -join ", "))
        } else {
            $detail = if ($AllowUnexpectedDirty) {
                "Allowed by -AllowUnexpectedDirty: " + ($unexpectedDirty -join "; ")
            } else {
                "Unexpected: " + ($unexpectedDirty -join "; ")
            }
            Write-Result -Label "Working tree" -Pass $true -Detail $detail
        }
    } else {
        Write-Result -Label "Working tree" -Pass $false -Detail ("Unexpected dirty files: " + ($unexpectedDirty -join ", "))
    }

    $verifyPass = $true
    if (-not $SkipVerify) {
        $verifyScript = Join-Path $WorkRoot "scripts\verify-build-gates.ps1"
        if (-not (Test-Path -LiteralPath $verifyScript)) {
            $verifyPass = $false
            Write-Result -Label "Correctness gate (verify-build-gates)" -Pass $false -Detail "Missing script: $verifyScript"
        } else {
            & powershell -ExecutionPolicy Bypass -NoProfile -File $verifyScript -WorkRoot $WorkRoot
            $verifyPass = $LASTEXITCODE -eq 0
            Write-Result -Label "Correctness gate (verify-build-gates)" -Pass $verifyPass -Detail $(if ($verifyPass) { "All passed" } else { "Exit code $LASTEXITCODE" })
        }
    } else {
        Write-Result -Label "Correctness gate (verify-build-gates)" -Pass $true -Detail "Skipped by -SkipVerify"
    }

    $stashCountNow = Get-GitStashCount
    if ($AutoFix -and (-not $AllowPendingStash) -and ($stashCountNow -gt $stashCountAtStart)) {
        Write-Result -Label "Stash drift guard" -Pass $false -Detail "New stash ($stashCountAtStart -> $stashCountNow). git stash list; pop/drop; re-run. Use -AllowPendingStash with autopilot."
        $stateDir = Join-Path $WorkRoot "agency-os\.agency-state"
        $null = New-Item -ItemType Directory -Force -Path $stateDir
        $note = Join-Path $stateDir "ao-resume-stash-warning.txt"
        $utf8 = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($note, "Stash created during AO-RESUME. UTC: $([DateTime]::UtcNow.ToString('o'))`n", $utf8)
        exit 1
    }

    $finalPass = $notBehindOrigin -and $isCleanEnough -and $verifyPass
    Write-Host ""
    Write-Result -Label "FINAL (not behind + correctness)" -Pass $finalPass -Detail $(if ($finalPass) { "Repo is ready (not behind origin/main)." } else { "Check failed items above." })

    if (-not $finalPass) {
        exit 1
    }
} finally {
    if ($null -ne $savedEap) {
        $ErrorActionPreference = $savedEap
    }
    Pop-Location
}

exit 0
