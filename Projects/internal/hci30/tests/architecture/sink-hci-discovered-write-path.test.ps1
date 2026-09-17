[CmdletBinding()]
param()

# HCI-30 collector pipeline -- sink/hci-discovered write path real-Postgres
# test (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 8). Spins up a fresh
# throwaway Postgres via infra/local/compose.test.yml (same file
# scripts/test-wave1-local.ps1 uses), applies migrations 0001-0020 +
# synthetic fixtures (no negative-test suite -- not needed here and adds
# time), then runs app/scripts/verify-sink-hci-discovered.mjs against it for
# real (real pg connection, real SET ROLE, real RLS, real triggers).
#
# compose.test.yml's own header comment states an explicit design
# invariant: NO host port mapping, specifically so concurrent throwaway runs
# (CI, mutation-check, or -- as found while writing this file -- multiple
# concurrent Claude Code sessions on one machine) never collide on a fixed
# port. This test needs a host-reachable port (app/scripts/verify-sink-hci-
# discovered.mjs runs on the HOST via `node`, not inside a container, so it
# cannot reach the `db` service by its compose-internal DNS name). Respecting
# the invariant means never editing compose.test.yml itself -- a second,
# generated-per-run override file adds ONLY a port mapping via `docker
# compose -f compose.test.yml -f <override>`, PID-derived so two concurrent
# runs on this machine still cannot collide with each other.
$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$compose   = Join-Path $root 'infra/local/compose.test.yml'
$verifyJs  = Join-Path $root 'app/scripts/verify-sink-hci-discovered.mjs'
$db        = 'hci_wave1_synthetic'
$upMigs    = 1..20 | ForEach-Object {
  $n = '{0:D4}' -f $_
  Get-ChildItem -LiteralPath (Join-Path $root 'database/migrations') -Filter "${n}_*_up.sql" | Select-Object -First 1
}
$fixtures  = Join-Path $root 'database/fixtures/0001_synthetic.sql'

if (-not (Test-Path $compose))  { throw "compose file not found: $compose" }
if (-not (Test-Path $verifyJs)) { throw "verification script not found: $verifyJs" }
if ($upMigs.Count -ne 20) { throw "expected 20 up-migrations, found $($upMigs.Count) -- migration file layout changed, update this test" }

$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not available; sink/hci-discovered write-path test was not run.' }

$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$project  = "hcisink$PID"
$envFile  = Join-Path ([IO.Path]::GetTempPath()) "$project.env"
$password = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
[IO.File]::WriteAllText($envFile, "HCI_WAVE1_DB_PASSWORD=$password`n", (New-Object System.Text.UTF8Encoding($false)))

# PID-derived, not fixed: two concurrent invocations of this test on one
# machine (this session already shares the machine with parallel Claude Code
# sessions) get different host ports instead of racing for the same one.
$hostPort = 25432 + ($PID % 5000)
$overrideFile = Join-Path ([IO.Path]::GetTempPath()) "$project-port-override.yml"
$overrideContent = @"
services:
  db:
    ports:
      - "127.0.0.1:${hostPort}:5432"
"@
[IO.File]::WriteAllText($overrideFile, $overrideContent + "`n", (New-Object System.Text.UTF8Encoding($false)))

$composeArgs = @('compose', '--project-name', $project, '--env-file', $envFile, '-f', $compose, '-f', $overrideFile)

function Invoke-SqlFile {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Label)
  Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | & docker @composeArgs exec -T db psql -v ON_ERROR_STOP=1 -U hci_owner -d $db
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (psql exit $LASTEXITCODE): $Path" }
  Write-Host "  ok: $Label"
}

try {
  Write-Host "Starting throwaway Postgres (project '$project', host port $hostPort)..."
  & docker @composeArgs up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'Throwaway PostgreSQL did not become healthy.' }

  Write-Host 'Applying migrations 0001-0020 + synthetic fixtures...'
  foreach ($mig in $upMigs) { Invoke-SqlFile -Path $mig.FullName -Label "migration $($mig.BaseName)" }
  Invoke-SqlFile -Path $fixtures -Label 'synthetic fixtures'

  Write-Host 'Running the real-Postgres write-path verification (Node, real pg connection)...'
  $env:HCI_VERIFY_DB_HOST = '127.0.0.1'
  $env:HCI_VERIFY_DB_PORT = "$hostPort"
  $env:HCI_VERIFY_DB_PASSWORD = $password
  try {
    node $verifyJs
    if ($LASTEXITCODE -ne 0) { throw "verify-sink-hci-discovered.mjs failed (exit $LASTEXITCODE)" }
  } finally {
    Remove-Item Env:\HCI_VERIFY_DB_HOST, Env:\HCI_VERIFY_DB_PORT, Env:\HCI_VERIFY_DB_PASSWORD -ErrorAction SilentlyContinue
  }

  Write-Host ''
  Write-Host 'HCI-30 sink/hci-discovered write-path test PASSED (Task 8).'
}
finally {
  & docker @composeArgs down --volumes --remove-orphans
  Remove-Item -LiteralPath $envFile, $overrideFile -Force -ErrorAction SilentlyContinue
}
