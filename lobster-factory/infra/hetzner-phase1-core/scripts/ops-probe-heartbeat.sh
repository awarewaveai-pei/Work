#!/usr/bin/env bash
# ops-probe-heartbeat.sh -- POST /api/ops/probe (ops-inbox liveness row that /health reads). Root cron, */30.
# The bearer token is read from the compose .env at run time and handed to curl on stdin: it is not in the
# crontab, not in argv (`ps` shows argv to every local user), not in this file. Until 2026-09-24 the cron
# line itself carried the token in plaintext.
set -uo pipefail
ENV_FILE="${OPS_PROBE_ENV_FILE:-/root/lobster-phase1/.env}"
URL="${OPS_PROBE_URL:-https://app.aware-wave.com/api/ops/probe}"
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Plain read, never `source`: a value containing $(...) must not execute as root.
token="$(sed -n 's/^OPS_INBOX_INGEST_TOKEN=//p' "$ENV_FILE" 2>/dev/null | tail -1 | tr -d '\r"')"
[[ -n "$token" ]] || { echo "$(ts) ops-probe: OPS_INBOX_INGEST_TOKEN missing in $ENV_FILE"; exit 1; }

body="$(printf 'Authorization: Bearer %s\n' "$token" \
  | curl -sS --max-time 30 -X POST -H @- -w '\n%{http_code}' "$URL" 2>&1)"
code="${body##*$'\n'}"
echo "$(ts) ops-probe: http=$code ${body%$'\n'*}"
[[ "$code" == 200 ]]
