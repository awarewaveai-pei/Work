#!/usr/bin/env bash
# cron-run.sh <job_key> '<command>' -- run one host schedule and record how it ended, for /ops/schedules.
# Every line in scripts/cron.d/* goes through this. The command (with its own >> log redirect) runs unchanged
# under bash -c; afterwards $CRON_RUN_JOBS_DIR/<job_key>.json = {key, started_at, finished_at, exit_code},
# replaced by rename. report-host-schedules.py joins these records with the live cron files.
# Exit code = the command's. Failing to write the record never changes it: the job matters more than its record.
set -uo pipefail

JOBS_DIR="${CRON_RUN_JOBS_DIR:-/var/lib/awarewave/jobs}"

if [[ $# -ne 2 || ! "${1}" =~ ^[a-z0-9_]+$ || -z "${2}" ]]; then
  echo "usage: cron-run.sh <job_key [a-z0-9_]> '<command>'" >&2
  exit 64
fi
key="$1"; cmd="$2"

started="$(date -u +%FT%TZ)"
bash -c "$cmd"
rc=$?
finished="$(date -u +%FT%TZ)"

record() {
  local tmp
  mkdir -p "$JOBS_DIR" || return 1
  tmp="$(mktemp "$JOBS_DIR/.${key}.XXXXXX")" || return 1
  printf '{"key":"%s","started_at":"%s","finished_at":"%s","exit_code":%d}\n' \
    "$key" "$started" "$finished" "$rc" > "$tmp" && chmod 0644 "$tmp" && mv -f "$tmp" "$JOBS_DIR/$key.json" \
    || { rm -f "$tmp"; return 1; }
}
record || echo "[cron-run] $key: cannot write $JOBS_DIR/$key.json (job exit $rc kept)" >&2

exit "$rc"
