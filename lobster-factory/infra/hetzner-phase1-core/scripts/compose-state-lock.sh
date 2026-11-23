#!/usr/bin/env bash
# compose-state-lock.sh -- the ONE lock for everything that starts, stops, recreates or reloads containers of the
# lobster-phase1 stack on ks-aw-01: sg-deploy.sh (snapshot to exit), rollback-phase1.sh restore / n8n-pin,
# safe-infra-patch.sh (every type) and next-admin's auto-remediation restart. Why: 2026-11-22 09:56Z a next-admin
# deploy's new container was stopped two seconds after `up` by another operation on the host; the deploy read the
# stopped container as "unhealthy", rolled back a good build, and the rollback's own `up` met the same interference.
# /tmp/sg-deploy.lock only kept two sg-deploy runs apart, and --force skipped even that.
#
# A kernel flock: it is released when the holder exits however it dies, so there is no stale lock and nothing to force.
# The holder's children inherit fd 217 and with it the lock -- sg-deploy.sh calling rollback-phase1.sh is the same
# holder, not a second one. So a holder must not start anything that outlives it.
# It does not stop a hand-typed `docker stop` / `docker compose up`; sg-deploy.sh's health wait names that case instead.
#
# Sourced:   compose_state_lock <who> [wait-seconds]
#              0 = held until this process and its children exit
#              1 = not acquired; COMPOSE_STATE_LOCK_BUSY says who holds it (or why it could not be opened)
# Executed:  compose-state-lock.sh <who> <wait-seconds> <command...>   runs the command under the lock; 75 when busy
# Tests: tests/host-scripts/deploy-interference.test.sh

# /run/lock, not /tmp: systemd-tmpfiles ages files out of /tmp, and a lock file removed while held would be recreated
# as a second inode that a second holder could lock. Only the tests move it, through this explicitly named variable.
COMPOSE_STATE_LOCK="${COMPOSE_STATE_LOCK_TEST_PATH:-/run/lock/lobster-compose-state.lock}"
COMPOSE_STATE_LOCK_BUSY=""

compose_state_lock() {
  local who="$1" wait="${2:-0}" inherited=0 deadline
  COMPOSE_STATE_LOCK_BUSY=""
  if [[ "/proc/$$/fd/217" -ef "$COMPOSE_STATE_LOCK" ]]; then
    inherited=1   # our parent's open file: locking it again is a no-op when the parent holds it
  elif ! { mkdir -p "$(dirname "$COMPOSE_STATE_LOCK")" && exec 217>>"$COMPOSE_STATE_LOCK"; } 2>/dev/null; then
    COMPOSE_STATE_LOCK_BUSY="cannot open $COMPOSE_STATE_LOCK"
    return 1
  fi
  # A loop of -n, not -w: busybox flock (the Alpine test containers) has no -w.
  deadline=$(( SECONDS + wait ))
  until flock -n 217; do
    if (( SECONDS >= deadline )); then
      COMPOSE_STATE_LOCK_BUSY="$(cat "$COMPOSE_STATE_LOCK.holder" 2>/dev/null || echo "unknown holder")"
      return 1
    fi
    sleep 1
  done
  if (( ! inherited )); then
    printf '%s (pid %s, since %s)\n' "$who" "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$COMPOSE_STATE_LOCK.holder" 2>/dev/null || true
  fi
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  [[ $# -ge 3 && "$2" =~ ^[0-9]+$ ]] || { echo "Usage: compose-state-lock.sh <who> <wait-seconds> <command...>" >&2; exit 2; }
  _who="$1"; _wait="$2"; shift 2
  if ! compose_state_lock "$_who" "$_wait"; then
    echo "compose-state-lock: not acquired in ${_wait}s -- held by: $COMPOSE_STATE_LOCK_BUSY" >&2
    exit 75
  fi
  exec "$@"
fi
