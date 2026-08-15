#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/netdata/ops-inbox-webhook.env"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

: "${OPS_INBOX_INGEST_TOKEN:=}"
: "${OPS_INBOX_WEBHOOK_URL:=https://app.aware-wave.com/api/webhooks/netdata}"
: "${OPS_INBOX_RESOLVE:=}"

if [[ -z "${OPS_INBOX_INGEST_TOKEN}" ]]; then
  echo "netdata-ops-inbox-notify: OPS_INBOX_INGEST_TOKEN missing" >&2
  exit 0
fi

payload="$(python3 - <<'PY'
import json, os, time

def env(name, default=""):
    return os.environ.get(name, default)

alarm = env("alarm") or env("name")
value_string = env("value_string") or env("value")
payload = {
    "status": env("status", "UNKNOWN"),
    "old_status": env("old_status"),
    "host": env("host") or env("args_host") or "unknown-host",
    "alarm": alarm or "unknown-alarm",
    "name": env("name"),
    "chart": env("chart"),
    "value": env("value"),
    "value_string": value_string,
    "old_value": env("old_value"),
    "old_value_string": env("old_value_string"),
    "info": env("info") or env("status_message") or "Netdata notification",
    "severity": env("severity"),
    "status_message": env("status_message"),
    "raised_for": env("raised_for"),
    "unique_id": env("unique_id") or f"netdata-{int(time.time())}",
    "alarm_id": env("alarm_id"),
    "event_id": env("event_id"),
    "when": env("when"),
    "goto_url": env("goto_url"),
    "source": "netdata-custom-sender",
}
print(json.dumps(payload, ensure_ascii=False))
PY
)"

# Optional origin pin - see header comment. Empty on the origin host itself.
resolve_args=()
if [[ -n "${OPS_INBOX_RESOLVE}" ]]; then
  resolve_args=(--resolve "${OPS_INBOX_RESOLVE}")
fi

curl -sS -o /dev/null -w '%{http_code}' \
  "${resolve_args[@]}" \
  -X POST \
  -H "Authorization: Bearer ${OPS_INBOX_INGEST_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data "${payload}" \
  "${OPS_INBOX_WEBHOOK_URL}" | grep -Eq '^2' || true
