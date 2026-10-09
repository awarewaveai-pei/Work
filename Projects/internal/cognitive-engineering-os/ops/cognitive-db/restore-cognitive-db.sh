#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${COGNITIVE_DB_PASSWORD_FILE:?COGNITIVE_DB_PASSWORD_FILE must be set}"
: "${COGNITIVE_DB_DUMP_FILE:?COGNITIVE_DB_DUMP_FILE must be set}"

IMAGE="${COGNITIVE_DB_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24}"
CONTAINER="${COGNITIVE_DB_RESTORE_CONTAINER:-cognitive-db-restore-drill}"
USER="${COGNITIVE_DB_RESTORE_USER:-cognitive}"
DATABASE="${COGNITIVE_DB_RESTORE_DATABASE:-cognitive_os}"
TARGET_DATABASE="${COGNITIVE_DB_RESTORE_TARGET_DATABASE:-restore_check}"

cleanup() {
  local status=$?
  trap - EXIT
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

test -s "$COGNITIVE_DB_PASSWORD_FILE"
test -s "$COGNITIVE_DB_DUMP_FILE"
docker run -d --rm --name "$CONTAINER" --network none \
  -e "POSTGRES_USER=$USER" \
  -e "POSTGRES_DB=$DATABASE" \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/cognitive_db_password \
  --mount "type=bind,source=$COGNITIVE_DB_PASSWORD_FILE,target=/run/secrets/cognitive_db_password,readonly" \
  "$IMAGE" >/dev/null

# A container that died never answers; fail instead of waiting forever.
for _ in $(seq 1 90); do
  docker exec "$CONTAINER" pg_isready -U "$USER" -d "$DATABASE" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U "$USER" -d "$DATABASE" >/dev/null
docker exec "$CONTAINER" createdb -U "$USER" "$TARGET_DATABASE"
docker cp "$COGNITIVE_DB_DUMP_FILE" "$CONTAINER:/tmp/restore.dump"
docker exec "$CONTAINER" pg_restore -U "$USER" --exit-on-error --no-owner --dbname="$TARGET_DATABASE" /tmp/restore.dump
docker exec "$CONTAINER" psql -U "$USER" -d "$TARGET_DATABASE" -At -c 'SELECT 1' | grep -qx '1'
# The dump of a migrated database must bring the migration ledger back: the revision(s) the caller expects, exactly.
if [ -n "${COGNITIVE_DB_RESTORE_EXPECT_REVISION:-}" ]; then
  restored="$(docker exec "$CONTAINER" psql -U "$USER" -d "$TARGET_DATABASE" -At -c 'SELECT version_num FROM alembic_version ORDER BY 1' | paste -sd, -)"
  if [ "$restored" != "$COGNITIVE_DB_RESTORE_EXPECT_REVISION" ]; then
    printf 'RESTORE FAILED: restored revision [%s], expected [%s]\n' "$restored" "$COGNITIVE_DB_RESTORE_EXPECT_REVISION" >&2
    exit 1
  fi
fi
printf 'RESTORE OK: %s -> %s\n' "$(basename -- "$COGNITIVE_DB_DUMP_FILE")" "$TARGET_DATABASE"
