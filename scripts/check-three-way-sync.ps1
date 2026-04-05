param(
    [string]$WorkRoot = "",
    [switch]$SkipVerify,
    [switch]$StrictDirty,
    [switch]$AutoFix,
    [switch]$AllowUnexpectedDirty
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
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Not a git repository: $WorkRoot"
    }

    Write-Host "== Three-way sync check ==" -ForegroundColor Cyan
    Write-Host "Work root: $WorkRoot"
    Write-Host ""

    $knownNoise = @(
        ".cursor/rules/00-session-bootstrap.mdc",
        ".cursor/rules/30-resume-keyword.mdc",
        "agency-os/scripts/generate-integrated-status-report.ps1",
        "agency-os/.cursor/rules/00-session-bootstrap.mdc",
        "agency-os/.cursor/rules/30-resume-keyword.mdc",
        "scripts/generate-integrated-status-report.ps1",
        "scripts/check-three-way-sync.ps1",
        "agency-os/scripts/check-three-way-sync.ps1",
        "scripts/ao-resume.ps1",
        "agency-os/scripts/ao-resume.ps1",
        "scripts/autopilot-phase1.ps1",
        "agency-os/scripts/autopilot-phase1.ps1",
        "scripts/notify-ops.ps1",
        "agency-os/scripts/notify-ops.ps1",
        "scripts/register-autopilot-phase1.ps1",
        "agency-os/scripts/register-autopilot-phase1.ps1",
        "automation/REGISTER_AUTOPILOT_PHASE1_TASKS.ps1",
        "agency-os/automation/REGISTER_AUTOPILOT_PHASE1_TASKS.ps1",
        ".cursor/settings.json",
        "agency-os/.cursor/settings.json",
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

    git fetch origin | Out-Null
    $head = (git rev-parse --short HEAD).Trim()
    $remote = (git rev-parse --short origin/main).Trim()
    $isLatest = $head -eq $remote

    if ($AutoFix) {
        $dirtyForFix = @(Get-DirtyPaths)
        if ($dirtyForFix.Count -gt 0) {
            $noiseToRestore = @()
            foreach ($p in $dirtyForFix) {
                if ($knownNoise -contains $p) { $noiseToRestore += $p }
            }
            if ($noiseToRestore.Count -gt 0) {
                foreach ($n in $noiseToRestore) {
                    cmd /c "git restore -- `"$n`" 1>nul 2>nul" | Out-Null
                }
            }
        }

        git fetch origin | Out-Null
        $head = (git rev-parse --short HEAD).Trim()
        $remote = (git rev-parse --short origin/main).Trim()
        $isLatest = $head -eq $remote

        if (-not $isLatest) {
            $dirtyForPull = @(Get-DirtyPaths)
            if ($dirtyForPull.Count -gt 0) {
                $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
                git stash push -m "auto-sync-before-pull-$stamp" | Out-Null
            }
            git pull --ff-only | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Result -Label "AutoFix pull" -Pass $false -Detail "Unable to fast-forward pull"
                exit 1
            }
            git fetch origin | Out-Null
            $head = (git rev-parse --short HEAD).Trim()
            $remote = (git rev-parse --short origin/main).Trim()
            $isLatest = $head -eq $remote
        }

        $postFixDirty = @(Get-DirtyPaths)
        $postFixUnexpected = @()
        foreach ($p in $postFixDirty) {
            if ($knownNoise -notcontains $p) { $postFixUnexpected += $p }
        }
        if (($postFixUnexpected.Count -gt 0) -and (-not $AllowUnexpectedDirty)) {
            $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
            git stash push -m "auto-sync-unexpected-dirty-$stamp" | Out-Null
        }

        git fetch origin | Out-Null
        $head = (git rev-parse --short HEAD).Trim()
        $remote = (git rev-parse --short origin/main).Trim()
        $isLatest = $head -eq $remote
    }

    Write-Result -Label "Latest (HEAD vs origin/main)" -Pass $isLatest -Detail "HEAD=$head, origin/main=$remote"

    $dirtyPaths = @(Get-DirtyPaths)
    $unexpectedDirty = @()
    foreach ($p in $dirtyPaths) {
        if ($knownNoise -notcontains $p) {
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
        } else {
            Write-Result -Label "Working tree" -Pass $true -Detail ("Only known noise: " + ($dirtyPaths -join ", "))
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

    $finalPass = $isLatest -and $isCleanEnough -and $verifyPass
    Write-Host ""
    Write-Result -Label "FINAL (Latest + Correctness)" -Pass $finalPass -Detail $(if ($finalPass) { "Repo is synced and valid." } else { "Check failed items above." })

    if (-not $finalPass) {
        exit 1
    }
} finally {
    Pop-Location
}

exit 0
