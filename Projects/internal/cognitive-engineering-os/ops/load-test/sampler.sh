#!/usr/bin/env bash
# Host-side watcher for one load level: API/DB container CPU+memory, PostgreSQL backend states, and PRODUCTION health.
#   usage: sampler.sh <label> <seconds>      (run from this directory; files land in out/<label>/)
# Production guard, opt-in: with PROD_HEALTH_URL set, three consecutive answers slower than PROD_LIMIT seconds (or not 200) touch
# state/ABORT, which load_test.py checks every second and stops on. Prod is only ever read (one GET every 3 s). Unset = no request.
set -u
label=${1:?label}
secs=${2:?seconds}
here=$(cd "$(dirname "$0")" && pwd)
out="$here/out/$label"
mkdir -p "$out" "$here/state"
rm -f "$here/state/ABORT"
limit=${PROD_LIMIT:-1.0}
prod=${PROD_HEALTH_URL:-}
end=$((SECONDS + secs))
slow=0
while [ $SECONDS -lt $end ]; do
  ts=$(date +%s)
  docker stats --no-stream --format "$ts,{{.Name}},{{.CPUPerc}},{{.MemUsage}}" cos-load-api-1 cos-load-db-1 >> "$out/stats.csv" 2>/dev/null &
  docker exec cos-load-db-1 psql -U cognitive -d cognitive_os -At -F, -c "select $ts, state, count(*) from pg_stat_activity where datname = current_database() group by state" >> "$out/pgconn.csv" 2>/dev/null &
  if [ -n "$prod" ]; then
    res=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" --max-time 5 "$prod")
    echo "$ts $res" >> "$out/prod-health.csv"
    code=${res%% *}
    took=${res##* }
    if [ "$code" != "200" ] || awk "BEGIN{exit !($took > $limit)}"; then slow=$((slow + 1)); else slow=0; fi
    if [ $slow -ge 3 ]; then echo "$ts PROD SLOW: touching ABORT" >> "$out/prod-health.csv"; touch "$here/state/ABORT"; fi
  fi
  wait
  sleep 2
done
