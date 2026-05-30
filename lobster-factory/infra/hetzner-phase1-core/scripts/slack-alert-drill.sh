#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f /etc/default/awarewave-endpoint-alert ]]; then
  echo "missing /etc/default/awarewave-endpoint-alert" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. /etc/default/awarewave-endpoint-alert
if [[ -f /etc/default/awarewave-endpoint-alert.local ]]; then
  # shellcheck disable=SC1091
  . /etc/default/awarewave-endpoint-alert.local
fi
set +a

unset CHECK_URLS TIMEOUT_SEC CHECK_URLS_SLOW TIMEOUT_SEC_SLOW 2>/dev/null || true

if [[ -z "${WEBHOOK_URL:-}" ]]; then
  echo "WEBHOOK_URL is empty" >&2
  exit 1
fi
if [[ -z "${OPS_INCIDENTS_WEBHOOK_URL:-}" ]]; then
  echo "OPS_INCIDENTS_WEBHOOK_URL is empty; #ops-incidents endpoint drill will be skipped" >&2
fi

python3 - <<PY
import json, os, urllib.request, subprocess
from datetime import datetime, timezone

ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def post(env_name: str, text: str) -> None:
    url = os.environ.get(env_name, "")
    if not url:
        print("slack_post_skipped", env_name)
        return
    payload = {"text": text}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = resp.read().decode("utf-8", errors="replace").strip()
        print("slack_post", env_name, resp.status, body)

post(
    "WEBHOOK_URL",
    "[DRILL:endpoint-alert] "
    + ts
    + " Manual drill to #infra-alerts from VPS endpoint-alert env."
)

post(
    "OPS_INCIDENTS_WEBHOOK_URL",
    "[DRILL:endpoint-alert-secondary] "
    + ts
    + " Manual drill to #ops-incidents from VPS endpoint-alert local env."
)

post(
    "WEBHOOK_URL",
    "[DRILL:uptime-public-surface] "
    + ts
    + " This represents the public URL checks (uptime/app/api/n8n) wired through endpoint-alert.sh + timer."
)

# Netdata official notifier test exercises Slack #infra-alerts and the custom
# Netdata -> Ops Inbox -> #ops-incidents secondary path.
subprocess.check_call(["/usr/libexec/netdata/plugins.d/alarm-notify.sh", "test"])
print("netdata_alarm_notify_test_invoked")
PY

curl -fsS https://app.aware-wave.com/api/ops/inbox/health >/dev/null
echo "ops_inbox_health_ok"
