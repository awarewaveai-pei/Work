#!/usr/bin/env bash
# SSOT in repo: lobster-factory/infra/hetzner-phase1-core/auto-reboot/ks-aw-01-boot-health-notify.sh
# Deploy target: /usr/local/bin/ks-aw-01-boot-health-notify.sh on ks-aw-01
# Run by: ks-aw-01-boot-notify.service (same directory), on every boot.
#
# WHY THIS EXISTS (2026-08-30)
# ----------------------------
# The old SG/EU topology made a bad reboot low-stakes: one box down still left the
# other serving, so nobody needed to watch a reboot happen. ks-aw-01 alone is a
# single point of failure -- a reboot that doesn't come back healthy takes
# everything down, and the operator explicitly asked "how would I know if it broke
# without me noticing". This script is that notification, unconditionally, for
# every boot (unattended-upgrades automatic reboot AND manual /ks-aw-01-reboot),
# not just the ones someone remembered to watch.
#
# Sends through /root/lobster-phase1/scripts/notify.sh (the one host sender; Telegram + #ops-incidents, settings in
# the host .env) -- no secret of its own.
#
# Design: best-effort, never blocks boot, never fails loudly if Telegram itself is
# unreachable (falls back to syslog so the information isn't lost, just quieter).

set -uo pipefail

log() { logger -t ks-aw-01-boot-notify "$1"; }

# Telegram + #ops-incidents through the one host sender (lobster-phase1/scripts/notify.sh, synced from the repo;
# settings in the host .env). A failed send is logged with the message, so the information is never only in flight.
send_alert() {
  local out
  if out="$(printf '%s' "$1" | "${NOTIFY_SH:-/root/lobster-phase1/scripts/notify.sh}" 2>&1)"; then log "notified: $(echo $out)"
  else log "notify incomplete: $(echo $out) -- message was: $1"; fi
}

# Give docker + all ~45 containers a real chance to come up before judging health --
# checking immediately after boot would report false failures for slow-starting
# services (Supabase, ClickHouse) and defeat the point of this script.
sleep 90
# A container still inside its healthcheck start_period reports "starting", which is neither healthy nor unhealthy:
# judging then passes a service that is about to fail (postiz has start_period 300s). Wait up to 5 more minutes.
for _ in $(seq 30); do
  [ -z "$(docker ps --filter health=starting --format '{{.Names}}' 2>/dev/null)" ] && break
  sleep 10
done

FAILURES=""
check() {
  local name="$1" url="$2" host_header="${3:-}"
  local code
  if [ -n "$host_header" ]; then
    code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Host: ${host_header}" "$url" 2>/dev/null || echo "000")
  else
    code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$url" 2>/dev/null || echo "000")
  fi
  case "$code" in
    2*|3*|401|403) : ;;
    *) FAILURES="${FAILURES}${name}=${code} " ;;
  esac
}

check "next-admin"    "http://127.0.0.1:3002/login"
check "node-api"      "http://127.0.0.1:3001/health"
check "ops-summary"   "http://127.0.0.1/api/ops/summary" "app.aware-wave.com"
check "wordpress"     "http://127.0.0.1/" "aware-wave.com"
check "supabase-kong" "http://127.0.0.1:8000/" "supabase.aware-wave.com"
check "trigger"       "http://127.0.0.1/" "trigger.aware-wave.com"
check "n8n"           "http://127.0.0.1/n8n/" "n8n.aware-wave.com"
check "uptime-kuma"   "http://127.0.0.1:3005/dashboard"
check "postiz"        "http://127.0.0.1:4007/api/public/v1/is-connected"   # the backend (401 = up); / is only the frontend
check "soulful"       "http://127.0.0.1/" "soulfulexpression.org"

UNHEALTHY=$(docker ps --filter health=unhealthy --format '{{.Names}}' 2>/dev/null | tr '\n' ' ')
NOT_RUNNING=$(docker ps -a --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -viE 'up ' | awk '{print $1}' | tr '\n' ' ')
KERNEL=$(uname -r)
REBOOT_PENDING=$([ -f /var/run/reboot-required ] && echo "YES (still pending after this reboot -- unexpected)" || echo "no")

if [ -z "$FAILURES" ] && [ -z "$UNHEALTHY" ] && [ -z "$NOT_RUNNING" ]; then
  MSG="[ks-aw-01] Boot OK. Kernel ${KERNEL}. All endpoint checks + container health passed. reboot-required: ${REBOOT_PENDING}."
else
  MSG="[ks-aw-01] Boot completed with problems -- INVESTIGATE. Kernel ${KERNEL}."
  [ -n "$FAILURES" ] && MSG="${MSG} Endpoint failures: ${FAILURES}."
  [ -n "$UNHEALTHY" ] && MSG="${MSG} Unhealthy containers: ${UNHEALTHY}."
  [ -n "$NOT_RUNNING" ] && MSG="${MSG} Not running: ${NOT_RUNNING}."
fi

log "$MSG"
send_alert "$MSG"
