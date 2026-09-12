[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$db = 'hci_wave1_synthetic'
$compose = Join-Path $root 'infra/local/compose.dev.yml'
$project = 'hci30dev'
$envFile = Join-Path $root 'infra/local/.env.dev'

$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }

if (-not (Test-Path -LiteralPath $envFile)) {
  $password = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
  [IO.File]::WriteAllText($envFile, "HCI_DEV_DB_PASSWORD=$password`n", (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Generated $envFile (gitignored, not committed)."
}
$composeArgs = @('compose', '--project-name', $project, '--env-file', $envFile, '-f', $compose)

function Invoke-SqlFile {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Label)
  Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | & docker @composeArgs exec -T db psql -v ON_ERROR_STOP=1 -U hci_owner -d $db
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (psql exit $LASTEXITCODE): $Path" }
  Write-Host "  ok: $Label"
}

& docker @composeArgs up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Dev PostgreSQL did not become healthy.' }

# Checks the LATEST migration's own marker, not an early one (critic review,
# 2026-09-08: checking hci.cases -- migration 0002 -- would report "already
# applied" and silently skip later migrations on any volume from before they
# existed, since this check is all-or-nothing, not per-migration). 0018 adds
# a plain column to an existing table, so its marker is an
# information_schema existence check. Update this alongside the loop bound
# below whenever a new migration lands, same maintenance the project
# already accepts for the equivalent $upMigN lists in
# test-wave1-local.ps1/mutation-check-wave1.ps1.
$check = & docker @composeArgs exec -T db psql -tA -U hci_owner -d $db -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='hci' AND table_name='subject_records' AND column_name='content_hash')"
if ($check -match 't') {
  Write-Host 'Schema already applied (hci.subject_records.content_hash exists, migration 0018) -- skipping migrations, DB left as-is.'
  exit 0
}

Write-Host 'Applying Wave 1 schema (18 migrations + synthetic fixtures)...'
$db2 = Join-Path $root 'database'
1..18 | ForEach-Object {
  $n = '{0:D4}' -f $_
  $f = Get-ChildItem -LiteralPath (Join-Path $db2 'migrations') -Filter "${n}_*_up.sql" | Select-Object -First 1
  Invoke-SqlFile -Path $f.FullName -Label "migration $n up"
}
Invoke-SqlFile -Path (Join-Path $db2 'fixtures/0001_synthetic.sql') -Label 'synthetic fixtures'

Write-Host "Dev DB ready at 127.0.0.1:5433/$db (project '$project', left running)."
