[CmdletBinding()]
param()

# HCI-30 isolated fetch runner network isolation test (ADR-0029 gates 1-3;
# HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 3). Real, re-runnable
# verification -- brings up infra/local/compose.fetch-runner.yml with a
# fresh project name and generated secrets, probes from inside the running
# `runner` container (the actual network namespace its own entrypoint.sh's
# iptables rules apply to, not a separate debug container on the same bridge), then
# tears everything down. Same orchestration pattern as
# scripts/test-wave1-local.ps1: unique per-run project name, temp env file,
# `finally` teardown, local-Docker-endpoint guard.
#
# Test id coverage (ADR-0029's own names, HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md
# Task 3 Output line):
#   fetch-runner-is-separate-service -- gate 1
#   wave6-no-bridge-route            -- gate 2
#   wave6-metadata-and-rfc1918-blocked -- gate 3
#
# Scope: local/test only. Never deploys to ks-aw-01 (High-risk STOP,
# agency-os/AGENTS.md SS3) -- this script only ever talks to Docker on the
# machine it runs on. DNS-rebind protection and the SSRF payload corpus
# (ADR-0029 gates 4-5) are explicitly Task 4, not tested here.
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$compose = Join-Path $root 'infra/local/compose.fetch-runner.yml'
if (-not (Test-Path $compose)) { throw "compose file not found: $compose" }

# Same non-local-Docker-endpoint guard as scripts/test-wave1-local.ps1 --
# refuse to run this against a remote Docker context.
$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not available; fetch-runner isolation tests were not run.' }

$project = "hcifetchrunner$PID"
$envFile = Join-Path ([IO.Path]::GetTempPath()) "$project.env"
$minioIp = '172.30.42.10' # must match compose.fetch-runner.yml's hci-fetch-runner-net subnet (172.30.42.0/24)
$sharedSecret = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
$minioUser    = 'hcifetchrunner'
$minioPassword = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())

# Written as explicit BOM-less UTF-8 bytes (same reasoning as
# scripts/test-wave1-local.ps1): Windows PowerShell 5.1 has no
# 'utf8NoBOM' -Encoding value, and a BOM would corrupt the first variable
# name Docker Compose reads from this file.
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

# Windows PowerShell 5.1, under $ErrorActionPreference = 'Stop', turns a
# native command's own stderr text into a script-terminating error --
# unrelated to exit code, found by real testing here (curl's expected
# "Connection timed out" message on a deliberately-blocked probe crashed
# the whole script instead of being an assertion PASS). Toggling EAP to
# 'Continue' only around the native call, then checking $LASTEXITCODE
# ourselves exactly as scripts/test-wave1-local.ps1 already does for
# always-expected-to-succeed calls, is the fix for the expected-to-fail
# case this file adds.
function Test-Blocked {
  param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)][string]$Url, [int]$TimeoutSec = 3)
  $previousEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & docker @composeArgs exec -T runner curl -m $TimeoutSec -sS -o /dev/null $Url 2>&1 | Out-Null
  } finally {
    $ErrorActionPreference = $previousEap
  }
  if ($LASTEXITCODE -eq 0) { throw "ASSERTION FAILED ($Label): expected $Url to be blocked, but curl succeeded" }
  Write-Host "  ok: $Label blocked ($Url, curl exit $LASTEXITCODE)"
}

function Test-Allowed {
  param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)][string]$Url, [int]$TimeoutSec = 5)
  $previousEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $httpCode = & docker @composeArgs exec -T runner curl -m $TimeoutSec -sS -o /dev/null -w '%{http_code}' $Url 2>&1
  } finally {
    $ErrorActionPreference = $previousEap
  }
  if ($LASTEXITCODE -ne 0) { throw "ASSERTION FAILED ($Label): expected $Url reachable, curl exit $LASTEXITCODE ($httpCode)" }
  Write-Host "  ok: $Label reachable ($Url, http_code=$httpCode)"
}

# The container holds NET_ADMIN/SETUID/SETGID/SETPCAP only for entrypoint.sh; this proves node (PID 1
# after `exec setpriv ... node`) holds none of them and can never regain them. Replaces the old
# sidecar design's "runner has no NET_ADMIN" property with a stronger one (node is also non-root now).
function Test-PrivilegesDropped {
  param([Parameter(Mandatory)][string]$Label)
  $statusText = (& docker @composeArgs exec -T runner cat /proc/1/status) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw "ASSERTION FAILED ($Label): could not read runner /proc/1/status" }
  $cmdline = ((& docker @composeArgs exec -T runner cat /proc/1/cmdline) -join '') -replace [char]0, ' '
  if ($cmdline -notmatch '^node /app/server\.mjs') { throw "ASSERTION FAILED ($Label): PID 1 is '$cmdline', expected node /app/server.mjs" }
  foreach ($field in 'Uid', 'Gid') {
    if ($statusText -notmatch "(?m)^${field}:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)") { throw "ASSERTION FAILED ($Label): $field missing from /proc/1/status" }
    if (@($Matches[1], $Matches[2], $Matches[3], $Matches[4]) -contains '0') { throw "ASSERTION FAILED ($Label): node runs with a root $field ($($Matches[0]))" }
  }
  foreach ($field in 'CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb') {
    if ($statusText -notmatch "(?m)^${field}:\s+0000000000000000\s*$") { throw "ASSERTION FAILED ($Label): $field is not empty -- node could change the egress policy. /proc/1/status: $statusText" }
  }
  if ($statusText -notmatch '(?m)^NoNewPrivs:\s+1\s*$') { throw "ASSERTION FAILED ($Label): NoNewPrivs is not 1" }
  $previousEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & docker @composeArgs exec -T -u node runner iptables -P OUTPUT ACCEPT 2>&1 | Out-Null
  } finally {
    $ErrorActionPreference = $previousEap
  }
  if ($LASTEXITCODE -eq 0) { throw "ASSERTION FAILED ($Label): uid node was able to change the OUTPUT policy" }
  Write-Host "  ok: $Label -- PID 1 is node, non-root, all capability sets empty, NoNewPrivs=1, uid node cannot alter iptables"
}

function Test-EgressPolicy {
  param([Parameter(Mandatory)][AllowEmptyString()][string]$Suffix)
  Test-Blocked -Label "cloud metadata endpoint$Suffix" -Url 'http://169.254.169.254/latest/meta-data/'
  Test-Blocked -Label "link-local$Suffix" -Url 'http://169.254.7.7/'
  Test-Blocked -Label "RFC1918 10.0.0.0/8$Suffix" -Url 'http://10.1.2.3/'
  Test-Blocked -Label "RFC1918 172.16.0.0/12$Suffix" -Url 'http://172.20.5.5/'
  Test-Blocked -Label "RFC1918 192.168.0.0/16$Suffix" -Url 'http://192.168.99.99/'
  Test-Blocked -Label "loopback (non-API port)$Suffix" -Url 'http://127.0.0.1:12345/'
  # Positive controls -- egress-ONLY to the public internet plus two narrow allowlisted exceptions,
  # not a blanket DROP that would trivially pass the assertions above for the wrong reason.
  Test-Allowed -Label "public internet egress$Suffix" -Url 'https://example.com/'
  $dnsOutput = & docker @composeArgs exec -T runner nslookup example.com 2>&1
  if ($LASTEXITCODE -ne 0) { throw "ASSERTION FAILED: DNS resolution failed for a legitimate public target$Suffix -- output: $dnsOutput" }
  Write-Host "  ok: DNS resolution works for a legitimate public target (example.com)$Suffix"
  Test-Allowed -Label "allowlisted object-storage peer$Suffix" -Url "http://${minioIp}:9000/minio/health/live"
}

try {
  Write-Host 'Building and starting the isolated fetch-runner stack...'
  & docker @composeArgs up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed for compose.fetch-runner.yml' }

  Wait-ContainerHealthy -ServiceName 'runner' -TimeoutSec 60
  Wait-ContainerHealthy -ServiceName 'object-storage' -TimeoutSec 60

  # Proves the ip6tables default-deny step in fetch-runner/entrypoint.sh actually ran. Logs are joined
  # first: `$array -notmatch 'x'` is a filter, not a boolean (false positive found 2026-09-17).
  $runnerLogsText = (& docker @composeArgs logs runner 2>&1) -join "`n"
  if ($runnerLogsText -notmatch 'ip6tables OUTPUT set to default-deny') { throw "ASSERTION FAILED: runner log does not show the ip6tables default-deny step ran -- output: $runnerLogsText" }
  Write-Host '  ok: runner entrypoint applied an ip6tables default-deny policy (not just the IPv4 rule set)'

  # --- fetch-runner-is-separate-service (ADR-0029 gate 1) ---
  Write-Host 'Gate 1: fetch-runner-is-separate-service'
  $runnerId = & docker @composeArgs ps -q runner
  $networksJson = & docker inspect $runnerId --format '{{json .NetworkSettings.Networks}}'
  $networks = $networksJson | ConvertFrom-Json
  $networkNames = @($networks.PSObject.Properties.Name)
  $foreignNetworks = @('lobster-net', 'lf-trg-webapp', 'lf-trg-supervisor', 'lf-trg-docker-proxy', 'hci30dev_default', 'bridge')
  foreach ($n in $networkNames) {
    if ($foreignNetworks -contains $n) { throw "ASSERTION FAILED: runner is attached to foreign network '$n' -- isolation broken" }
  }
  if ($networkNames.Count -ne 1) { throw "ASSERTION FAILED: runner expected exactly 1 network, found: $($networkNames -join ', ')" }
  Write-Host "  ok: runner's only network is '$($networkNames[0])' (project-scoped, shares nothing with $($foreignNetworks -join ', '))"

  $portMapping = & docker port $runnerId 8090
  if ($portMapping -notmatch '^127\.0\.0\.1:') { throw "ASSERTION FAILED: runner's API port is published as '$portMapping', expected 127.0.0.1-only" }
  Write-Host "  ok: internal API published as '$portMapping' (127.0.0.1-only, not a public-facing port)"

  # ADR-0029 "Where the egress policy is applied" (2026-09-21): the policy is re-applied by the
  # runner's own entrypoint on every start, so a restart policy is now REQUIRED (host reboot /
  # crash must bring the runner back) -- wave6-policy-survives-restart below proves it is safe.
  $restartPolicy = & docker inspect $runnerId --format '{{.HostConfig.RestartPolicy.Name}}'
  if ($restartPolicy -ne 'unless-stopped') { throw "ASSERTION FAILED: runner restart policy is '$restartPolicy', expected 'unless-stopped' -- a host reboot would leave fetching down" }
  Write-Host "  ok: runner restart policy is '$restartPolicy'"

  # critic review, 2026-09-17: this repo has already been burned by an
  # IPv4-only firewall on a host where IPv6 defaults to ACCEPT
  # (lobster-factory's cloudInit.ts hardening for exactly this). Proves
  # compose.fetch-runner.yml's `enable_ipv6: false` is doing its job, not
  # just present in the file. Read from the already-parsed per-network JSON
  # above, not `.NetworkSettings.GlobalIPv6Address` at the top level -- that
  # top-level field is only populated for the default bridge network mode;
  # on a user-defined network (this container's actual mode) it does not
  # exist at all, so `docker inspect --format` against it is a Go template
  # parse ERROR, not an empty string -- which silently made this assertion
  # pass regardless of the real answer (found by this exact bug in a real
  # run, 2026-09-17: the error was visible in stderr but $LASTEXITCODE
  # wasn't checked, so it read as "no IPv6" whether or not that was true).
  $runnerIPv6 = $networks.($networkNames[0]).GlobalIPv6Address
  if ($runnerIPv6) { throw "ASSERTION FAILED: runner has an IPv6 address ('$runnerIPv6') -- the OUTPUT egress policy is IPv4-only and would not cover this" }
  Write-Host '  ok: runner has no IPv6 address (enable_ipv6: false is effective, not just declared)'

  # --- wave6-no-bridge-route (ADR-0029 gate 2) ---
  # Reads the network map as JSON and picks the key in PowerShell rather
  # than embedding a quoted Go-template key (`index .Networks "x-y"`) in the
  # argument to a native exe -- real testing found PowerShell mangles the
  # nested double quotes before docker ever sees them (a Go "bad character"
  # template-parse error), even though the identical `docker inspect
  # --format` string works fine invoked from a POSIX shell.
  Write-Host 'Gate 2: wave6-no-bridge-route'
  $triggerWebappId = & docker ps -q -f 'name=^trigger-webapp$'
  if ($triggerWebappId) {
    $triggerWebappNetworks = (& docker inspect trigger-webapp --format '{{json .NetworkSettings.Networks}}') | ConvertFrom-Json
    $triggerWebappIp = $triggerWebappNetworks.'lf-trg-webapp'.IPAddress
    Test-Blocked -Label 'wave6-no-bridge-route (real Trigger.dev webapp internal endpoint)' -Url "http://${triggerWebappIp}:3000/"
  } else {
    Write-Warning 'trigger-webapp is not running locally this run -- skipped the live Trigger.dev-internal-endpoint probe (informational, not a failure).'
  }
  $triggerPostgresId = & docker ps -q -f 'name=^trigger-postgres$'
  if ($triggerPostgresId) {
    $triggerPostgresNetworks = (& docker inspect trigger-postgres --format '{{json .NetworkSettings.Networks}}') | ConvertFrom-Json
    $triggerPostgresIp = $triggerPostgresNetworks.'lf-trg-webapp'.IPAddress
    Test-Blocked -Label 'wave6-no-bridge-route (real Trigger.dev-internal postgres)' -Url "http://${triggerPostgresIp}:5432/"
  } else {
    Write-Warning 'trigger-postgres is not running locally this run -- skipped.'
  }
  Write-Host '  info: no local Supabase admin endpoint or n8n webhook-management endpoint exists on this machine to probe directly;'
  Write-Host '  info: gate 3''s RFC1918-range assertions below are the rule-class equivalent (those endpoints would also be RFC1918 docker-bridge addresses).'

  # --- wave6-metadata-and-rfc1918-blocked (ADR-0029 gate 3) ---
  Write-Host 'Gate 3: wave6-metadata-and-rfc1918-blocked'
  Test-EgressPolicy -Suffix ''
  Test-PrivilegesDropped -Label 'privilege drop'

  # --- wave6-policy-survives-restart (2026-09-21 hci-network-guard outage regression) ---
  # A restart is a NEW netns with no rules. The policy must be back before node runs, every time.
  Write-Host 'wave6-policy-survives-restart'
  & docker @composeArgs restart runner
  if ($LASTEXITCODE -ne 0) { throw 'docker compose restart runner failed' }
  Wait-ContainerHealthy -ServiceName 'runner' -TimeoutSec 30
  Test-EgressPolicy -Suffix ' (after restart)'
  Test-PrivilegesDropped -Label 'privilege drop (after restart)'

  # --- internal HTTP API skeleton (ADR-0029 gate 1's API shape) ---
  Write-Host 'Internal API: auth + enqueue/status'
  $unauth = & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' -X POST -d '{}' http://127.0.0.1:8090/enqueue
  if ($unauth -ne '401') { throw "ASSERTION FAILED: unauthenticated /enqueue expected 401, got $unauth" }
  Write-Host '  ok: unauthenticated /enqueue rejected (401)'

  # Piped via stdin (`-d @-`) rather than passed as a CLI argument: real
  # testing found PowerShell mangles double quotes embedded in a string
  # argument to a native exe (the JSON body arrived at the server as
  # literal-broken text, `{error:"invalid_json"}`) -- stdin content is not
  # subject to that argument-quoting layer at all.

  # Task 6 (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md, ADR-011 SS決策10):
  # org-only whitelist gate. Missing/wrong subject_kind must be rejected
  # fail-closed before the positive-path test proves the correct value works.
  $missingKindBody = '{"targetUrl":"https://example.com","tenantId":"tenant-1"}'
  $missingKindResponse = $missingKindBody | & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  if ($missingKindResponse -ne '400') { throw "ASSERTION FAILED: /enqueue with no subject_kind expected 400, got $missingKindResponse" }
  Write-Host '  ok: /enqueue with missing subject_kind rejected (400)'

  $personKindBody = '{"targetUrl":"https://example.com","tenantId":"tenant-1","subject_kind":"PERSON"}'
  $personKindResponse = $personKindBody | & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  if ($personKindResponse -ne '400') { throw "ASSERTION FAILED: /enqueue with subject_kind=PERSON expected 400, got $personKindResponse" }
  Write-Host '  ok: /enqueue with subject_kind=PERSON rejected (400) -- misfilled value is not a bypass'

  # critic review 2026-09-17: the code comment claims "a missing field and a
  # misspelled/wrong-case value get the same rejection" -- pin that down with
  # an actual wrong-case value, not just a wrong-value test.
  $lowercaseKindBody = '{"targetUrl":"https://example.com","tenantId":"tenant-1","subject_kind":"organization"}'
  $lowercaseKindResponse = $lowercaseKindBody | & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  if ($lowercaseKindResponse -ne '400') { throw "ASSERTION FAILED: /enqueue with subject_kind=organization (wrong case) expected 400, got $lowercaseKindResponse" }
  Write-Host '  ok: /enqueue with subject_kind=organization (wrong case) rejected (400)'

  # critic review 2026-09-17: type confusion -- subject_kind as an array
  # rather than a string. Strict `!==` never coerces, so this must reject.
  $arrayKindBody = '{"targetUrl":"https://example.com","tenantId":"tenant-1","subject_kind":["ORGANIZATION"]}'
  $arrayKindResponse = $arrayKindBody | & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  if ($arrayKindResponse -ne '400') { throw "ASSERTION FAILED: /enqueue with subject_kind as an array expected 400, got $arrayKindResponse" }
  Write-Host '  ok: /enqueue with subject_kind as an array (type confusion) rejected (400)'

  # critic review 2026-09-17 (Critical/Major finding): a literal JSON `null`
  # body used to crash the whole process (`body.targetUrl` on `null` threw a
  # synchronous TypeError inside an unawaited async handler -- an unhandled
  # rejection that kills the process).
  # This is the regression test for that fix: prove it degrades to a clean
  # 400, not a dropped connection / timeout from a dead server.
  $nullBodyResponse = 'null' | & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  if ($nullBodyResponse -ne '400') { throw "ASSERTION FAILED: /enqueue with a literal JSON null body expected 400, got $nullBodyResponse" }
  Write-Host '  ok: /enqueue with a literal JSON null body rejected (400), not a process crash'

  # Prove the server is still alive and healthy after the null-body
  # regression test above -- the whole point of that fix was that a crash
  # would otherwise take the entire container down.
  $stillHealthy = & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/healthz
  if ($stillHealthy -ne '200') { throw "ASSERTION FAILED: runner /healthz expected 200 after the null-body request, got $stillHealthy -- the server may have crashed" }
  Write-Host '  ok: runner still healthy after the null-body request (no crash)'

  $enqueueBody = '{"targetUrl":"https://example.com","tenantId":"tenant-1","subject_kind":"ORGANIZATION"}'
  $enqueueResponse = $enqueueBody | & docker @composeArgs exec -T runner curl -s -X POST -H "Authorization: Bearer $sharedSecret" -H 'Content-Type: application/json' -d '@-' http://127.0.0.1:8090/enqueue
  $job = $enqueueResponse | ConvertFrom-Json
  if (-not $job.id -or $job.status -ne 'queued') { throw "ASSERTION FAILED: /enqueue with valid secret + subject_kind=ORGANIZATION did not return a queued job -- response: $enqueueResponse" }
  if ($job.subjectKind -ne 'ORGANIZATION') { throw "ASSERTION FAILED: queued job did not echo back subjectKind=ORGANIZATION -- response: $enqueueResponse" }
  Write-Host "  ok: authenticated /enqueue with subject_kind=ORGANIZATION returned job $($job.id) (status=queued)"

  $statusResponse = & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $sharedSecret" "http://127.0.0.1:8090/status/$($job.id)"
  if ($statusResponse -ne '200') { throw "ASSERTION FAILED: /status/$($job.id) with valid secret expected 200, got $statusResponse" }
  Write-Host "  ok: authenticated /status/$($job.id) returned 200"

  $wrongSecretStatus = & docker @composeArgs exec -T runner curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer wrong-secret' "http://127.0.0.1:8090/status/$($job.id)"
  if ($wrongSecretStatus -ne '401') { throw "ASSERTION FAILED: /status with wrong secret expected 401, got $wrongSecretStatus" }
  Write-Host '  ok: wrong shared secret rejected (401)'

  Write-Host ''
  Write-Host 'HCI-30 fetch-runner network isolation suite PASSED (ADR-0029 gates 1-3 + policy survives restart).'
}
finally {
  & docker @composeArgs down --volumes --remove-orphans
  Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
}
