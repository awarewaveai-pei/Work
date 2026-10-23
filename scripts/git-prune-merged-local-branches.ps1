<#
.SYNOPSIS
  List or delete **local** branches that are already fully merged into origin/main (optional ref).

.DESCRIPTION
  Does NOT delete `main` itself. Does NOT switch branches for you.
  Default: **dry-run** (list only). Pass **-Delete** to run `git branch -d`; **-Force** uses `git branch -D`.

.PARAMETER MainBranch
  Baseline branch name (default: main). Merge check uses **origin/<MainBranch>** (Git ref).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-prune-merged-local-branches.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-prune-merged-local-branches.ps1 -Delete
#>
param(
    [string]$WorkRoot = "",
    [string]$MainBranch = "main",
    [switch]$Delete,
    [switch]$Force
)

# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

Push-Location -LiteralPath $WorkRoot
try {
    $null = Invoke-WithUtf8Console { git rev-parse --git-dir 2>$null }
    if ($LASTEXITCODE -ne 0) {
        throw "git-prune-merged-local-branches: not a git repository at $WorkRoot"
    }

    Write-Host "== git fetch origin --prune ==" -ForegroundColor Cyan
    Invoke-WithUtf8Console { git fetch origin --prune }
    if ($LASTEXITCODE -ne 0) {
        throw "git fetch failed (exit $LASTEXITCODE)"
    }

    $mergeRef = "origin/$MainBranch"
    $null = Invoke-WithUtf8Console { git rev-parse --verify $mergeRef 2>$null }
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot resolve $mergeRef. Verify remote and branch name (-MainBranch)."
    }

    $current = (Invoke-WithUtf8Console { git rev-parse --abbrev-ref HEAD }).Trim()

    $lines = @(Invoke-WithUtf8Console { git branch --merged $mergeRef })
    $candidates = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        $name = ($line -replace '^\*\s+', '').Trim()
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        if ($name -eq $MainBranch) { continue }
        $candidates.Add($name) | Out-Null
    }

    if ($candidates.Count -eq 0) {
        Write-Host "No extra local branches merged into $mergeRef (besides $MainBranch)." -ForegroundColor Green
        exit 0
    }

    Write-Host ""
    Write-Host "Local branches merged into $mergeRef (safe candidates; excludes '$MainBranch'):" -ForegroundColor Cyan
    foreach ($b in $candidates) {
        Write-Host "  $b"
    }

    if (-not $Delete) {
        Write-Host ""
        Write-Host "Dry-run only. Re-run with -Delete to remove (-Force uses git branch -D)." -ForegroundColor Yellow
        if ($current -ne $MainBranch) {
            Write-Warning "Checked out on '$current'. Delete step will skip that branch until you checkout $MainBranch."
        }
        exit 0
    }

    $delFlag = if ($Force) { "-D" } else { "-d" }
    foreach ($b in $candidates) {
        if ($b -eq $current) {
            Write-Warning "Skipping checked-out branch '$b'. Run: git checkout $MainBranch -- then re-run with -Delete."
            continue
        }
        Write-Host "git branch $delFlag $b" -ForegroundColor Yellow
        Invoke-WithUtf8Console { & git @("branch", $delFlag, $b) }
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "git branch $delFlag $b failed (exit $LASTEXITCODE); try -Force if you accept dropping unmerged commits on that branch name."
        }
    }

    Write-Host ""
    Write-Host "Done." -ForegroundColor Green
}
finally {
    Pop-Location | Out-Null
}
