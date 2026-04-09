# Ensures lobster-factory/packages/workflows has node_modules matching package-lock.json.

param(
    [string]$WorkRoot = "",
    [switch]$SkipAutoInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    if ($PSScriptRoot) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $WorkRoot = (Get-Location).Path
    }
} else {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
}

$wfDir = Join-Path $WorkRoot "lobster-factory\packages\workflows"
$lockPath = Join-Path $wfDir "package-lock.json"
$nmPath = Join-Path $wfDir "node_modules"

if (-not (Test-Path -LiteralPath (Join-Path $wfDir "package.json"))) {
    Write-Host "ensure-lobster-workflows-deps: skip (no package.json under workflows)." -ForegroundColor DarkGray
    exit 0
}

Write-Host ""
Write-Host "== AO-RESUME: lobster workflows deps (beginner note) ==" -ForegroundColor Cyan
Write-Host "npm ci = install packages from package-lock.json into node_modules (same as laptop/CI)."
Write-Host "node_modules is not in Git; run once per machine, or again after lockfile changes from git pull."
Write-Host ""

if ($SkipAutoInstall) {
    Write-Host "Skipped (-SkipAutoInstall). Manual:" -ForegroundColor Yellow
    Write-Host ('  cd "' + $wfDir + '"')
    Write-Host "  npm ci"
    Write-Host ""
    exit 0
}

$needCi = $false
if (-not (Test-Path -LiteralPath $nmPath)) {
    Write-Host "No node_modules yet, running npm ci..." -ForegroundColor Yellow
    $needCi = $true
} elseif (Test-Path -LiteralPath $lockPath) {
    $lockT = (Get-Item -LiteralPath $lockPath).LastWriteTimeUtc
    $nmT = (Get-Item -LiteralPath $nmPath).LastWriteTimeUtc
    if ($lockT -gt $nmT) {
        Write-Host "package-lock.json newer than node_modules (after pull?), running npm ci..." -ForegroundColor Yellow
        $needCi = $true
    }
}

if (-not $needCi) {
    Write-Host "workflows deps OK, skip npm ci." -ForegroundColor Green
    Write-Host "If gates still fail, reinstall:" -ForegroundColor DarkGray
    Write-Host ('  cd "' + $wfDir + '"')
    Write-Host "  npm ci"
    Write-Host ""
    exit 0
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Error "npm not found. Install Node.js LTS from https://nodejs.org/ then reopen terminal."
    exit 1
}

Push-Location $wfDir
try {
    Write-Host "Running npm ci in $wfDir ..." -ForegroundColor Cyan
    Write-Host "(npm may print warnings; that is normal. Chinese how-to: agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md section 2.)" -ForegroundColor DarkGray
    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm ci") -WorkingDirectory $wfDir -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -ne 0) {
        Write-Error "npm ci failed with exit $($proc.ExitCode). Try deleting node_modules folder and run npm ci again."
        exit $proc.ExitCode
    }
    Write-Host "npm ci done." -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
exit 0