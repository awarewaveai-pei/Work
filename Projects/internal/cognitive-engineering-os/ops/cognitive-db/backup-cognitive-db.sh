#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP_DIR="${COGNITIVE_DB_BACKUP_DIR:-${BACKUP_DIR:-/root/backups/cognitive-db}}"
KEEP_DAYS="${COGNITIVE_DB_BACKUP_KEEP_DAYS:-${KEEP_DAYS:-7}}"   # 7: erased data lives at most this long in a dump (docs/platform/STORAGE_SWITCH.md "Physical retention decision")
DB_USER="${COGNITIVE_DB_USER:-cognitive}"
MAINTENANCE_DB="${COGNITIVE_DB_MAINTENANCE_DB:-cognitive_os}"
COMPOSE_FILE="${COGNITIVE_DB_COMPOSE_FILE:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/docker-compose.cognitive-db.yml}"
FAILURE_REASON="backup command failed"
ERROR_LOG="${TMPDIR:-/tmp}/cognitive-db-backup-${BASHPID}.log"
TEMP_FILES=()

cleanup() {
  local status=$?
  trap - EXIT
  for path in "${TEMP_FILES[@]}"; do
    rm -f -- "$path" >/dev/null 2>&1 || true
  done
  if (( status != 0 )); then
    printf 'BACKUP FAILED: %s\n' "$FAILURE_REASON" >&2
    if [ -s "$ERROR_LOG" ]; then
      printf 'backup error log (last 20 lines):\n' >&2
      tail -n 20 -- "$ERROR_LOG" >&2 || true
    fi
  fi
  rm -f -- "$ERROR_LOG" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

if ! touch "$ERROR_LOG" 2>/dev/null; then
  FAILURE_REASON="could not create the private error log"
  exit 1
fi
if ! [[ "$KEEP_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  FAILURE_REASON="COGNITIVE_DB_BACKUP_KEEP_DAYS must be a positive integer"
  exit 1
fi
if ! mkdir -p -- "$BACKUP_DIR" 2>"$ERROR_LOG"; then
  FAILURE_REASON="could not create the backup directory"
  exit 1
fi

if ! now_epoch="$(date -u +%s 2>"$ERROR_LOG")" || ! [[ "$now_epoch" =~ ^[0-9]+$ ]]; then
  FAILURE_REASON="could not determine the current time"
  exit 1
fi
if ! today="$(date -u +%F 2>"$ERROR_LOG")"; then
  FAILURE_REASON="could not determine the backup date"
  exit 1
fi
cutoff_epoch=$(( now_epoch - (KEEP_DAYS - 1) * 86400 ))
if ! cutoff_date="$(date -u -d "@$cutoff_epoch" +%F 2>"$ERROR_LOG")"; then
  FAILURE_REASON="could not determine the retention date"
  exit 1
fi
run_id="$(date -u +%H%M%S)-${BASHPID}"

# The production service is private: run PostgreSQL tools in its own container,
# stream archive bytes to the host backup directory, and never copy the secret out.
CONTAINER="${COGNITIVE_DB_CONTAINER:-}"
if [ -z "$CONTAINER" ]; then
  if ! CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q cognitive-db 2>"$ERROR_LOG")"; then
    FAILURE_REASON="could not find the cognitive-db service"
    exit 1
  fi
fi
if [ -z "$CONTAINER" ] || [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>"$ERROR_LOG")" != true ]; then
  FAILURE_REASON="cognitive-db is not running"
  exit 1
fi

validate_dump() {
  local dump=$1
  # A full read catches payload truncation that pg_restore --list can miss.
  if ! docker exec -i "$CONTAINER" pg_restore --exit-on-error -f /dev/null <"$dump" 2>"$ERROR_LOG"; then
    FAILURE_REASON="pg_restore could not fully read $(basename -- "$dump")"
    return 1
  fi
}

shopt -s nullglob
database_list="${TMPDIR:-/tmp}/cognitive-db-databases-${BASHPID}.list"
TEMP_FILES+=("$database_list")
if ! docker exec "$CONTAINER" psql -U "$DB_USER" --no-psqlrc --tuples-only --no-align --record-separator-zero \
  --dbname="$MAINTENANCE_DB" \
  --command='SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname;' \
  >"$database_list" 2>"$ERROR_LOG"; then
  FAILURE_REASON="could not list PostgreSQL databases"
  exit 1
fi

found_database=0
while IFS= read -r -d '' database; do
  [ -n "$database" ] || continue
  found_database=1
  # Hex is injective for all legal database names; replacing punctuation with '_' is not.
  safe_database="$(printf '%s' "$database" | od -An -tx1 | tr -d '[:space:]')"
  target="$BACKUP_DIR/cognitive-db-${today}-${safe_database}-${run_id}.dump"
  part="${target}.part"
  TEMP_FILES+=("$part")

  if ! docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc --dbname="$database" >"$part" 2>"$ERROR_LOG"; then
    FAILURE_REASON="pg_dump failed for ${safe_database}"
    exit 1
  fi
  if ! validate_dump "$part"; then
    exit 1
  fi
  if [ -e "$target" ] || ! mv -- "$part" "$target" 2>"$ERROR_LOG"; then
    FAILURE_REASON="could not publish ${safe_database} backup"
    exit 1
  fi
done < "$database_list"

if [ "$found_database" -ne 1 ]; then
  FAILURE_REASON="the cluster has no non-template databases"
  exit 1
fi

# Validate retained dumps only after the new dumps have been published. A corrupt
# old dump is quarantined and reported without blocking tonight's new backup.
corrupt_dumps=()
for dump in "$BACKUP_DIR"/cognitive-db-????-??-??-*.dump; do
  [ -f "$dump" ] || continue
  name="$(basename -- "$dump")"
  if ! validate_dump "$dump"; then
    if ! mv -- "$dump" "${dump}.corrupt" 2>"$ERROR_LOG"; then
      FAILURE_REASON="could not quarantine corrupt old dump ${name}"
      exit 1
    fi
    printf 'BACKUP WARNING: quarantined corrupt old dump %s\n' "$name" >&2
    corrupt_dumps+=("$name")
    continue
  fi
  if [[ "$name" =~ ^cognitive-db-([0-9]{4}-[0-9]{2}-[0-9]{2})-.*\.dump$ ]] && [[ "${BASH_REMATCH[1]}" < "$cutoff_date" ]]; then
    if ! rm -f -- "$dump" 2>"$ERROR_LOG"; then
      FAILURE_REASON="could not remove an expired dated dump"
      exit 1
    fi
  fi
done

# A quarantined dump holds the same data: it expires on the same date (Codex F1, 2026-10-10).
for quarantined in "$BACKUP_DIR"/cognitive-db-????-??-??-*.dump.corrupt; do
  [ -f "$quarantined" ] || continue
  name="$(basename -- "$quarantined")"
  if [[ "$name" =~ ^cognitive-db-([0-9]{4}-[0-9]{2}-[0-9]{2})-.*\.dump\.corrupt$ ]] && [[ "${BASH_REMATCH[1]}" < "$cutoff_date" ]]; then
    if ! rm -f -- "$quarantined" 2>"$ERROR_LOG"; then
      FAILURE_REASON="could not remove an expired quarantined dump"
      exit 1
    fi
  fi
done

if ((${#corrupt_dumps[@]} > 0)); then
  FAILURE_REASON="pg_restore rejected and quarantined corrupt old dump(s): ${corrupt_dumps[*]}"
  exit 1
fi
