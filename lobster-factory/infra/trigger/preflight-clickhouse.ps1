# Runs validate-config.ps1 then: docker compose --profile preflight run --rm clickhouse-config-check
# (container runs Bitnami setup + clickhouse extract-from-config — validates merged config incl. override.xml)
# Requires Docker engine running (Docker Desktop on Windows).
param(
  [string]$EnvFile = ".env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$here = $PSScriptRoot
$resolvedEnv = Join-Path $here $EnvFile

function Test-DockerEngineReachable {
  cmd /c "docker info >nul 2>&1"
  return ($LASTEXITCODE -eq 0)
}

if (-not (Test-DockerEngineReachable)) {
  Write-Host ""
  Write-Host "[preflight] Cannot reach Docker engine (daemon not running?)." -ForegroundColor Yellow
  Write-Host "            Start Docker Desktop and wait until it shows Running, then retry." -ForegroundColor Yellow
  Write-Host "            Quick check: docker info   (should show Server section, not npipe error)." -ForegroundColor Gray
  Write-Host ""
  exit 2
}

if (-not (Test-Path -LiteralPath $resolvedEnv)) {
  Write-Host "[preflight] Missing env file: $resolvedEnv" -ForegroundColor Red
  Write-Host "            Run: Copy-Item .env.example .env  and fill values (see README)." -ForegroundColor Gray
  exit 1
}

$validate = Join-Path $here "validate-config.ps1"
if (-not (Test-Path -LiteralPath $validate)) {
  throw "Missing validate-config.ps1 at $validate"
}

Write-Host "Running validate-config.ps1 ..." -ForegroundColor Cyan
& $validate
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Running clickhouse-config-check (docker compose --profile preflight) ..." -ForegroundColor Cyan
Push-Location -LiteralPath $here
try {
  docker compose --env-file $EnvFile --profile preflight run --rm clickhouse-config-check
  $exit = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($exit -ne 0) {
  exit $exit
}

Write-Host "ClickHouse preflight completed successfully." -ForegroundColor Green
exit 0
