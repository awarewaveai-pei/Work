#!/usr/bin/env bash
# slack-alert-drill.sh -- manual drill of every host alert path. Run as root on the host.
#   1. notify.sh, the one host sender: Telegram + #ops-incidents + #infra-alerts (exactly the channels endpoint-alert and
#      verify-backup use). Prints "<channel>=<http code>" per channel; any failure fails the drill.
#   2. Netdata's own notifier (Slack #infra-alerts and the Netdata -> Ops Inbox -> #ops-incidents path).
#   3. Ops Inbox health.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

printf '[DRILL] %s 主機通知演練：Telegram、#ops-incidents、#infra-alerts 應各收到這一則。' "$(date -u +%FT%TZ)" \
  | "$HERE/notify.sh" --slack SLACK_INFRA_ALERTS_WEBHOOK

/usr/libexec/netdata/plugins.d/alarm-notify.sh test
echo "netdata_alarm_notify_test_invoked"

curl -fsS https://app.aware-wave.com/api/ops/inbox/health >/dev/null
echo "ops_inbox_health_ok"
