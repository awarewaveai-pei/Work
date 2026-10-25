#!/usr/bin/env bash
# trigger-task.sh <key> <task-id> -- the host clock starting a Trigger.dev task (cron.d/awarewave-schedules). Trigger only
# runs the work; the clock lives here, so a stalled Trigger queue stops this one task and turns its row red instead of
# silently stopping every schedule (runbooks/TRIGGER-RUNS-STUCK-QUEUED.md). Starts the task on the host-local API, waits
# for the run to end, exit 1 unless it COMPLETED and its output does not say "status":"fail" -- so the row on
# /ops/schedules reflects the task's verdict, not merely that it was started.
# The run carries a ttl shorter than the wait: during a stall it EXPIRES instead of piling up behind the queue.
set -euo pipefail

ENV_FILE="${POKE_ENV_FILE:-/root/lobster-phase1/.env}"
API="${TRIGGER_LOCAL_API:-http://127.0.0.1:8030}"
LOG_FILE="${TRIGGER_TASK_LOG:-/var/log/trigger-task.log}"
TTL="${TRIGGER_TASK_TTL:-9m}"
WAIT_S="${TRIGGER_TASK_WAIT:-570}"   # past the 9 min ttl, so a run that never started is seen as EXPIRED

if [[ $# -ne 2 || ! "$1" =~ ^[a-z0-9_]+$ || ! "$2" =~ ^[a-z0-9-]+$ ]]; then
  echo "usage: trigger-task.sh <key> <task-id>" >&2
  exit 64
fi
key="$1"; task="$2"

fail() { echo "[$(date -u +%FT%TZ)] $key: $*" >> "$LOG_FILE"; exit 1; }

# One wait per key: a */10 call must not start while the previous one is still waiting on its run.
exec 9>"${TRIGGER_TASK_LOCK_DIR:-/tmp}/trigger-task-$key.lock"
flock -n 9 || fail "previous call still waiting -- skipped"

[[ -r "$ENV_FILE" ]] || fail "$ENV_FILE not readable -- not started"
# Plain read, never `source`: a value containing $(...) must not execute as root.
token="$(sed -n 's/^TRIGGER_ACCESS_TOKEN=//p' "$ENV_FILE" | tail -1 | tr -d '\r"')"
[[ -n "$token" ]] || fail "TRIGGER_ACCESS_TOKEN not set -- not started"
# api <curl args...>: the token goes to curl on stdin, never argv (`ps` shows argv to every local user).
api() { printf 'Authorization: Bearer %s\n' "$token" | curl -s -m 30 -H @- "$@" || true; }

started="$(api -X POST -H 'Content-Type: application/json' -d "{\"payload\":{},\"options\":{\"ttl\":\"$TTL\"}}" \
  "$API/api/v1/tasks/$task/trigger")"
run="$(printf '%s' "$started" | jq -r '.id // empty' 2>/dev/null || true)"
[[ -n "$run" ]] || fail "not started: $(printf '%s' "$started" | head -c 300)"

deadline=$(( $(date +%s) + WAIT_S ))
status=""
while (( $(date +%s) < deadline )); do
  sleep 5
  r="$(api "$API/api/v3/runs/$run")"
  status="$(printf '%s' "$r" | jq -r '.status // empty' 2>/dev/null || true)"
  case "$status" in
    COMPLETED)
      [[ "$(printf '%s' "$r" | jq -r '.output.status // empty')" == fail ]] \
        && fail "$run completed with status fail: $(printf '%s' "$r" | jq -c '[.output.checks[]? | select(.status == "fail")]' | head -c 300)"
      exit 0 ;;
    CANCELED|FAILED|CRASHED|SYSTEM_FAILURE|EXPIRED|TIMED_OUT|INTERRUPTED)
      fail "$run ended $status" ;;
  esac
done
fail "$run still ${status:-unknown} after ${WAIT_S}s (queue stalled? runbooks/TRIGGER-RUNS-STUCK-QUEUED.md)"
