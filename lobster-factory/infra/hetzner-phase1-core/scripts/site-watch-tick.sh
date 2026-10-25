#!/usr/bin/env bash
# site-watch-tick.sh -- the hourly site-watch clock (cron.d/awarewave-schedules; SITE_WATCH_MASTER_PLAN.md §3.1).
# next-admin decides everything: /due stamps the watchdog heartbeat and names the targets that are due or owe a
# notification; each target runs in its own /run/<id> call (C4: no route loops over clients), two at a time (the
# renderer shoots one page at a time, plan §6.2 R6); then /cleanup. Leases make an overlapping or repeated call safe.
# Exit 1 when any call failed, a run reports renderer_unavailable (the monitor itself is down, never a site verdict),
# or the round outlived its hour (the next tick was skipped, and its exit 1 must not be overwritten by a late 0).
set -euo pipefail

ENV_FILE="${POKE_ENV_FILE:-/root/lobster-phase1/.env}"
BASE="${POKE_BASE_URL:-http://127.0.0.1:3002}/api/internal/site-watch"
LOG_FILE="${SITE_WATCH_TICK_LOG:-/var/log/site-watch-tick.log}"
LOCK="${SITE_WATCH_TICK_LOCK:-/tmp/site-watch-tick.lock}"
HOUR_S="${SITE_WATCH_TICK_HOUR_S:-3300}"   # cron is hourly at :05; a round longer than 55 min collides with the next

fail() { echo "[$(date -u +%FT%TZ)] $*" >> "$LOG_FILE"; exit 1; }
started=$(date +%s)

exec 9>"$LOCK"
flock -n 9 || fail "previous tick still running -- skipped"

[[ -r "$ENV_FILE" ]] || fail "$ENV_FILE not readable -- nothing checked"
# Plain read, never `source`: a value containing $(...) must not execute as root.
SITE_WATCH_INGEST_TOKEN="$(sed -n 's/^SITE_WATCH_INGEST_TOKEN=//p' "$ENV_FILE" | tail -1 | tr -d '\r"')"
[[ -n "$SITE_WATCH_INGEST_TOKEN" ]] || fail "SITE_WATCH_INGEST_TOKEN not set -- nothing checked"
export SITE_WATCH_INGEST_TOKEN BASE

# post <path> <max seconds> -> body on stdout; non-2xx -> message on stderr, exit 1. Token on stdin, never argv.
# Self-hosted Next.js does not enforce maxDuration: a curl timeout (HTTP 000) leaves the run going server-side; its
# lease (SITE_WATCH_MASTER_PLAN.md C3) keeps a second call for the same target out until it ends.
post() {
  local out code
  out="$(mktemp)"
  code="$(printf 'Authorization: Bearer %s\n' "$SITE_WATCH_INGEST_TOKEN" \
    | curl -s -m "$2" -o "$out" -w '%{http_code}' -X POST -H @- "$BASE$1" || true)"
  if [[ ! "$code" =~ ^2 ]]; then echo "$1 HTTP ${code:-000} $(head -c 300 "$out")" >&2; rm -f "$out"; return 1; fi
  cat "$out"; rm -f "$out"
}
export -f post

due="$(post /due 60 2>&1)" || fail "$due"
targets="$(printf '%s' "$due" | jq -r '.targets[]?')" || fail "/due answer is not JSON: $(printf '%s' "$due" | head -c 300)"
# Ids are passed to bash as an argument, never pasted into its code; anything but a uuid is refused.
bad="$(printf '%s\n' "$targets" | grep -v -E '^([0-9a-f-]{36})?$' || true)"
[[ -z "$bad" ]] || fail "/due returned a non-uuid target id: $(printf '%s' "$bad" | head -c 120)"

failed=0
if [[ -n "$targets" ]]; then
  # One line per target: "ok <id> <status>" or "fail <id> <why>".
  results="$(printf '%s\n' "$targets" | xargs -P 2 -n 1 bash -c '
    if r="$(post "/run/$1" 330 2>&1)"; then
      s="$(printf "%s" "$r" | jq -r ".result.status // \"?\"")"
      if [[ "$s" == renderer_unavailable ]]; then echo "fail $1 renderer_unavailable $(printf "%s" "$r" | jq -r ".result.error // \"\"")"; else echo "ok $1 $s"; fi
    else echo "fail $1 $r"; fi' _)"
  while IFS= read -r line; do
    [[ "$line" == fail* ]] && { echo "[$(date -u +%FT%TZ)] run $line" >> "$LOG_FILE"; failed=1; }
  done <<< "$results"
fi

cleanup="$(post /cleanup 330 2>&1)" || fail "$cleanup"
(( $(date +%s) - started <= HOUR_S )) || fail "round took $(( $(date +%s) - started ))s -- outlived its hour"
exit "$failed"
