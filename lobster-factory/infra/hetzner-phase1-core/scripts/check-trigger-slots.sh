#!/usr/bin/env bash
# check-trigger-slots.sh -- exit 1 when a Trigger.dev concurrency slot is held by a run that is not running.
# The 2026-10-23 outage: the env's currentConcurrency Redis set filled with runs that were not executing (PENDING /
# DEQUEUED), the engine stopped dequeuing, and every timer and button-started task stood still for 34h unseen
# (runbooks/TRIGGER-RUNS-STUCK-QUEUED.md). Leaked slots are never reclaimed by the engine, so this looks every 10 min.
#   held slot whose TaskRun is EXECUTING / WAITING_TO_RESUME / RETRYING_AFTER_FAILURE -> fine (a run in progress)
#   any other status, held for >= STUCK_MIN minutes since its last update, or no TaskRun row -> stuck, exit 1
#   DEVELOPMENT / PREVIEW envs are listed, never failed: a laptop `trigger dev` that dropped blocks nothing in prod.
# exit 2 = cannot tell (no env concurrency key at all = Trigger renamed its Redis keys; rows missing from the query).
# Read-only. Fix = cancel through the engine (runbook), never SREM.
# Tests swap the two readers: TRIGGER_REDIS_CLI / TRIGGER_PSQL (commands; psql reads SQL on stdin, prints a|b|c rows).
set -euo pipefail

STUCK_MIN="${STUCK_MIN:-15}"
RUNBOOK="runbooks/TRIGGER-RUNS-STUCK-QUEUED.md"

redis_q() { if [[ -n "${TRIGGER_REDIS_CLI:-}" ]]; then $TRIGGER_REDIS_CLI "$@"; else timeout 60 docker exec trigger-redis redis-cli "$@"; fi; }
psql_q() {
  if [[ -n "${TRIGGER_PSQL:-}" ]]; then $TRIGGER_PSQL
  else timeout 60 docker exec -i trigger-postgres psql -U trigger -d trigger -At -F '|' -v ON_ERROR_STOP=1; fi
}
env_keys() { printf '%s\n' "$1" | grep -v ':queue:' | grep . || true; }

# Each env always has its limit key; none at all = the key layout changed and "nothing held" would be a lie.
limits="$(env_keys "$(redis_q --scan --count 1000 --pattern 'engine:runqueue:*:env:*:concurrency')")"
[[ -n "$limits" ]] || { echo "cannot tell: no engine:runqueue:*:env:*:concurrency key (Trigger Redis key layout changed?)"; exit 2; }

# Env-level held sets (per-queue sets are subsets). Redis drops an empty set, so no key = 0 held in that env.
keys="$(env_keys "$(redis_q --scan --count 1000 --pattern 'engine:runqueue:*:env:*:currentConcurrency')")"

envs=(); ids=()
while IFS= read -r k; do
  [[ -z "$k" ]] && continue
  env="$(printf '%s' "$k" | sed -E 's/.*:env:([^:]+):currentConcurrency$/\1/')"
  [[ "$env" =~ ^[A-Za-z0-9_]+$ ]] || { echo "unexpected env in $k: refusing to query with it"; exit 2; }
  members="$(redis_q smembers "$k")"   # read first: a failure here must stop the script, not look like "0 held"
  while IFS= read -r m; do
    [[ -z "$m" ]] && continue
    [[ "$m" =~ ^[A-Za-z0-9_]+$ ]] || { echo "unexpected member in $k: refusing to query with it"; exit 2; }
    envs+=("$env"); ids+=("$m")
  done <<< "$members"
done <<< "$keys"

if (( ${#ids[@]} == 0 )); then echo "ok: 0 slots held"; exit 0; fi

q() { local s; s="$(printf "'%s'," "$@")"; printf '%s' "${s%,}"; }
rows="$(psql_q <<SQL
select m.env, m.id, coalesce(e.type::text, ''), coalesce(r.status::text, ''), coalesce(r."taskIdentifier", ''),
       coalesce(floor(extract(epoch from now() - r."updatedAt") / 60)::int::text, '')
from unnest(array[$(q "${envs[@]}")], array[$(q "${ids[@]}")]) as m(env, id)
left join "RuntimeEnvironment" e on e.id = m.env
left join lateral (select status, "taskIdentifier", "updatedAt" from "TaskRun"
                   where id = m.id or "friendlyId" = m.id limit 1) r on true;
SQL
)"
n_rows="$(printf '%s\n' "$rows" | grep -c . || true)"
(( n_rows == ${#ids[@]} )) || { echo "cannot tell: ${#ids[@]} slot(s) held but the query returned $n_rows row(s)"; exit 2; }

stuck=0
while IFS='|' read -r env id etype status task age; do
  [[ -z "$id" ]] && continue
  where="${etype:-?}/$env"
  case "$etype" in DEVELOPMENT|PREVIEW) echo "ignored ($where): $id $task ${status:-no TaskRun} ${age}min"; continue ;; esac
  case "$status" in
    EXECUTING|WAITING_TO_RESUME|RETRYING_AFTER_FAILURE) echo "held ($where): $id $task $status ${age}min" ;;
    "") echo "STUCK ($where): $id holds a slot but has no TaskRun row"; stuck=$((stuck + 1)) ;;
    *)
      if [[ "$age" =~ ^[0-9]+$ ]] && (( age < STUCK_MIN )); then echo "held ($where): $id $task $status ${age}min (young)"
      else echo "STUCK ($where): $id $task $status for ${age}min"; stuck=$((stuck + 1)); fi ;;
  esac
done <<< "$rows"

echo "${#ids[@]} slot(s) held, $stuck stuck"
if (( stuck )); then echo "fix: $RUNBOOK (cancel through the engine; never SREM)"; exit 1; fi
exit 0
