#!/usr/bin/env bash
# One load level with its host-side watcher:  ./run_level.sh <label> <users> <ramp_s> <duration_s> [extra load_test.py args]
# Output: out/<label>/{result.json,run.log,stats.csv,pgconn.csv,prod-health.csv}. Needs COS_LOAD_DB_PASSWORD (export from .pw).
# Optional: PROD_HEALTH_URL=<public health URL> watches production and aborts the load when it slows (sampler.sh).
set -eu
label=${1:?label}; users=${2:?users}; ramp=${3:?ramp}; duration=${4:?duration}; shift 4
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
mkdir -p "out/$label"
rm -f "out/$label"/*.csv
./sampler.sh "$label" $((ramp + duration + 90)) &
watcher=$!
docker compose -p cos-load -f docker-compose.load.yml run --rm loadgen /work/load_test.py run \
  --users "$users" --ramp "$ramp" --duration "$duration" --label "$label" --out "/work/out/$label/result.json" "$@" 2>&1 | grep -v "^ Container" | tee "out/$label/run.log"
kill "$watcher" 2>/dev/null || true
wait 2>/dev/null || true
echo "peak API/DB CPU and memory:"
awk -F, '{gsub("%","",$3); if ($3+0 > m[$2]) m[$2]=$3+0; u[$2]=$4} END {for (n in m) print n, "max_cpu%", m[n], "last_mem", u[n]}' "out/$label/stats.csv"
echo "max backends by state:"
awk -F, '{if ($3+0 > m[$2]) m[$2]=$3+0} END {for (s in m) print s, m[s]}' "out/$label/pgconn.csv"
echo "prod health (PROD_HEALTH_URL, opt-in): max seconds / non-200:"
[ -f "out/$label/prod-health.csv" ] && awk '{if ($3+0 > m) m=$3+0; if ($2 != 200 && NF == 3) bad++} END {print m, bad+0}' "out/$label/prod-health.csv" || true
