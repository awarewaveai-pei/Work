[CmdletBinding()]
param()

# Resets the persistent local dev DB (hci30dev, port 5433) to a genuinely
# EMPTY state: schema applied, zero demo cases/records/decisions. Distinct
# from dev-db-init.ps1, which seeds fixtures/0001_synthetic.sql -- that file
# is load-bearing for the real-Docker negative-test suite (wave1-negative-
# tests.sql references its exact fixture ids) and must not be edited to
# remove case data. This script never touches it.
#
# Operator-requested 2026-09-10 ("先把所有測試的舊資料刪掉", then clarified
# to include the fixture-seeded demo cases too, "全部清空") after the
# in-progress/closed case lists accumulated demo cases across many prior
# sessions. A full volume wipe + rebuild was already done once as part of
# that request; this script codifies the "give me an empty case list, not
# just fewer cases" outcome as a repeatable command instead of an ad-hoc
# one-off, since the same request is likely to recur.
#
# Scaffolding inserted below is the documented MINIMUM the app needs to
# function at all (verified against server.mjs + migrations/0001 comments,
# not guessed): hci.current_tenant_id() (0001) resolves a role's tenant via
# hci.app_tenant_bindings -- with no binding row, every RLS policy denies
# every read/write for that role, and POST /cases separately requires an
# ACTIVE, non-expired hci.tenant_authorizations row to open a case at all.
# Both tenants get ACTIVE authorizations here (unlike fixtures/0001_
# synthetic.sql, which deliberately leaves tenant B REVOKED-only to
# demonstrate the 409 path) -- this script's whole purpose is a usable
# empty slate, not a test scenario. Persons/keys/principals need no seed
# row: POST /persons, hci.mint_encryption_key(), and
# findOrCreateReviewerPrincipal() each create what they need on first use.

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
function Invoke-SqlText {
  param([Parameter(Mandatory)][string]$Sql, [Parameter(Mandatory)][string]$Label)
  $Sql | & docker @composeArgs exec -T db psql -v ON_ERROR_STOP=1 -U hci_owner -d $db
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (psql exit $LASTEXITCODE)" }
  Write-Host "  ok: $Label"
}

Write-Host "Wiping hci30dev volume (all demo data, unconditionally)..."
& docker @composeArgs down --volumes
& docker @composeArgs up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Dev PostgreSQL did not become healthy.' }

$db2 = Join-Path $root 'database'
$migrationCount = (Get-ChildItem -LiteralPath (Join-Path $db2 'migrations') -Filter '*_up.sql').Count
Write-Host "Applying Wave 1 schema ($migrationCount migrations, no demo fixtures)..."
1..$migrationCount | ForEach-Object {
  $n = '{0:D4}' -f $_
  $f = Get-ChildItem -LiteralPath (Join-Path $db2 'migrations') -Filter "${n}_*_up.sql" | Select-Object -First 1
  Invoke-SqlFile -Path $f.FullName -Label "migration $n up"
}

Invoke-SqlText -Label 'minimal tenant scaffolding (no demo cases)' -Sql @'
INSERT INTO hci.tenants (id,slug,jurisdiction) VALUES
  ('11111111-1111-1111-1111-111111111111','tenant-a','US'),
  ('22222222-2222-2222-2222-222222222222','tenant-b','US');
INSERT INTO hci.app_tenant_bindings VALUES
  ('hci_app_test_a', '11111111-1111-1111-1111-111111111111'),
  ('hci_app_test_b', '22222222-2222-2222-2222-222222222222');
INSERT INTO hci.tenant_authorizations (id,tenant_id,status,expires_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ACTIVE',NULL),
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','ACTIVE',NULL);
'@

Write-Host "Dev DB reset to EMPTY at 127.0.0.1:5433/$db (project '$project', left running). Both tenants can open new cases; case lists start at zero."
