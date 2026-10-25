#!/usr/bin/env bash
# poke.sh <key> <path> <TOKEN_VAR> -- the host clock's one way to start a next-admin job (cron.d/awarewave-schedules):
# POST http://127.0.0.1:3002<path> with the bearer token named TOKEN_VAR in /root/lobster-phase1/.env. All logic lives in
# the route; this only rings it. Exit 1 = the job did not run: .env unreadable, token unset, no answer, non-2xx, or a
# 2xx body saying "ok":false. cron-run.sh records the exit for /ops/schedules; only failures are logged here.
# The token goes to curl on stdin, never argv (`ps` shows argv to every local user; same as ops-probe-heartbeat.sh).
set -euo pipefail

ENV_FILE="${POKE_ENV_FILE:-/root/lobster-phase1/.env}"
BASE="${POKE_BASE_URL:-http://127.0.0.1:3002}"
LOG_FILE="${POKE_LOG_FILE:-/var/log/poke.log}"
# Self-hosted Next.js does not enforce a route's maxDuration: giving up here does not stop the route. 310 s covers
# the longest declared one (300); a timeout is logged as HTTP 000 and the work may still finish server-side.
MAX_TIME="${POKE_MAX_TIME:-310}"

if [[ $# -ne 3 || ! "$1" =~ ^[a-z0-9_]+$ || "$2" != /* || ! "$3" =~ ^[A-Z0-9_]+$ ]]; then
  echo "usage: poke.sh <key> </api/path> <TOKEN_VAR>" >&2
  exit 64
fi
key="$1"; path="$2"; token_var="$3"

fail() { echo "[$(date -u +%FT%TZ)] $key: $*" >> "$LOG_FILE"; exit 1; }

[[ -r "$ENV_FILE" ]] || fail "$ENV_FILE not readable -- not started"
# Plain read, never `source`: a value containing $(...) must not execute as root.
token="$(sed -n "s/^${token_var}=//p" "$ENV_FILE" | tail -1 | tr -d '\r"')"
[[ -n "$token" ]] || fail "$token_var not set in $ENV_FILE -- not started"

out="$(mktemp)"; trap 'rm -f "$out"' EXIT
code="$(printf 'Authorization: Bearer %s\n' "$token" \
  | curl -s -m "$MAX_TIME" -o "$out" -w '%{http_code}' -X POST -H @- "$BASE$path" || true)"
body="$(head -c 400 "$out")"
[[ "$code" =~ ^2 ]] || fail "HTTP ${code:-000} $body"
if grep -q '"ok"[[:space:]]*:[[:space:]]*false' "$out"; then fail "ok:false $body"; fi
exit 0
