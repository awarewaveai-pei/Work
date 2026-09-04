[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$db = 'hci_wave1_synthetic'

$compose   = Join-Path $root 'infra/local/compose.test.yml'
$upMig     = Join-Path $root 'database/migrations/0001_wave1_synthetic_up.sql'
$downMig   = Join-Path $root 'database/migrations/0001_wave1_synthetic_down.sql'
$upMig2    = Join-Path $root 'database/migrations/0002_wave1_case_aggregate_up.sql'
$upMig3    = Join-Path $root 'database/migrations/0003_wave1_regulatory_market_scope_up.sql'
$fixtures  = Join-Path $root 'database/fixtures/0001_synthetic.sql'
$harness   = Join-Path $root 'database/tests/00_test_harness.sql'
$sqlTests  = Join-Path $root 'database/tests/wave1-negative-tests.sql'

node --test (Join-Path $root 'tests/unit/contracts/validate-request.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Request-policy validator tests failed.' }

# Windows PowerShell 5.1 pipes native stdin as ASCII by default, which would
# silently replace any non-ASCII byte in a .sql file with '?' and still exit 0.
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not available; PostgreSQL negative tests were not run.' }

$project = "hciwave1$PID"
$envFile = Join-Path ([IO.Path]::GetTempPath()) "$project.env"
$password = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
# Written as explicit BOM-less UTF-8 bytes rather than via -Encoding. The
# 'utf8NoBOM' enum value exists only in PowerShell 7+, so this script could not
# run under Windows PowerShell 5.1; and 5.1's -Encoding UTF8 emits a BOM, which
# Docker Compose would read as part of the first variable name. Writing the
# bytes directly removes the host-version dependency entirely.
[IO.File]::WriteAllText($envFile, "HCI_WAVE1_DB_PASSWORD=$password`n", (New-Object System.Text.UTF8Encoding($false)))
$composeArgs = @('compose', '--project-name', $project, '--env-file', $envFile, '-f', $compose)

# Every step must be able to fail the run on its own. Checking $LASTEXITCODE
# only after the final psql call lets an earlier failure either vanish or
# surface as a misleading error attributed to the wrong step.
function Invoke-SqlFile {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Label)
  Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | & docker @composeArgs exec -T db psql -v ON_ERROR_STOP=1 -U hci_owner -d $db
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (psql exit $LASTEXITCODE): $Path" }
  Write-Host "  ok: $Label"
}

try {
  & docker @composeArgs up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic PostgreSQL did not become healthy.' }

  Write-Host 'Applying schema and running the negative suite...'
  Invoke-SqlFile -Path $upMig    -Label 'migration 0001 up'
  Invoke-SqlFile -Path $upMig2   -Label 'migration 0002 up (case aggregate)'
  Invoke-SqlFile -Path $upMig3   -Label 'migration 0003 up (regulatory market scope)'
  Invoke-SqlFile -Path $fixtures -Label 'synthetic fixtures'
  Invoke-SqlFile -Path $harness  -Label 'test harness'
  Invoke-SqlFile -Path $sqlTests -Label 'negative test suite'

  # Reversibility is an acceptance criterion in docs/HCI30_DELIVERY_PLAN.md
  # Phase 0, so it is exercised rather than assumed. Tearing down a populated
  # schema is the case that actually catches dependency mistakes.
  #
  # A single 'down' (0001_wave1_synthetic_down.sql) is sufficient here even
  # though three migrations are now applied: it DROPs the whole hci schema,
  # which removes everything 0002/0003 added along with everything 0001
  # added, since all three live in the same schema. The rebuild afterwards
  # must therefore re-apply all three up migrations, in order, to return to
  # the same state this test run started from. (0002_wave1_case_aggregate_down.sql
  # and 0003_wave1_regulatory_market_scope_down.sql exist for the narrower,
  # not-exercised-here case of rolling back one migration alone against a
  # schema where the others stay applied.)
  Write-Host 'Verifying the migration is reversible...'
  Invoke-SqlFile -Path $downMig -Label 'migration down (populated schema, drops 0001+0002+0003 together)'
  Invoke-SqlFile -Path $upMig   -Label 'migration 0001 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig2  -Label 'migration 0002 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig3  -Label 'migration 0003 up (clean rebuild after down)'

  Write-Host 'HCI Wave 1 local suite PASSED.'
}
finally {
  & docker @composeArgs down --volumes --remove-orphans
  Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
}
