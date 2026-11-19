#!/usr/bin/env bash
# social-channel-health.sh -- every 5 minutes (cron.d/awarewave-schedules, key social_channel_health): read Postiz's own
# "Integration" table (database postiz in supabase-db) and POST it to next-admin /api/internal/social/channel-health,
# which mirrors it into social_accounts.status (lib/social/channel-health.ts). Postiz v2.25.1's public API does not
# return refreshNeeded / inBetweenSteps, hence the table (SOC-REAUTH 2026-11-19). Read-only transaction; no new account:
# supabase_admin as check-auth-profiles.sh does (the postgres role is refused on Postiz's tables, measured 2026-11-19).
# Token (SOCIAL_DISPATCH_TOKEN, from .env, plain read never `source`) goes to curl on stdin, never argv (poke.sh).
# Exit 1 = not mirrored (query failed / empty answer / HTTP non-2xx / ok:false); cron-run.sh records it for /ops/schedules.
# Tests: CHANNEL_HEALTH_PSQL replaces the reader (SQL on stdin, JSON on stdout); POKE_ENV_FILE / POKE_BASE_URL as poke.sh.
set -euo pipefail

ENV_FILE="${POKE_ENV_FILE:-/root/lobster-phase1/.env}"
BASE="${POKE_BASE_URL:-http://127.0.0.1:3002}"
LOG_FILE="${POKE_LOG_FILE:-/var/log/poke.log}"
fail() { echo "[$(date -u +%FT%TZ)] social_channel_health: $*" >> "$LOG_FILE"; echo "$*" >&2; exit 1; }

psql_q() {
  if [[ -n "${CHANNEL_HEALTH_PSQL:-}" ]]; then $CHANNEL_HEALTH_PSQL
  else timeout 60 docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' supabase-db \
    psql -U supabase_admin -d postiz -At -v ON_ERROR_STOP=1; fi
}

json="$(psql_q <<'SQL'
select coalesce(json_agg(json_build_object(
  'id', id, 'provider', "providerIdentifier", 'refreshNeeded', coalesce("refreshNeeded", false),
  'disabled', coalesce(disabled, false), 'inBetweenSteps', coalesce("inBetweenSteps", false),
  'deleted', "deletedAt" is not null, 'internalId', "internalId") order by id), '[]'::json)
from "Integration";
SQL
)" || fail "Postiz Integration query failed -- not mirrored"
[[ "$json" == \[* ]] || fail "unexpected answer from the Integration query -- not mirrored"

[[ -r "$ENV_FILE" ]] || fail "$ENV_FILE not readable -- not mirrored"
token="$(sed -n "s/^SOCIAL_DISPATCH_TOKEN=//p" "$ENV_FILE" | tail -1 | tr -d '\r"')"
[[ -n "$token" ]] || fail "SOCIAL_DISPATCH_TOKEN not set in $ENV_FILE -- not mirrored"

out="$(mktemp)"; body="$(mktemp)"; trap 'rm -f "$out" "$body"' EXIT
printf '%s' "$json" > "$body"
code="$(printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$token" \
  | curl -s -m 70 -o "$out" -w '%{http_code}' -X POST -H @- --data-binary @"$body" "$BASE/api/internal/social/channel-health" || true)"
answer="$(head -c 400 "$out")"
[[ "$code" =~ ^2 ]] || fail "HTTP ${code:-000} $answer"
if grep -q '"ok"[[:space:]]*:[[:space:]]*false' "$out"; then fail "ok:false $answer"; fi
echo "ok: $answer"
