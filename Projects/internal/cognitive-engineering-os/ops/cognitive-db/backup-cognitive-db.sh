#!/usr/bin/env bash
set -euo pipefail

# The service account supplies the connection through standard PostgreSQL PG* variables.
BACKUP_DIR="${COGNITIVE_DB_BACKUP_DIR:-${BACKUP_DIR:-/root/backups/cognitive-db}}"
KEEP_DAYS="${COGNITIVE_DB_BACKUP_KEEP_DAYS:-${KEEP_DAYS:-14}}"
MIN_OBJECTS="${COGNITIVE_DB_BACKUP_MIN_OBJECTS:-${MIN_OBJECTS:-1}}"
FAILURE_REASON="backup command failed"
ERROR_LOG="${TMPDIR:-/tmp}/cognitive-db-backup-${BASHPID}.log"
TEMP_FILES=()

cleanup() {
  local status=$?
  trap - EXIT
  for path in "${TEMP_FILES[@]}"; do
    rm -f -- "$path" >/dev/null 2>&1 || true
  done
  rm -f -- "$ERROR_LOG" >/dev/null 2>&1 || true
  if (( status != 0 )); then
    printf 'BACKUP FAILED: %s\n' "$FAILURE_REASON" >&2
  fi
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
if ! [[ "$MIN_OBJECTS" =~ ^[1-9][0-9]*$ ]]; then
  FAILURE_REASON="COGNITIVE_DB_BACKUP_MIN_OBJECTS must be a positive integer"
  exit 1
fi
if ! mkdir -p -- "$BACKUP_DIR" 2>"$ERROR_LOG"; then
  FAILURE_REASON="could not create the backup directory"
  exit 1
fi

if ! today="$(date -u +%F 2>"$ERROR_LOG")"; then
  FAILURE_REASON="could not determine the backup date"
  exit 1
fi
if ! cutoff_date="$(date -u -d "$today - $KEEP_DAYS days" +%F 2>"$ERROR_LOG")"; then
  if ! cutoff_date="$(date -u -d "-$KEEP_DAYS days" +%F 2>"$ERROR_LOG")"; then
    FAILURE_REASON="could not determine the retention date"
    exit 1
  fi
fi

validate_dump() {
  local dump=$1
  local listing
  local object_count

  # A retained corrupt archive is a backup failure, not something rotation may hide.
  if ! listing="$(pg_restore --list "$dump" 2>"$ERROR_LOG")"; then
    FAILURE_REASON="pg_restore could not list $(basename -- "$dump")"
    return 1
  fi
  object_count="$(printf '%s\n' "$listing" | awk '/^[[:space:]]*[0-9]+;/{count++} END {print count+0}')"
  if [ "$object_count" -lt "$MIN_OBJECTS" ]; then
    FAILURE_REASON="$(basename -- "$dump") has too few archive objects"
    return 1
  fi
}

shopt -s nullglob
for dump in "$BACKUP_DIR"/cognitive-db-????-??-??-*.dump; do
  [ -f "$dump" ] || continue
  if ! validate_dump "$dump"; then
    exit 1
  fi
done

if ! database_list="$(psql --no-psqlrc --tuples-only --no-align \
  --dbname="${PGDATABASE:-postgres}" \
  --command='SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname;' \
  2>"$ERROR_LOG")"; then
  FAILURE_REASON="could not list PostgreSQL databases"
  exit 1
fi

found_database=0
while IFS= read -r database; do
  [ -n "$database" ] || continue
  found_database=1
  safe_database="$(printf '%s' "$database" | tr -c 'A-Za-z0-9_.-' '_')"
  target="$BACKUP_DIR/cognitive-db-${today}-${safe_database}.dump"
  part="${target}.${BASHPID}.part"
  TEMP_FILES+=("$part")

  if ! pg_dump -Fc --file="$part" "$database" 2>"$ERROR_LOG"; then
    FAILURE_REASON="pg_dump failed for ${safe_database}"
    exit 1
  fi
  if ! validate_dump "$part"; then
    exit 1
  fi
  if ! mv -f -- "$part" "$target" 2>"$ERROR_LOG"; then
    FAILURE_REASON="could not publish ${safe_database} backup"
    exit 1
  fi
done <<< "$database_list"

if [ "$found_database" -ne 1 ]; then
  FAILURE_REASON="the cluster has no non-template databases"
  exit 1
fi

# This glob is the deletion boundary: only our dated custom-format dumps can be removed.
for dump in "$BACKUP_DIR"/cognitive-db-????-??-??-*.dump; do
  [ -f "$dump" ] || continue
  name="$(basename -- "$dump")"
  if [[ "$name" =~ ^cognitive-db-([0-9]{4}-[0-9]{2}-[0-9]{2})-.*\.dump$ ]] && [[ "${BASH_REMATCH[1]}" < "$cutoff_date" ]]; then
    if ! rm -f -- "$dump" 2>"$ERROR_LOG"; then
      FAILURE_REASON="could not remove an expired dated dump"
      exit 1
    fi
  fi
done
