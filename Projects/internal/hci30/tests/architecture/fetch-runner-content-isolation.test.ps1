[CmdletBinding()]
param()

# HCI-30 isolated fetch runner content-isolation + real-fetch wiring test
# (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 7). Real, re-runnable
# verification against the actual compose stack (Task 3's network isolation +
# Task 4's SSRF gate + the network-guard ready-file gating this task added) --
# no mock. Same orchestration pattern as fetch-runner-network-isolation.test.ps1
# and fetch-runner-object-storage-write-path.test.ps1: fresh project name,
# generated secrets/env file, `finally` teardown, local-Docker-endpoint guard.
#
# Scope decision, stated up front: this file proves the CLEAN-content path
# end to end over a real socket (enqueue -> network-guard-ready gate ->
# real fetch of a public URL -> extract -> job status=completed). It does
# NOT attempt to prove the FLAGGED (prompt-injection) path here, because
# doing so honestly would require getting attacker-controlled HTML onto a
# target this runner's own SSRF gate will actually let it reach -- and the
# gate only allows genuinely public addresses (ADR-0029 gates 2-3, verified
# by fetch-runner-network-isolation.test.ps1), so there is no "controlled
# public target we can plant content on" available to this test without a
# third-party network dependency this repo does not otherwise take.
# Task 7's own acceptance line ("ignore previous instructions" + zero-width
# chars -> flagged_for_review, not completed) is proven instead by
# tests/unit/fetch-runner/server.test.mjs's dedicated acceptance test, which
# exercises processJob's real, unmocked state-machine logic -- the same
# code this architecture test's happy path also runs -- with an injected
# fetch result standing in only for the outermost socket call. What THIS
# file adds on top of that unit test: proof that the network-guard
# ready-file gate, the real createSafeFetch/DNS-pin path, and the real
# extraction code are actually wired together correctly inside the real
# container, not just individually correct in isolation.
#
# Scope: local/test only. Never deploys to ks-aw-01 (agency-os/AGENTS.md SS3).
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$compose = Join-Path $root 'infra/local/compose.fetch-runner.yml'
if (-not (Test-Path $compose)) { throw "compose file not found: $compose" }

$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not available; content-isolation wiring test was not run.' }

$project = "hcifetchrunnerci$PID"
$envFile = Join-Path ([IO.Path]::GetTempPath()) "$project.env"
$minioIp = '172.30.42.10' # must match compose.fetch-runner.yml's hci-fetch-runner-net subnet (172.30.42.0/24)
$sharedSecret  = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
$minioUser     = 'hcifetchrunner'
$minioPassword = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())

$envContent = @"
HCI_FETCH_RUNNER_SHARED_SECRET=$sharedSecret
HCI_FETCH_RUNNER_MINIO_IP=$minioIp
HCI_FETCH_RUNNER_MINIO_ROOT_USER=$minioUser
HCI_FETCH_RUNNER_MINIO_ROOT_PASSWORD=$minioPassword
HCI_FETCH_RUNNER_NETWORK_GUARD_READY_TIMEOUT_MS=3000
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

function Wait-ContainerExitedZero {
  param([Parameter(Mandatory)][string]$ServiceName, [int]$TimeoutSec = 30)
  $containerId = & docker @composeArgs ps -a -q $ServiceName
  if (-not $containerId) { throw "$ServiceName container not found" }
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $status = & docker inspect $containerId --format '{{.State.Status}}'
    if ($status -eq 'exited') {
      $exitCode = & docker inspect $containerId --format '{{.State.ExitCode}}'
      if ($exitCode -ne '0') { throw "$ServiceName exited with code $exitCode (expected 0)" }
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "$ServiceName did not exit within ${TimeoutSec}s"
}

try {
  Write-Host 'Building and starting the isolated fetch-runner stack...'
  & docker @composeArgs up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed for compose.fetch-runner.yml' }

  Wait-ContainerExitedZero -ServiceName 'network-guard'
  Wait-ContainerHealthy -ServiceName 'runner' -TimeoutSec 60
  Wait-ContainerHealthy -ServiceName 'object-storage' -TimeoutSec 60

  # Proves network-guard's ready-file actually landed in the shared volume --
  # if compose.fetch-runner.yml's volume wiring were wrong (wrong mount path,
  # not actually shared, wrong service), this file would not exist even
  # though network-guard itself exited 0 above.
  Write-Host 'Verifying the network-guard ready-file landed in the shared volume'
  $readyCheck = & docker @composeArgs exec -T runner test -f /var/run/network-guard/ready
  if ($LASTEXITCODE -ne 0) { throw 'ASSERTION FAILED: /var/run/network-guard/ready does not exist inside the runner container -- the shared volume or the ready-file write is broken' }
  Write-Host '  ok: network-guard ready-file exists inside the runner container'

  # --- real end-to-end: enqueue a real public URL, poll status, expect completed ---
  Write-Host 'End-to-end: enqueue https://example.com/ and poll until the pipeline completes'
  $enqueueBody = '{"targetUrl":"https://example.com/","tenantId":"tenant-1","subject_kind":"ORGANIZATION"}'
  $enqueueResponse = $enqueueBody | & docker @composeArgs exec -T runner curl -s -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  $job = $enqueueResponse | ConvertFrom-Json
  if (-not $job.id -or $job.status -ne 'queued') { throw "ASSERTION FAILED: /enqueue did not return a queued job -- response: $enqueueResponse" }
  Write-Host "  ok: enqueued job $($job.id)"

  $finalJob = $null
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    $statusResponse = & docker @composeArgs exec -T runner curl -s -H "Authorization: Bearer $sharedSecret" "http://127.0.0.1:8090/status/$($job.id)"
    $polled = $statusResponse | ConvertFrom-Json
    if ($polled.status -ne 'queued' -and $polled.status -ne 'fetching') { $finalJob = $polled; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $finalJob) { throw "ASSERTION FAILED: job $($job.id) did not leave queued/fetching within 30s" }
  if ($finalJob.status -ne 'completed') { throw "ASSERTION FAILED: expected job status 'completed' for a clean public URL, got '$($finalJob.status)' -- full response: $($finalJob | ConvertTo-Json -Compress)" }
  if (-not $finalJob.contentHash) { throw "ASSERTION FAILED: completed job has no contentHash -- response: $($finalJob | ConvertTo-Json -Compress)" }
  if ($finalJob.textLength -le 0) { throw "ASSERTION FAILED: completed job has textLength <= 0 -- extraction produced no text" }
  if ($finalJob.contentProvenance.epistemic_type -ne 'EVIDENCE' -or $finalJob.contentProvenance.authorship_state -ne 'SOURCE_QUOTATION') {
    throw "ASSERTION FAILED: unexpected content_provenance shape: $($finalJob.contentProvenance | ConvertTo-Json -Compress)"
  }
  Write-Host "  ok: job $($job.id) completed -- contentHash=$($finalJob.contentHash.Substring(0,16))... textLength=$($finalJob.textLength) title='$($finalJob.title)'"

  # Object-storage upload proof (Task 9 wiring found this belongs in
  # processJob itself, not Task 8/9 -- see server.mjs's own comment).
  # job.status='completed' already implies the upload succeeded (a real
  # MinIO failure would route to 'failed' instead, per the unit test
  # covering that path), but this proves the OBJECT ITSELF is retrievable
  # from the real MinIO instance, not just that the runner claims a
  # snapshotRef string -- same round-trip technique as Task 5's own
  # fetch-runner-object-storage-write-path.test.ps1.
  if (-not $finalJob.snapshotRef) { throw "ASSERTION FAILED: completed job has no snapshotRef -- response: $($finalJob | ConvertTo-Json -Compress)" }
  $expectedSnapshotRefPrefix = "s3://hci-fetch-runner-raw/sha256/$($finalJob.contentHash)"
  if ($finalJob.snapshotRef -ne $expectedSnapshotRefPrefix) { throw "ASSERTION FAILED: snapshotRef '$($finalJob.snapshotRef)' does not match expected '$expectedSnapshotRefPrefix'" }
  $getResult = & docker @composeArgs exec -T runner node object-storage-client.mjs get $finalJob.snapshotRef --out=/tmp/verify-content-isolation.bin
  if ($LASTEXITCODE -ne 0) { throw "ASSERTION FAILED: uploaded object is not retrievable from real MinIO at $($finalJob.snapshotRef) -- get exit $LASTEXITCODE, output: $getResult" }
  Write-Host "  ok: snapshotRef object is real and retrievable from MinIO ($($finalJob.snapshotRef))"

  # --- fail-closed proof: an SSRF-gated target must reach status=failed, never completed/flagged ---
  Write-Host 'SSRF-gated target: must fail closed at the fetch layer, not silently complete'
  $ssrfBody = '{"targetUrl":"http://169.254.169.254/latest/meta-data/","tenantId":"tenant-1","subject_kind":"ORGANIZATION"}'
  $ssrfResponse = $ssrfBody | & docker @composeArgs exec -T runner curl -s -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  $ssrfJob = $ssrfResponse | ConvertFrom-Json

  $ssrfFinal = $null
  $ssrfDeadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $ssrfDeadline) {
    $statusResponse = & docker @composeArgs exec -T runner curl -s -H "Authorization: Bearer $sharedSecret" "http://127.0.0.1:8090/status/$($ssrfJob.id)"
    $polled = $statusResponse | ConvertFrom-Json
    if ($polled.status -ne 'queued' -and $polled.status -ne 'fetching') { $ssrfFinal = $polled; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ssrfFinal) { throw "ASSERTION FAILED: SSRF-gated job $($ssrfJob.id) did not leave queued/fetching within 15s" }
  if ($ssrfFinal.status -ne 'failed') { throw "ASSERTION FAILED: expected status 'failed' for a cloud-metadata target, got '$($ssrfFinal.status)'" }
  if ($ssrfFinal.error -notmatch '^ssrf_blocked_') { throw "ASSERTION FAILED: expected error to start with 'ssrf_blocked_', got '$($ssrfFinal.error)'" }
  Write-Host "  ok: cloud-metadata target failed closed with error='$($ssrfFinal.error)' (real createSafeFetch, real network-guard policy, not a mock)"

  # --- stale ready-file fail-closed proof (critic review 2026-09-17 Major) ---
  # `hci-fetch-runner-ready` is a NAMED, PERSISTENT volume -- restarting
  # `runner` without a full `down --volumes` would otherwise leave the ready
  # file from the OLD incarnation sitting there, even though network-guard
  # (one-shot, restart:"no") never re-runs and the old netns/iptables state
  # is gone. This proves the fix: the Dockerfile CMD deletes the ready-file
  # at `runner` startup, so after a restart the system must fail closed
  # (network_guard_not_ready), never silently trust the stale marker.
  Write-Host 'Stale ready-file proof: restart runner without network-guard re-running -- must fail closed, not fail open'
  & docker @composeArgs restart runner
  if ($LASTEXITCODE -ne 0) { throw 'docker compose restart runner failed' }
  Wait-ContainerHealthy -ServiceName 'runner' -TimeoutSec 30

  $staleCheck = & docker @composeArgs exec -T runner test -f /var/run/network-guard/ready
  if ($LASTEXITCODE -eq 0) { throw 'ASSERTION FAILED: /var/run/network-guard/ready still exists after a runner restart -- the Dockerfile CMD deletion did not run, a stale ready-file could be misread as current' }
  Write-Host '  ok: ready-file was deleted on restart (no stale marker survives)'

  $postRestartBody = '{"targetUrl":"https://example.com/","tenantId":"tenant-1","subject_kind":"ORGANIZATION"}'
  $postRestartResponse = $postRestartBody | & docker @composeArgs exec -T runner curl -s -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  $postRestartJob = $postRestartResponse | ConvertFrom-Json

  $postRestartFinal = $null
  $postRestartDeadline = (Get-Date).AddSeconds(10) # HCI_FETCH_RUNNER_NETWORK_GUARD_READY_TIMEOUT_MS=3000 above keeps this fast
  while ((Get-Date) -lt $postRestartDeadline) {
    $statusResponse = & docker @composeArgs exec -T runner curl -s -H "Authorization: Bearer $sharedSecret" "http://127.0.0.1:8090/status/$($postRestartJob.id)"
    $polled = $statusResponse | ConvertFrom-Json
    if ($polled.status -ne 'queued' -and $polled.status -ne 'fetching') { $postRestartFinal = $polled; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $postRestartFinal) { throw "ASSERTION FAILED: post-restart job $($postRestartJob.id) did not leave queued/fetching within 35s" }
  if ($postRestartFinal.status -ne 'failed') { throw "ASSERTION FAILED: expected status 'failed' after a runner restart with no network-guard re-run (fail-closed), got '$($postRestartFinal.status)' -- this would mean full unrestricted egress with a false 'ready' signal" }
  if ($postRestartFinal.error -notmatch 'network_guard_not_ready') { throw "ASSERTION FAILED: expected error to mention network_guard_not_ready, got '$($postRestartFinal.error)'" }
  Write-Host "  ok: post-restart fetch correctly failed closed with error='$($postRestartFinal.error)' -- no stale-ready false positive"

  Write-Host ''
  Write-Host 'HCI-30 fetch-runner content-isolation wiring test PASSED (Task 7).'
}
finally {
  & docker @composeArgs down --volumes --remove-orphans
  Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
}
