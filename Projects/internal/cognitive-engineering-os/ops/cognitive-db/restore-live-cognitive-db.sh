#!/usr/bin/env bash
# Put the LIVE cognitive_os database back to a dump taken earlier (deploy/lib-db.sh's rollback after a migration ran).
# The dump is restored into a scratch database first and checked; only then are the two swapped by rename, so a dump that
# does not restore leaves the live database untouched. The database it replaces is KEPT as cognitive_os_failed_<UTC stamp>
# (inert: connections off is undone so the nightly backup can read it) -- drop it by hand once inspected.
# Whoever calls this has already stopped every writer (deploy.sh stops the API first).
#
#   COGNITIVE_DB_CONTAINER=<id> bash restore-live-cognitive-db.sh /path/cognitive-db-<date>-<hex>-<run>.dump
#   (without COGNITIVE_DB_CONTAINER: the running service "cognitive-db" of compose project COGNITIVE_DB_PROJECT=cognitive-db)
set -euo pipefail
umask 077

DUMP="${1:?usage: restore-live-cognitive-db.sh <dump-file>}"
DB_USER="${COGNITIVE_DB_USER:-cognitive}"
DB="${COGNITIVE_DB_NAME:-cognitive_os}"
CONTAINER="${COGNITIVE_DB_CONTAINER:-}"
STAMP="$(date -u +%Y%m%dT%H%M%S)"
SCRATCH="${DB}_restoring_${STAMP}"
FAILED="${DB}_failed_${STAMP}"
SCRATCH_MADE=0
CLOSED=0
FAIL_REASON="restore failed"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
psql_admin() { docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }

cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    # Reopen the live database and drop only the scratch copy this run made; the live one was never renamed away.
    if (( CLOSED )); then psql_admin -c "ALTER DATABASE \"$DB\" ALLOW_CONNECTIONS true" >/dev/null 2>&1 || true; fi
    if (( SCRATCH_MADE )); then psql_admin -c "DROP DATABASE IF EXISTS \"$SCRATCH\" WITH (FORCE)" >/dev/null 2>&1 || true; fi
    printf 'RESTORE LIVE FAILED: %s (the live database %s was not replaced)\n' "$FAIL_REASON" "$DB" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

[ -s "$DUMP" ] || { FAIL_REASON="the dump file is missing or empty"; exit 1; }
if [ -z "$CONTAINER" ]; then
  CONTAINER="$(docker ps -q --filter "label=com.docker.compose.project=${COGNITIVE_DB_PROJECT:-cognitive-db}" --filter "label=com.docker.compose.service=cognitive-db" | head -n 1)"
fi
[ -n "$CONTAINER" ] || { FAIL_REASON="no running cognitive-db container"; exit 1; }

FAIL_REASON="pg_restore cannot read the dump"
docker exec -i "$CONTAINER" pg_restore --list <"$DUMP" >/dev/null

FAIL_REASON="could not restore the dump into a scratch database"
psql_admin -c "CREATE DATABASE \"$SCRATCH\"" >/dev/null
SCRATCH_MADE=1
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" --exit-on-error --no-owner --dbname="$SCRATCH" <"$DUMP"

FAIL_REASON="the restored database holds no migration ledger or no tables"
ledger="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$SCRATCH" -Atc 'SELECT count(*) FROM alembic_version')"
tables="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$SCRATCH" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
[ "$ledger" -ge 1 ] && [ "$tables" -ge 2 ] || exit 1

FAIL_REASON="could not close the live database for the swap"
psql_admin -c "ALTER DATABASE \"$DB\" ALLOW_CONNECTIONS false"
CLOSED=1
psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid()" >/dev/null

FAIL_REASON="the rename swap failed"
psql_admin -c "ALTER DATABASE \"$DB\" RENAME TO \"$FAILED\"; ALTER DATABASE \"$SCRATCH\" RENAME TO \"$DB\";"
SCRATCH_MADE=0
CLOSED=0
psql_admin -c "ALTER DATABASE \"$FAILED\" ALLOW_CONNECTIONS true"
log "RESTORE LIVE OK: $(basename -- "$DUMP") -> $DB; the replaced database is kept as $FAILED (drop it once inspected)"
