param(
    [string]$WorkRoot = "",
    [switch]$SkipVerify,
    [switch]$StrictDirty,
    [switch]$AutoFix,
    [switch]$AllowUnexpectedDirty,
    [switch]$SkipNpmCi
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

    # IDE / generator noise (safe to git restore). Do NOT list preflight scripts here — restore would wipe in-flight edits.
    $knownNoise = @(
        ".cursor/rules/00-session-bootstrap.mdc",
        ".cursor/rules/30-resume-keyword.mdc",
        "agency-os/scripts/generate-integrated-status-report.ps1",
        "agency-os/.cursor/rules/00-session-bootstrap.mdc",
        "agency-os/.cursor/rules/30-resume-keyword.mdc",
        "scripts/generate-integrated-status-report.ps1",
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

    # Local WIP on these must NOT be stashed by AutoFix (would lose work). If behind origin and only these are dirty, refuse pull — commit first.
    $preflightScriptPaths = @(
        "scripts/check-three-way-sync.ps1",
        "agency-os/scripts/check-three-way-sync.ps1",
        "scripts/ao-resume.ps1",
        "agency-os/scripts/ao-resume.ps1"
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
            $dirtyBlockingPull = @()
            foreach ($p in $dirtyForPull) {
                if ($preflightScriptPaths -notcontains $p) { $dirtyBlockingPull += $p }
            }
            if ($dirtyBlockingPull.Count -gt 0) {
                $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
                git stash push -m "auto-sync-before-pull-$stamp" | Out-Null
            } elseif ($dirtyForPull.Count -gt 0) {
                Write-Result -Label "AutoFix pull" -Pass $false -Detail "Behind origin/main with local edits to preflight scripts only — commit or stash those files, then retry."
                exit 1
            }
            git pull --ff-only origin main | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Result -Label "AutoFix pull" -Pass $false -Detail "Unable to fast-forward pull (origin main)"
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
            if ($knownNoise -notcontains $p -and $preflightScriptPaths -notcontains $p) { $postFixUnexpected += $p }
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
        if ($knownNoise -notcontains $p -and $preflightScriptPaths -notcontains $p) {
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
            $onlyPreflight = (($dirtyPaths | Where-Object { $preflightScriptPaths -notcontains $_ }).Count -eq 0)
            if ($onlyPreflight) {
                Write-Result -Label "Working tree" -Pass $true -Detail ("Preflight script WIP (allowed): " + ($dirtyPaths -join ", "))
            } else {
                Write-Result -Label "Working tree" -Pass $true -Detail ("Only known noise: " + ($dirtyPaths -join ", "))
            }
        }
    } else {
        Write-Result -Label "Working tree" -Pass $false -Detail ("Unexpected dirty files: " + ($unexpectedDirty -join ", "))
    }

    $npmPass = $true
    if ($SkipNpmCi) {
        Write-Result -Label "npm ci (workflows + optional wrappers)" -Pass $true -Detail "Skipped by -SkipNpmCi"
    } elseif (-not $isLatest) {
        Write-Result -Label "npm ci (workflows + optional wrappers)" -Pass $true -Detail "Skipped (HEAD != origin/main; FINAL will fail below)"
    } elseif (-not $isCleanEnough) {
        Write-Result -Label "npm ci (workflows + optional wrappers)" -Pass $true -Detail "Skipped (working tree; FINAL will fail below)"
    } else {
        $wfRoot = Join-Path $WorkRoot "lobster-factory\packages\workflows"
        $wfLock = Join-Path $wfRoot "package-lock.json"
        if (-not (Test-Path -LiteralPath $wfLock)) {
            Write-Result -Label "npm ci (lobster workflows)" -Pass $false -Detail "Missing package-lock.json under lobster-factory/packages/workflows"
            $npmPass = $false
        } else {
            Write-Host "== npm ci: lobster-factory/packages/workflows ==" -ForegroundColor Cyan
            Push-Location $wfRoot
            try {
                $prevEap = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                & npm ci 2>&1 | Out-Host
                $ErrorActionPreference = $prevEap
                if ($LASTEXITCODE -ne 0) {
                    Write-Result -Label "npm ci (lobster workflows)" -Pass $false -Detail ("npm ci exit " + $LASTEXITCODE)
                    $npmPass = $false
                } else {
                    Write-Result -Label "npm ci (lobster workflows)" -Pass $true -Detail "OK"
                }
            } finally {
                Pop-Location
            }
        }
        if ($npmPass) {
            $wrapRoot = Join-Path $WorkRoot "mcp-local-wrappers"
            $wrapLock = Join-Path $wrapRoot "package-lock.json"
            if (Test-Path -LiteralPath $wrapLock) {
                Write-Host "== npm ci: mcp-local-wrappers ==" -ForegroundColor Cyan
                Push-Location $wrapRoot
                try {
                    $prevEap = $ErrorActionPreference
                    $ErrorActionPreference = "Continue"
                    & npm ci 2>&1 | Out-Host
                    $ErrorActionPreference = $prevEap
                    if ($LASTEXITCODE -ne 0) {
                        Write-Result -Label "npm ci (mcp-local-wrappers)" -Pass $false -Detail ("npm ci exit " + $LASTEXITCODE)
                        $npmPass = $false
                    } else {
                        Write-Result -Label "npm ci (mcp-local-wrappers)" -Pass $true -Detail "OK"
                    }
                } finally {
                    Pop-Location
                }
            }
        }
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

    $finalPass = $isLatest -and $isCleanEnough -and $npmPass -and $verifyPass
    Write-Host ""
    Write-Result -Label "FINAL (Latest + Correctness)" -Pass $finalPass -Detail $(if ($finalPass) { "Repo is synced and valid." } else { "Check failed items above." })

    if (-not $finalPass) {
        exit 1
    }
} finally {
    Pop-Location
}

exit 0
