[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root 'compose.test.yml'
$migration = Join-Path $root 'database/migrations/0001_wave1_synthetic_up.sql'
$fixtures = Join-Path $root 'database/fixtures/0001_synthetic.sql'
$sqlTests = Join-Path $root 'database/tests/wave1-negative-tests.sql'

node --test (Join-Path $root 'runtime/validate-request.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Request-policy validator tests failed.' }

$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not available; PostgreSQL negative tests were not run.' }
$project = "hciwave1$PID"
$envFile = Join-Path ([IO.Path]::GetTempPath()) "$project.env"
$password = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
Set-Content -LiteralPath $envFile -Value "HCI_WAVE1_DB_PASSWORD=$password" -Encoding utf8NoBOM
$composeArgs = @('compose', '--project-name', $project, '--env-file', $envFile, '-f', $compose)

try {
  & docker @composeArgs up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic PostgreSQL did not become healthy.' }
  Get-Content -Raw $migration | & docker @composeArgs exec -T db psql -v ON_ERROR_STOP=1 -U hci_owner -d hci_wave1_synthetic
  Get-Content -Raw $fixtures | & docker @composeArgs exec -T db psql -v ON_ERROR_STOP=1 -U hci_owner -d hci_wave1_synthetic
  Get-Content -Raw $sqlTests | & docker @composeArgs exec -T db psql -v ON_ERROR_STOP=1 -U hci_owner -d hci_wave1_synthetic
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL negative tests failed.' }
}
finally {
  & docker @composeArgs down --volumes --remove-orphans
  Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
}
