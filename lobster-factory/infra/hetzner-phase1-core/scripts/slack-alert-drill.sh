#!/usr/bin/env bash
# slack-alert-drill.sh -- manual drill of every host alert path. Run as root on the host.
#   1. notify.sh, the one host sender: Telegram + #ops-incidents + #infra-alerts (exactly the channels endpoint-alert and
#      verify-backup use). Prints "<channel>=<http code>" per channel; any failure fails the drill.
#   2. Ops Inbox health.
# Netdata is not drilled here: it alerts through Netdata Cloud (email); the host has no health_alarm_notify.conf, so
# `alarm-notify.sh test` would exercise a path nothing uses (checked 2026-10-25, WORKLOG 續61).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

printf '[DRILL] %s 主機通知演練：Telegram、#ops-incidents、#infra-alerts 應各收到這一則。' "$(date -u +%FT%TZ)" \
  | "$HERE/notify.sh" --slack SLACK_INFRA_ALERTS_WEBHOOK

curl -fsS https://app.aware-wave.com/api/ops/inbox/health >/dev/null
echo "ops_inbox_health_ok"
