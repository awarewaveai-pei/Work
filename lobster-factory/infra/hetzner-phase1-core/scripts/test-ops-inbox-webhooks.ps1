<#
.SYNOPSIS
  POST synthetic payloads to sentry, uptime_kuma, grafana, netdata Ops Inbox webhooks.

.DESCRIPTION
  Each run uses a unique RUN_ID so fingerprints differ → transition "new" → Slack rules can fire.

  Required environment variables:
    OPS_INBOX_TEST_BASE_URL  e.g. https://app.aware-wave.com
    OPS_INBOX_INGEST_TOKEN   Bearer token (same as monitoring)

  For Slack delivery (container / compose env):
    OPS_INBOX_NOTIFY_ENABLED=true
    OPS_INBOX_SLACK_INCIDENTS_WEBHOOK=https://hooks.slack.com/...
    OPS_INBOX_PUBLIC_URL=https://app.aware-wave.com

  Optional:
    OPS_INBOX_RUN_ID  override unique suffix (default: Unix seconds)

  Verify: HTTP 200 + JSON body; Ops Inbox detail → Notify Log (sent | skipped + reason); Slack channel.
#>
param(
  [string] $BaseUrl = $env:OPS_INBOX_TEST_BASE_URL,
  [string] $Token = $env:OPS_INBOX_INGEST_TOKEN,
  [string] $RunId = $env:OPS_INBOX_RUN_ID
)

$ErrorActionPreference = "Stop"
if (-not $BaseUrl -or -not $Token) {
  Write-Error "Set OPS_INBOX_TEST_BASE_URL and OPS_INBOX_INGEST_TOKEN (or pass -BaseUrl -Token)."
  exit 1
}
$BaseUrl = $BaseUrl.TrimEnd("/")
if (-not $RunId) { $RunId = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString() }

function Invoke-Probe {
  param([string]$Name, [string]$Path, [hashtable]$Body)
  $uri = "$BaseUrl$Path"
  Write-Host "=== $Name POST $Path ===" -ForegroundColor Cyan
  $headers = @{
    Authorization = "Bearer $Token"
    "Content-Type"  = "application/json; charset=utf-8"
  }
  $json = $Body | ConvertTo-Json -Depth 20 -Compress
  try {
    $resp = Invoke-WebRequest -Uri $uri -Method POST -Headers $headers -Body $json -UseBasicParsing
    Write-Host $resp.Content
    Write-Host "HTTP $($resp.StatusCode)"
    if ($resp.StatusCode -ne 200) { throw "Expected 200" }
  }
  catch {
    Write-Error $_
    exit 1
  }
  Write-Host ""
}

Invoke-Probe "sentry" "/api/webhooks/sentry" @{
  data = @{
    issue   = @{ id = "sentry-probe-$RunId"; title = "[probe $RunId] Synthetic Sentry error for Ops Inbox"; level = "error" }
    event   = @{ event_id = "evt-sentry-$RunId"; environment = "production"; message = "Synthetic webhook test $RunId" }
    project_slug = "ops-inbox-probe"
  }
}

Invoke-Probe "uptime_kuma" "/api/webhooks/uptime-kuma" @{
  monitor   = @{
    id       = [int]$RunId
    name     = "OpsInboxProbe-$RunId"
    hostname = "https://example.com"
    type     = "http"
    url      = "https://example.com"
    tags     = @()
  }
  heartbeat = @{ status = 0; msg = "Synthetic DOWN probe $RunId" }
}

Invoke-Probe "grafana" "/api/webhooks/grafana" @{
  alerts = @(
    @{
      fingerprint = "grafana-probe-$RunId"
      status        = "firing"
      labels        = @{
        alertname   = "OpsInboxProbeGrafana-$RunId"
        severity    = "critical"
        environment = "production"
        service      = "probe"
      }
      annotations = @{
        summary     = "[probe $RunId] Synthetic Grafana alert"
        description = "cpu high synthetic $RunId"
      }
      startsAt      = "2026-01-01T00:00:00Z"
    }
  )
}

Invoke-Probe "netdata" "/api/webhooks/netdata" @{
  status        = "CRITICAL"
  host          = "probe-host-$RunId"
  alarm         = "ops_inbox_probe_$RunId"
  value_string  = "99"
  info          = "Synthetic Netdata probe $RunId"
}

Write-Host "Done. RUN_ID=$RunId — open Ops Inbox (filter: 全部) and check Notify Log + Slack." -ForegroundColor Green
