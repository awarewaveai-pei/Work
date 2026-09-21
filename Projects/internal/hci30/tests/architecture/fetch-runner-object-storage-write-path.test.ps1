[CmdletBinding()]
param()

# HCI-30 isolated fetch runner object-storage write-path test
# (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 5). Real, re-runnable
# verification against the actual MinIO instance provisioned by Task 3
# (compose.fetch-runner.yml's `object-storage` service) -- no mock. Same
# orchestration pattern as fetch-runner-network-isolation.test.ps1: fresh
# project name, generated secrets/env file, `finally` teardown,
# local-Docker-endpoint guard.
#
# Binary payloads move via `docker compose cp` (files), never through a
# captured PowerShell stdout string -- this repo's own isolation test already
# found that route mangles content across the PS/native-exe boundary for
# plain text; it would be strictly worse for arbitrary bytes.
#
# Scope: local/test only. Never deploys to ks-aw-01 (agency-os/AGENTS.md SS3).
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$compose = Join-Path $root 'infra/local/compose.fetch-runner.yml'
if (-not (Test-Path $compose)) { throw "compose file not found: $compose" }

$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not available; object-storage write-path test was not run.' }

$project = "hcifetchrunnerobj$PID"
$envFile = Join-Path ([IO.Path]::GetTempPath()) "$project.env"
$minioIp = '172.30.42.10' # must match compose.fetch-runner.yml's hci-fetch-runner-net subnet (172.30.42.0/24)
$bucket  = 'hci-fetch-runner-raw' # must match compose.fetch-runner.yml's MINIO_DEFAULT_BUCKETS
$sharedSecret  = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
$minioUser     = 'hcifetchrunner'
$minioPassword = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())

$envContent = @"
HCI_FETCH_RUNNER_SHARED_SECRET=$sharedSecret
HCI_FETCH_RUNNER_MINIO_IP=$minioIp
HCI_FETCH_RUNNER_MINIO_ROOT_USER=$minioUser
HCI_FETCH_RUNNER_MINIO_ROOT_PASSWORD=$minioPassword
"@
[IO.File]::WriteAllText($envFile, $envContent + "`n", (New-Object System.Text.UTF8Encoding($false)))

$composeArgs = @('compose', '--project-name', $project, '--env-file', $envFile, '-f', $compose)

function Wait-ContainerHealthy {
  param([Parameter(Mandatory)][string]$ServiceName, [int]$TimeoutSec = 60)
  $containerId = & docker @composeArgs ps -q $ServiceName
  if (-not $containerId) { throw "$ServiceName container not found" }
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $status = & docker inspect $containerId --format '{{.State.Health.Status}}'
    if ($status -eq 'healthy') { return }
    Start-Sleep -Seconds 1
  }
  $lastStatus = & docker inspect $containerId --format '{{.State.Health.Status}}'
  throw "$ServiceName did not become healthy within ${TimeoutSec}s (last status: $lastStatus)"
}

# Same EAP-toggle technique as fetch-runner-network-isolation.test.ps1's
# Test-Blocked: under $ErrorActionPreference = 'Stop', a native command's own
# stderr text becomes a script-terminating error independent of exit code, so
# this must run with EAP='Continue' for the deliberately-failing cases below.
function Invoke-RunnerExec {
  param([Parameter(Mandatory)][string[]]$ExecArgs)
  $previousEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & docker @composeArgs exec -T runner @ExecArgs 2>&1
  } finally {
    $ErrorActionPreference = $previousEap
  }
  [PSCustomObject]@{ Output = (@($output) -join "`n"); ExitCode = $LASTEXITCODE }
}

function Get-Sha256Hex {
  param([Parameter(Mandatory)][byte[]]$Bytes)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try { ([BitConverter]::ToString($hasher.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
  finally { $hasher.Dispose() }
}

$syntheticFile  = Join-Path ([IO.Path]::GetTempPath()) "$project-synthetic.bin"
$retrievedFile  = Join-Path ([IO.Path]::GetTempPath()) "$project-retrieved.bin"
$oversizedFile  = Join-Path ([IO.Path]::GetTempPath()) "$project-oversized.bin"

try {
  Write-Host 'Building and starting the isolated fetch-runner stack...'
  & docker @composeArgs up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed for compose.fetch-runner.yml' }

  Wait-ContainerHealthy -ServiceName 'runner' -TimeoutSec 60
  Wait-ContainerHealthy -ServiceName 'object-storage' -TimeoutSec 60

  # --- real write + read-back, byte-for-byte ---
  Write-Host 'Write-then-read-back a synthetic payload against the real MinIO instance'
  # RandomNumberGenerator's static ::Fill(byte[]) is .NET 5+ only -- this
  # script runs under Windows PowerShell 5.1 (.NET Framework), where that
  # overload does not exist (found by this exact MethodNotFound error, real
  # run, 2026-09-17). RNGCryptoServiceProvider.GetBytes works on both.
  $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
  $syntheticBytes = New-Object byte[] 4096
  $rng.GetBytes($syntheticBytes)
  [IO.File]::WriteAllBytes($syntheticFile, $syntheticBytes)
  $expectedHash = Get-Sha256Hex -Bytes $syntheticBytes

  & docker @composeArgs cp $syntheticFile 'runner:/tmp/synthetic.bin'
  if ($LASTEXITCODE -ne 0) { throw 'docker compose cp (host -> runner) failed for the synthetic payload' }

  $putResult = Invoke-RunnerExec -ExecArgs @('sh', '-c', 'node object-storage-client.mjs put < /tmp/synthetic.bin')
  if ($putResult.ExitCode -ne 0) { throw "ASSERTION FAILED: put of synthetic payload failed (exit $($putResult.ExitCode)): $($putResult.Output)" }
  $putJson = $putResult.Output | ConvertFrom-Json
  if ($putJson.content_hash -ne $expectedHash) { throw "ASSERTION FAILED: content_hash '$($putJson.content_hash)' does not match locally computed sha256 '$expectedHash'" }
  if ($putJson.snapshot_ref -ne "s3://$bucket/sha256/$expectedHash") { throw "ASSERTION FAILED: unexpected snapshot_ref shape: $($putJson.snapshot_ref)" }
  Write-Host "  ok: put returned content_hash=$($putJson.content_hash) snapshot_ref=$($putJson.snapshot_ref)"

  $getResult = Invoke-RunnerExec -ExecArgs @('node', 'object-storage-client.mjs', 'get', $putJson.snapshot_ref, '--out=/tmp/retrieved.bin')
  if ($getResult.ExitCode -ne 0) { throw "ASSERTION FAILED: get of just-written snapshot_ref failed (exit $($getResult.ExitCode)): $($getResult.Output)" }

  & docker @composeArgs cp 'runner:/tmp/retrieved.bin' $retrievedFile
  if ($LASTEXITCODE -ne 0) { throw 'docker compose cp (runner -> host) failed for the retrieved payload' }
  $retrievedBytes = [IO.File]::ReadAllBytes($retrievedFile)
  if ([BitConverter]::ToString($retrievedBytes) -ne [BitConverter]::ToString($syntheticBytes)) { throw 'ASSERTION FAILED: bytes read back from MinIO do not match the original bytes byte-for-byte' }
  Write-Host '  ok: bytes read back from the real MinIO instance are byte-for-byte identical to the original payload'

  # --- oversized write is rejected, not truncated, and leaves no object ---
  Write-Host 'Oversized single-write cap: reject without a partial object'
  $oversizedBytes = New-Object byte[] 2048
  $rng.GetBytes($oversizedBytes)
  [IO.File]::WriteAllBytes($oversizedFile, $oversizedBytes)
  $oversizedHash = Get-Sha256Hex -Bytes $oversizedBytes

  & docker @composeArgs cp $oversizedFile 'runner:/tmp/oversized.bin'
  if ($LASTEXITCODE -ne 0) { throw 'docker compose cp (host -> runner) failed for the oversized payload' }

  $rejectResult = Invoke-RunnerExec -ExecArgs @('sh', '-c', 'node object-storage-client.mjs put --max-bytes=1024 < /tmp/oversized.bin')
  if ($rejectResult.ExitCode -ne 3) { throw "ASSERTION FAILED: oversized put expected exit code 3 (OBJECT_TOO_LARGE), got $($rejectResult.ExitCode): $($rejectResult.Output)" }
  if ($rejectResult.Output -notmatch 'REJECTED') { throw "ASSERTION FAILED: oversized put did not report REJECTED: $($rejectResult.Output)" }
  Write-Host "  ok: oversized payload (2048 bytes > 1024-byte cap) rejected with exit 3: $($rejectResult.Output)"

  $shouldNotExistRef = "s3://$bucket/sha256/$oversizedHash"
  $noObjectResult = Invoke-RunnerExec -ExecArgs @('node', 'object-storage-client.mjs', 'get', $shouldNotExistRef, '--out=/tmp/should-not-exist.bin')
  if ($noObjectResult.ExitCode -eq 0) { throw "ASSERTION FAILED: rejected payload's content-addressed key exists in MinIO -- a partial object was left behind ($shouldNotExistRef)" }
  Write-Host "  ok: no object exists at the rejected payload's content-addressed key ($shouldNotExistRef)"

  Write-Host ''
  Write-Host 'HCI-30 fetch-runner object-storage write-path test PASSED.'
}
finally {
  & docker @composeArgs down --volumes --remove-orphans
  Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $syntheticFile, $retrievedFile, $oversizedFile -Force -ErrorAction SilentlyContinue
  if ($rng) { $rng.Dispose() }
}
