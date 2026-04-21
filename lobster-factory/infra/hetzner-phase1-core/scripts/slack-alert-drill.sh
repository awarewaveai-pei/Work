#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f /etc/default/awarewave-endpoint-alert ]]; then
  echo "missing /etc/default/awarewave-endpoint-alert" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. /etc/default/awarewave-endpoint-alert
set +a

unset CHECK_URLS TIMEOUT_SEC 2>/dev/null || true

if [[ -z "${WEBHOOK_URL:-}" ]]; then
  echo "WEBHOOK_URL is empty" >&2
  exit 1
fi

python3 - <<PY
import json, os, urllib.request, subprocess
from datetime import datetime, timezone

ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def post(text: str) -> None:
    url = os.environ.get("WEBHOOK_URL", "")
    if not url:
        raise SystemExit("WEBHOOK_URL missing")
    payload = {"text": text}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = resp.read().decode("utf-8", errors="replace").strip()
        print("slack_post", resp.status, body)

post(
    "[DRILL:endpoint-alert] "
    + ts
    + " Manual drill from VPS /etc/default/awarewave-endpoint-alert (same file used by systemd timer)."
)

post(
    "[DRILL:uptime-public-surface] "
    + ts
    + " This represents the public URL checks (uptime/app/api/n8n) wired through endpoint-alert.sh + timer."
)

# Netdata official notifier test (exercises Netdata -> Slack path)
subprocess.check_call(["/usr/libexec/netdata/plugins.d/alarm-notify.sh", "test"])
print("netdata_alarm_notify_test_invoked")
PY
