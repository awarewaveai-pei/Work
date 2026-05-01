#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy @lobster-factory/workflows to self-hosted Trigger (local Docker build + registry push).

.DESCRIPTION
  Owner narrative: lobster-factory/infra/trigger/README.md — §「完整 deploy：registry 與 EU」.
  This script only automates safe, repeatable steps:
    - Docker daemon check
    - POSTHOG-only env file (never loads full phase1 .env into CLI — avoids wrong TRIGGER_ACCESS_TOKEN)
    - Pinned CLI version read from packages/workflows/package.json (@trigger.dev/sdk)
    - project ref read from trigger.config.ts

.PARAMETER LobsterFactoryRoot
  Path to lobster-factory package root (folder containing packages/workflows).

.PARAMETER PosthogEnvSource
  Optional path to a .env file containing POSTHOG_API_KEY and POSTHOG_HOST (e.g. hetzner-phase1-core/.env).
  If missing, deploy runs with an empty sync file (syncEnvVars will not push PostHog keys this run).

.PARAMETER TriggerApiUrl
  Self-hosted Trigger API/dashboard origin (no trailing slash).

.PARAMETER SkipDockerCheck
  Bypass docker info (not recommended).

.NOTES
  Registry hostname `registry` must resolve for Docker build/push (EU VPS tunnel + hosts, or deploy from EU).
  Secrets stay out of git; do not paste .env contents into chat.
#>
param(
    [string]$LobsterFactoryRoot = "",
    [string]$PosthogEnvSource = "",
    [string]$TriggerApiUrl = "https://trigger.aware-wave.com",
    [switch]$SkipDockerCheck
)

$ErrorActionPreference = "Stop"

function Resolve-LobsterFactoryRoot {
    param([string]$Hint)
    if ($Hint -and (Test-Path $Hint)) {
        return (Resolve-Path $Hint).Path
    }
    # Script lives at infra/trigger/
    $rp = Resolve-Path (Join-Path $PSScriptRoot "..\..")
    $candidate = $rp.Path
    if (-not (Test-Path (Join-Path $candidate "packages\workflows\trigger.config.ts"))) {
        throw "Cannot find packages/workflows under LobsterFactoryRoot: $candidate"
    }
    return $candidate
}

$Root = Resolve-LobsterFactoryRoot $LobsterFactoryRoot
$WorkflowsDir = Join-Path $Root "packages\workflows"
$CfgPath = Join-Path $WorkflowsDir "trigger.config.ts"
$PkgPath = Join-Path $WorkflowsDir "package.json"

if (-not $SkipDockerCheck) {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon not reachable. Start Docker Desktop (or Docker Engine), then retry."
    }
}

$m = Select-String -Path $CfgPath -Pattern 'project:\s*"([^"]+)"' | Select-Object -First 1
if (-not $m) {
    throw "Could not parse project ref from $CfgPath"
}
$ProjectRef = $m.Matches.Groups[1].Value

$pkgJson = Get-Content $PkgPath -Raw | ConvertFrom-Json
$triggerSdkVer = $pkgJson.dependencies.'@trigger.dev/sdk'
if (-not $triggerSdkVer) {
    throw "Missing @trigger.dev/sdk in $PkgPath"
}

if (-not $PosthogEnvSource) {
    $PosthogEnvSource = Join-Path $Root "infra\hetzner-phase1-core\.env"
}

$tmpEnv = Join-Path ([System.IO.Path]::GetTempPath()) ("trigger-posthog-only-" + [guid]::NewGuid().ToString("n") + ".env")
try {
    if ((Test-Path $PosthogEnvSource)) {
        Get-Content $PosthogEnvSource | Where-Object { $_ -match '^\s*(POSTHOG_API_KEY|POSTHOG_HOST)\s*=' } | Set-Content -Path $tmpEnv -Encoding utf8
        Write-Host "Using POSTHOG-only excerpt from: $PosthogEnvSource"
    }
    else {
        Set-Content -Path $tmpEnv -Value "" -Encoding utf8
        Write-Warning "Posthog env source not found; deploying without POSTHOG_* sync this run: $PosthogEnvSource"
    }

    Remove-Item Env:CI -ErrorAction SilentlyContinue
    Remove-Item Env:GITHUB_ACTIONS -ErrorAction SilentlyContinue
    Remove-Item Env:CONTINUOUS_INTEGRATION -ErrorAction SilentlyContinue
    Remove-Item Env:TRIGGER_ACCESS_TOKEN -ErrorAction SilentlyContinue

    Push-Location $WorkflowsDir
    try {
        Write-Host "Deploy project=$ProjectRef api=$TriggerApiUrl cli=@trigger.dev/cli matching sdk $triggerSdkVer"
        Write-Host "If push fails on registry:5000, follow infra/trigger/README.md — EU tunnel + hosts entry for name 'registry'."
        & npx --yes "trigger.dev@$triggerSdkVer" deploy `
            -p $ProjectRef `
            --env-file $tmpEnv `
            -a $TriggerApiUrl `
            --skip-telemetry
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item $tmpEnv -Force -ErrorAction SilentlyContinue
}
