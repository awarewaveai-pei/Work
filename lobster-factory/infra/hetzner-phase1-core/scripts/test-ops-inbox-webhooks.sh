#!/usr/bin/env bash
# Synthetic POSTs to Ops Inbox webhooks (sentry, uptime_kuma, grafana, netdata).
# Each run uses a unique RUN_ID so incidents are "new" (Slack rules fire on new).
#
# Required env:
#   OPS_INBOX_TEST_BASE_URL  e.g. https://app.aware-wave.com
#   OPS_INBOX_INGEST_TOKEN   Bearer secret (same as monitoring webhooks)
#
# Slack (optional, for real Slack posts):
#   OPS_INBOX_NOTIFY_ENABLED=true
#   OPS_INBOX_SLACK_INCIDENTS_WEBHOOK=https://hooks.slack.com/...
#   OPS_INBOX_PUBLIC_URL=https://app.aware-wave.com
# (set in next-admin container / .env used by docker compose)
#
# Verify:
#   - HTTP 200 + JSON incident_id from each POST
#   - Ops Inbox list/detail; Notify Log: status "sent" or "skipped" + reason
#   - Slack channel if enabled

set -euo pipefail

BASE="${OPS_INBOX_TEST_BASE_URL:-}"
TOKEN="${OPS_INBOX_INGEST_TOKEN:-}"
if [[ -z "$BASE" || -z "$TOKEN" ]]; then
  echo "Set OPS_INBOX_TEST_BASE_URL and OPS_INBOX_INGEST_TOKEN" >&2
  exit 1
fi

BASE="${BASE%/}"
RUN_ID="${OPS_INBOX_RUN_ID:-$(date +%s)}"

post() {
  local name="$1" path="$2" json="$3"
  echo "=== $name POST $path ==="
  local code body
  body=$(curl -sS -w "\n%{http_code}" -X POST "${BASE}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${json}" || true)
  code=$(echo "$body" | tail -n1)
  body=$(echo "$body" | sed '$d')
  echo "$body"
  echo "HTTP $code"
  if [[ "$code" != "200" ]]; then
    echo "FAIL: expected 200" >&2
    return 1
  fi
  echo ""
}

post sentry /api/webhooks/sentry "$(cat <<JSON
{
  "data": {
    "issue": {
      "id": "sentry-probe-${RUN_ID}",
      "title": "[probe ${RUN_ID}] Synthetic Sentry error for Ops Inbox",
      "level": "error"
    },
    "event": {
      "event_id": "evt-sentry-${RUN_ID}",
      "environment": "production",
      "message": "Synthetic webhook test ${RUN_ID}"
    },
    "project_slug": "ops-inbox-probe"
  }
}
JSON
)"

post uptime_kuma /api/webhooks/uptime-kuma "$(cat <<JSON
{
  "monitor": {
    "id": ${RUN_ID},
    "name": "OpsInboxProbe-${RUN_ID}",
    "hostname": "https://example.com",
    "type": "http",
    "url": "https://example.com",
    "tags": []
  },
  "heartbeat": { "status": 0, "msg": "Synthetic DOWN probe ${RUN_ID}" }
}
JSON
)"

post grafana /api/webhooks/grafana "$(cat <<JSON
{
  "alerts": [{
    "fingerprint": "grafana-probe-${RUN_ID}",
    "status": "firing",
    "labels": {
      "alertname": "OpsInboxProbeGrafana-${RUN_ID}",
      "severity": "critical",
      "environment": "production",
      "service": "probe"
    },
    "annotations": {
      "summary": "[probe ${RUN_ID}] Synthetic Grafana alert",
      "description": "cpu high synthetic ${RUN_ID}"
    },
    "startsAt": "2026-01-01T00:00:00Z"
  }]
}
JSON
)"

post netdata /api/webhooks/netdata "$(cat <<JSON
{
  "status": "CRITICAL",
  "host": "probe-host-${RUN_ID}",
  "alarm": "ops_inbox_probe_${RUN_ID}",
  "value_string": "99",
  "info": "Synthetic Netdata probe ${RUN_ID}"
}
JSON
)"

echo "Done. RUN_ID=${RUN_ID} — open Ops Inbox (status: all) and check each incident Notify Log + Slack."
