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

# This file may also define CHECK_URLS/TIMEOUT_SEC for systemd jobs; ignore them here.
unset CHECK_URLS TIMEOUT_SEC 2>/dev/null || true

if [[ -z "${WEBHOOK_URL:-}" ]]; then
  echo "WEBHOOK_URL is empty" >&2
  exit 1
fi

python3 - <<'PY'
import json, os, urllib.request

url = os.environ.get("WEBHOOK_URL", "")
if not url:
    raise SystemExit("WEBHOOK_URL missing after sourcing env file")

payload = {
    "text": (
        "[aware-wave alert self-test] "
        "If you see this, the VPS endpoint-alert webhook is wired correctly. "
        "Reply in-thread with the Slack channel name where it landed."
    )
}

data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(
    url,
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(req, timeout=20) as resp:
    body = resp.read().decode("utf-8", errors="replace").strip()
    print("http_status=", resp.status)
    print("slack_body=", body)
PY
