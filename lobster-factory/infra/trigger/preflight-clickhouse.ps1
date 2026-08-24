# ClickHouse config preflight: static guardrails, then behavioural validation.
#
#   1. validate-config.ps1            text-level invariants (image pins, retired
#                                     generators still disabled, memory budget unchanged)
#   2. clickhouse/validate-override.sh boots a disposable ClickHouse 25.7.5 with the
#                                     candidate override.xml and asserts the invariants
#                                     against the running server
#
# Step 2 used to be `docker compose --profile preflight run --rm clickhouse-config-check`,
# which never worked: it invoked `clickhouse-server --check-config`, but that binary is not
# on PATH in the bitnami image and `--check-config` does not exist in ClickHouse 25.7. The
# comment that used to sit here claimed it "validates merged config incl. override.xml" -
# it validated nothing, and it reported success every time. See the removed service block
# in docker-compose.yml. Requires Docker engine running (Docker Desktop on Windows).
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

$validator = Join-Path $here "clickhouse\validate-override.sh"
if (-not (Test-Path -LiteralPath $validator)) {
  throw "Missing clickhouse/validate-override.sh at $validator"
}

$bash = Get-Command bash -ErrorAction SilentlyContinue
if (-not $bash) {
  Write-Host "[preflight] bash not found - cannot run the behavioural validator." -ForegroundColor Yellow
  Write-Host "            Git for Windows ships it; or run it on any Docker host:" -ForegroundColor Gray
  Write-Host "            ./clickhouse/validate-override.sh" -ForegroundColor Gray
  exit 2
}

Write-Host "Running clickhouse/validate-override.sh (boots a disposable ClickHouse) ..." -ForegroundColor Cyan
Push-Location -LiteralPath $here
try {
  & $bash.Source "clickhouse/validate-override.sh"
  $exit = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($exit -ne 0) {
  exit $exit
}

Write-Host "ClickHouse preflight completed successfully." -ForegroundColor Green
exit 0
