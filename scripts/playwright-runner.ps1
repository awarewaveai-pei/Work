<#
.SYNOPSIS
    Playwright E2E test runner - orchestrates install, execution, and evidence archival.

.DESCRIPTION
    Owner: scripts/playwright-runner.ps1 (monorepo canonical, do not duplicate)
    Called by: .claude/commands/playwright.md (the /playwright skill), and as the operator-run
    follow-up step in .claude/commands/sg-deploy.md (Mode=smoke) and wp-maintenance.md (Mode=client).
    NOT called by scripts/sg-deploy.sh on the host: that script's own Step 7 smoke is curl-based.

    Modes
    -----
    smoke      Fast post-deploy sanity (3-5 min). Runs project=smoke + mobile-smoke.
    qa         Full UI flows. Needs OPS_TEST_EMAIL + OPS_TEST_PASSWORD env vars.
    client     WordPress site health + screenshots. Needs -ClientSlug or -ClientUrl.
    screenshot On-demand full-page PNG capture. Needs -TargetUrl.
    a11y       WCAG 2.1 AA audit via @axe-core/playwright.
    perf       Load time + LCP + TTFB checks.
    all        Smoke + qa + client + a11y + perf sequentially.
    install    Install Playwright browsers only (no tests run).

    Output
    ------
    JSON results  -> <ReportDir>/playwright-results.json
    HTML report   -> <ReportDir>/playwright-report/index.html
    Screenshots   -> <ReportDir>/screenshots/**/*.png
    Copied to     -> agency-os/reports/e2e/YYYY-MM-DD/<Mode>/

.PARAMETER Mode
    One of: smoke | qa | client | screenshot | a11y | perf | cognitive | all | install

.PARAMETER ClientSlug
    Tenant slug (e.g. soulful-expression). Resolves URL from ENVIRONMENT_REGISTRY.md.

.PARAMETER ClientUrl
    Override: pass URL directly instead of resolving from registry.

.PARAMETER TargetUrl
    URL for screenshot mode (defaults to ClientUrl / BASE_URL if not set).

.PARAMETER Label
    Label suffix for screenshot file names (default: capture).

.PARAMETER BaseUrl
    Override the ops dashboard base URL (default: https://app.aware-wave.com).

.PARAMETER ApiUrl
    Override the API base URL (default: https://api.aware-wave.com).

.PARAMETER ReportDir
    Where reports land before archiving (default: tests/playwright-output).

.PARAMETER SkipInstall
    Skip `npm install` if node_modules already present.

.PARAMETER LcpLimitMs
    LCP threshold for perf tests in ms (default: 4000).

.PARAMETER LoadLimitMs
    Total load time threshold for perf tests in ms (default: 8000).

.EXAMPLE
    .\scripts\playwright-runner.ps1 -Mode smoke
    .\scripts\playwright-runner.ps1 -Mode client -ClientSlug soulful-expression
    .\scripts\playwright-runner.ps1 -Mode screenshot -TargetUrl https://soulfulexpression.org -Label soulful-before-update
    .\scripts\playwright-runner.ps1 -Mode a11y -BaseUrl https://app.aware-wave.com
    .\scripts\playwright-runner.ps1 -Mode install
#>
[CmdletBinding()]
param(
    [ValidateSet('smoke','qa','client','screenshot','a11y','perf','cognitive','all','install')]
    [string]$Mode = 'smoke',

    [string]$ClientSlug  = '',
    [string]$ClientUrl   = '',
    [string]$TargetUrl   = '',
    [string]$Label       = 'capture',
    [string]$BaseUrl     = 'https://app.aware-wave.com',
    [string]$ApiUrl      = 'https://api.aware-wave.com',
    [string]$N8nUrl      = 'https://n8n.aware-wave.com',
    [string]$ReportDir   = '',
    [switch]$SkipInstall,
    [int]$LcpLimitMs     = 4000,
    [int]$LoadLimitMs    = 8000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Paths ---------------------------------------------------------------------
$MonoRoot  = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$TestsDir  = Join-Path $MonoRoot 'lobster-factory\infra\hetzner-phase1-core\tests'
$TenantsDir= Join-Path $MonoRoot 'agency-os\tenants'
$ArchiveBase = Join-Path $MonoRoot 'agency-os\reports\e2e'
$CognitiveUserEnv = Join-Path $MonoRoot 'mcp\user-env.ps1'

if (-not $ReportDir) {
    $ReportDir = Join-Path $TestsDir 'playwright-output'
}
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null

$DateLabel   = (Get-Date -Format 'yyyy-MM-dd')
$ModeArchive = Join-Path $ArchiveBase "$DateLabel\$Mode"
New-Item -ItemType Directory -Force -Path $ModeArchive | Out-Null

# --- Helpers -------------------------------------------------------------------
function Write-Step { param([string]$Msg) Write-Host "  > $Msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Msg) Write-Host "  [OK] $Msg" -ForegroundColor Green }
function Write-Warn { param([string]$Msg) Write-Host "  [!] $Msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$Msg) Write-Host "  [X] $Msg" -ForegroundColor Red }

function Assert-NodeAvailable {
    try { $v = & node --version 2>&1; Write-Ok "Node.js $v" }
    catch { throw 'Node.js not found on PATH. Install from https://nodejs.org/' }
    try { $v = & npm --version 2>&1;  Write-Ok "npm $v" }
    catch { throw 'npm not found. Reinstall Node.js.' }
}

function Resolve-ClientUrl {
    if ($ClientUrl) { return $ClientUrl }
    if (-not $ClientSlug) { return '' }

    $regPath = Join-Path $TenantsDir "$ClientSlug\core\ENVIRONMENT_REGISTRY.md"
    if (-not (Test-Path $regPath)) {
        Write-Warn "ENVIRONMENT_REGISTRY.md not found for '$ClientSlug' at $regPath"
        return ''
    }
    $content = Get-Content $regPath -Raw -Encoding UTF8
    # Extract production URL from the table row starting with "| production"
    if ($content -match '\|\s*production\s*\|\s*(https?://[^\s|]+)') {
        $url = $matches[1].Trim()
        Write-Ok "Resolved client URL: $url"
        return $url
    }
    Write-Warn "Could not parse production URL from $regPath"
    return ''
}

function Install-PlaywrightDeps {
    Push-Location $TestsDir
    try {
        $nmPath = Join-Path $TestsDir 'node_modules'
        if ($SkipInstall -and (Test-Path $nmPath)) {
            Write-Ok 'node_modules present - skipping npm install'
        } else {
            Write-Step 'npm install'
            & npm install --prefer-offline 2>&1 | Write-Host
            if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
        }

        # Always ensure browsers - idempotent
        Write-Step 'playwright install chromium'
        & npx playwright install chromium --with-deps 2>&1 | Write-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Warn 'Browser install returned non-zero - may need admin rights or --with-deps support'
        }
    } finally {
        Pop-Location
    }
}

function Invoke-PlaywrightProject {
    param(
        [string[]]$Projects,
        [hashtable]$ExtraEnv = @{}
    )

    # Playwright writes reports relative to tests/ dir (as configured in playwright.config.ts)
    $localResultsJson = Join-Path $TestsDir 'playwright-results.json'
    $localHtmlReport  = Join-Path $TestsDir 'playwright-report'
    $screenshots      = Join-Path $ReportDir 'screenshots'

    # Set env vars - Playwright picks these up via process.env in config + specs
    $env:PLAYWRIGHT_BASE_URL        = $BaseUrl
    $env:PLAYWRIGHT_API_URL         = $ApiUrl
    $env:PLAYWRIGHT_N8N_URL         = $N8nUrl
    $env:PLAYWRIGHT_SCREENSHOTS_DIR = $screenshots
    $env:PLAYWRIGHT_PERF_LCP_MS     = "$LcpLimitMs"
    $env:PLAYWRIGHT_PERF_LOAD_MS    = "$LoadLimitMs"

    foreach ($k in $ExtraEnv.Keys) { [System.Environment]::SetEnvironmentVariable($k, $ExtraEnv[$k], 'Process') }

    $projectArgs = @()
    foreach ($p in $Projects) { $projectArgs += '--project'; $projectArgs += $p }

    Push-Location $TestsDir
    try {
        Write-Step "playwright test $($Projects -join ', ')"
        # Use reporters from playwright.config.ts - do NOT pass --reporter on CLI
        # (CLI format differs from config format and breaks JSON output path)
        & npx playwright test @projectArgs --config playwright.config.ts 2>&1 | Write-Host
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    # Archive: copy from tests/ working dir to dated evidence dir
    if (Test-Path $localResultsJson) {
        Copy-Item $localResultsJson (Join-Path $ModeArchive 'results.json') -Force
    }
    if (Test-Path $localHtmlReport) {
        $htmlArchive = Join-Path $ModeArchive 'playwright-report'
        if (Test-Path $htmlArchive) { Remove-Item $htmlArchive -Recurse -Force }
        Copy-Item $localHtmlReport $htmlArchive -Recurse -Force
    }
    if (Test-Path $screenshots) {
        $ssArchive = Join-Path $ModeArchive 'screenshots'
        if (Test-Path $ssArchive) { Remove-Item $ssArchive -Recurse -Force }
        Copy-Item $screenshots $ssArchive -Recurse -Force
    }

    return @{ ExitCode = $exitCode; ResultsJson = $localResultsJson }
}

function Read-PlaywrightResults {
    param([string]$JsonPath)
    if (-not (Test-Path $JsonPath)) { return $null }
    try { return (Get-Content $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { return $null }
}

function Format-Summary {
    param($Results, [string]$Mode)
    if (-not $Results) { Write-Warn 'No results JSON found'; return }

    # Playwright JSON output has a top-level "stats" object - use it directly
    $stats   = $Results.stats
    $passed  = if ($stats.expected)   { $stats.expected  } else { 0 }
    $failed  = if ($stats.unexpected) { $stats.unexpected } else { 0 }
    $skipped = if ($stats.skipped)    { $stats.skipped   } else { 0 }
    $total   = $passed + $failed + $skipped
    $icon    = if ($failed -eq 0) { 'PASSED' } else { 'FAILED' }

    Write-Host ""
    Write-Host "--- Playwright $Mode results ---------------------------" -ForegroundColor Cyan
    Write-Host "   [$icon]  Passed: $passed   Failed: $failed   Skipped: $skipped   Total: $total"
    if ($failed -gt 0) {
        Write-Host "   Report: $ModeArchive\playwright-report\index.html" -ForegroundColor Yellow
    }
    Write-Host "   Evidence: $ModeArchive" -ForegroundColor DarkGray
    Write-Host ""
}

# --- Main dispatch -------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  playwright-runner  mode=$Mode  $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Assert-NodeAvailable

if ($Mode -eq 'install') {
    Install-PlaywrightDeps
    Write-Ok 'Playwright browsers installed. Ready to run tests.'
    exit 0
}

Install-PlaywrightDeps

$resolvedClientUrl = Resolve-ClientUrl
$overallExit = 0

switch ($Mode) {
    'smoke' {
        $r = Invoke-PlaywrightProject -Projects @('smoke', 'mobile-smoke')
        Format-Summary (Read-PlaywrightResults $r.ResultsJson) 'smoke'
        $overallExit = $r.ExitCode
    }

    'qa' {
        if (-not $env:OPS_TEST_EMAIL -or -not $env:OPS_TEST_PASSWORD) {
            Write-Warn 'OPS_TEST_EMAIL / OPS_TEST_PASSWORD not set - QA auth tests will skip'
        }
        $r = Invoke-PlaywrightProject -Projects @('qa')
        Format-Summary (Read-PlaywrightResults $r.ResultsJson) 'qa'
        $overallExit = $r.ExitCode
    }

    'client' {
        if (-not $resolvedClientUrl) {
            throw 'Client URL required. Use -ClientSlug <slug> or -ClientUrl <url>'
        }
        $r = Invoke-PlaywrightProject `
            -Projects @('client') `
            -ExtraEnv @{ PLAYWRIGHT_CLIENT_URL = $resolvedClientUrl }
        Format-Summary (Read-PlaywrightResults $r.ResultsJson) "client ($resolvedClientUrl)"
        $overallExit = $r.ExitCode
    }

    'screenshot' {
        $ssUrl = if ($TargetUrl) { $TargetUrl } elseif ($resolvedClientUrl) { $resolvedClientUrl } else { $BaseUrl }
        $r = Invoke-PlaywrightProject `
            -Projects @('screenshot') `
            -ExtraEnv @{
                PLAYWRIGHT_TARGET_URL  = $ssUrl
                PLAYWRIGHT_CLIENT_URL  = $ssUrl
                PLAYWRIGHT_LABEL       = $Label
            }
        Format-Summary (Read-PlaywrightResults $r.ResultsJson) "screenshot ($ssUrl)"
        Write-Ok "Screenshots -> $ModeArchive\screenshots"
        $overallExit = $r.ExitCode
    }

    'a11y' {
        $r = Invoke-PlaywrightProject -Projects @('a11y')
        Format-Summary (Read-PlaywrightResults $r.ResultsJson) 'a11y'
        $overallExit = $r.ExitCode
    }

    'perf' {
        $perfUrl = if ($resolvedClientUrl) { $resolvedClientUrl } else { $BaseUrl }
        $r = Invoke-PlaywrightProject `
            -Projects @('perf') `
            -ExtraEnv @{ PLAYWRIGHT_CLIENT_URL = $perfUrl }
        Format-Summary (Read-PlaywrightResults $r.ResultsJson) 'perf'
        $overallExit = $r.ExitCode
    }

    'cognitive' {
        if (Test-Path -LiteralPath $CognitiveUserEnv) {
            . $CognitiveUserEnv
        }
        if (-not $env:COS_TEST_TENANT_ID -or -not $env:COS_TEST_EMAIL -or -not $env:COS_TEST_PASSWORD -or -not $env:COS_TEST_PROJECT_ID) {
            Write-Warn 'COS_TEST_TENANT_ID / COS_TEST_EMAIL / COS_TEST_PASSWORD / COS_TEST_PROJECT_ID not set - cognitive E2E test will skip'
        }
        $r = Invoke-PlaywrightProject -Projects @('cognitive') -ExtraEnv @{ PLAYWRIGHT_COS_URL = $BaseUrl }
        Format-Summary (Read-PlaywrightResults $r.ResultsJson) 'cognitive'
        $overallExit = $r.ExitCode
    }

    'all' {
        $modes = @(
            @{ Projects = @('smoke','mobile-smoke'); Env = @{} },
            @{ Projects = @('qa');                   Env = @{} },
            @{ Projects = @('a11y');                 Env = @{} },
            @{ Projects = @('perf');                 Env = @{} },
            @{ Projects = @('cognitive');            Env = @{ PLAYWRIGHT_COS_URL = $BaseUrl } }
        )
        if ($resolvedClientUrl) {
            $modes += @{ Projects = @('client'); Env = @{ PLAYWRIGHT_CLIENT_URL = $resolvedClientUrl } }
        }
        foreach ($m in $modes) {
            $r = Invoke-PlaywrightProject -Projects $m.Projects -ExtraEnv $m.Env
            Format-Summary (Read-PlaywrightResults $r.ResultsJson) ($m.Projects -join '+')
            if ($r.ExitCode -ne 0) { $overallExit = $r.ExitCode }
        }
    }
}

if ($overallExit -ne 0) {
    Write-Fail "playwright-runner exited with failures (exit $overallExit)"
    Write-Host "  -> Open report: $ModeArchive\playwright-report\index.html" -ForegroundColor Yellow
} else {
    Write-Ok "playwright-runner PASSED - evidence at $ModeArchive"
}

exit $overallExit
