#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="/var/lib/awarewave-alert"
STATE_FILE="${STATE_DIR}/last_state"

WEBHOOK_URL="${WEBHOOK_URL:-}"
CHECK_URLS="${CHECK_URLS:-https://aware-wave.com/ https://app.aware-wave.com/ https://api.aware-wave.com/health https://n8n.aware-wave.com/healthz https://trigger.aware-wave.com/ https://uptime.aware-wave.com/dashboard}"
TIMEOUT_SEC="${TIMEOUT_SEC:-12}"
HEARTBEAT_URL="${HEARTBEAT_URL:-}"

# Optional: PagerDuty Events API v2 integration key (same host as "Routing key" in PD UI).
PAGERDUTY_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY:-}"
# Stable per-host dedup key so trigger/resolve match the same incident.
PAGERDUTY_DEDUP_KEY="${PAGERDUTY_DEDUP_KEY:-awarewave-endpoint-$(hostname)}"

if [[ -z "${WEBHOOK_URL}" ]]; then
  echo "endpoint-alert: WEBHOOK_URL is required" >&2
  exit 1
fi

mkdir -p "${STATE_DIR}"

send_webhook() {
  local text="$1"
  local payload
  payload="$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "${text}")"
  curl -fsS -X POST -H "Content-Type: application/json" \
    --data "${payload}" \
    "${WEBHOOK_URL}" >/dev/null
}

send_pagerduty() {
  local event_action="$1" # trigger | resolve
  local summary="$2"
  local details="$3"
  [[ -z "${PAGERDUTY_ROUTING_KEY}" ]] && return 0
  export PD_EVENT_ACTION="${event_action}"
  export PD_SUMMARY="${summary}"
  export PD_DETAILS="${details}"
  export PD_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY}"
  export PD_DEDUP_KEY="${PAGERDUTY_DEDUP_KEY}"
  export PD_HOST="$(hostname)"
  python3 <<'PY'
import json, os, urllib.error, urllib.request

action = os.environ["PD_EVENT_ACTION"]
rk = os.environ["PD_ROUTING_KEY"]
dedup = os.environ["PD_DEDUP_KEY"]
host = os.environ["PD_HOST"]

if action == "trigger":
    summary = os.environ["PD_SUMMARY"]
    details = os.environ["PD_DETAILS"]
    body = {
        "routing_key": rk,
        "event_action": "trigger",
        "dedup_key": dedup,
        "payload": {
            "summary": summary,
            "source": host,
            "severity": "error",
            "component": "endpoint-alert",
            "group": "aware-wave-public",
            "class": "http_check",
            "custom_details": {"failures": details},
        },
    }
else:
    body = {
        "routing_key": rk,
        "event_action": "resolve",
        "dedup_key": dedup,
    }

data = json.dumps(body).encode("utf-8")
req = urllib.request.Request(
    "https://events.pagerduty.com/v2/enqueue",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        _ = resp.read()
except urllib.error.HTTPError as e:
    print(f"endpoint-alert: PagerDuty HTTP {e.code}: {e.read()!r}", file=__import__("sys").stderr)
    raise
PY
}

send_heartbeat() {
  [[ -z "${HEARTBEAT_URL}" ]] && return 0
  curl -fsS --max-time "${TIMEOUT_SEC}" "${HEARTBEAT_URL}" >/dev/null
}

fail_lines=()
for url in ${CHECK_URLS}; do
  code="$(curl -sS -o /dev/null -L -w "%{http_code}" --max-time "${TIMEOUT_SEC}" "${url}" || true)"
  # 2xx / 3xx only (avoid bash ERE pitfall: ^2|3 matches a lone "3" anywhere)
  if [[ ! "${code}" =~ ^[23][0-9]{2}$ ]]; then
    fail_lines+=("${url} -> ${code}")
  fi
done

new_state="ok"
[[ ${#fail_lines[@]} -gt 0 ]] && new_state="fail"
old_state="$(cat "${STATE_FILE}" 2>/dev/null || true)"

# Avoid false "recovered" on first run (empty state file + all checks ok).
notify=false
if [[ "${new_state}" != "${old_state}" ]]; then
  if [[ "${new_state}" == "fail" ]]; then
    notify=true
  elif [[ "${new_state}" == "ok" && -n "${old_state}" ]]; then
    notify=true
  fi
fi

if [[ "${notify}" == "true" ]]; then
  host="$(hostname)"
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [[ "${new_state}" == "fail" ]]; then
    msg=":rotating_light: [aware-wave endpoint alert] ${host} ${ts}\n$(printf '%s\n' "${fail_lines[@]}")"
    detail_text="$(printf '%s\n' "${fail_lines[@]}")"
    send_webhook "${msg}"
    send_pagerduty "trigger" "[aware-wave] public endpoint check failed (${host})" "${detail_text}"
  else
    msg=":white_check_mark: [aware-wave endpoint recovered] ${host} ${ts}"
    send_webhook "${msg}"
    send_pagerduty "resolve" "[aware-wave] public endpoint check recovered (${host})" ""
  fi
fi

if [[ "${new_state}" == "ok" ]]; then
  send_heartbeat
fi

printf "%s" "${new_state}" > "${STATE_FILE}"
