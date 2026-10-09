#!/usr/bin/env bash
# Governed installer for the separate cognitive-db compose project (STORAGE_SWITCH.md D8). safe-infra-patch.sh patches
# the main compose at /root/lobster-phase1 only, so this project has its own governed path:
#   preflight -> create volume + service -> wait healthy -> migrate the EMPTY database to head (engine image) ->
#   backup once -> restore-rehearse that dump into a throwaway container -> notify.
# Any failure after the first create rolls back what THIS run created and nothing else: the project's containers and its
# volume, the dumps it wrote, the COGNITIVE_OS_DATABASE_URLS line it appended. A volume that already exists is never touched:
# preflight refuses instead. A password is never printed, passed as an argument, or written anywhere but the 0600 files below.
#
#   COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password \
#     COGNITIVE_DB_ENGINE_IMAGE=cognitive-os-api:golive \
#     bash install-cognitive-db.sh --region eu [--dry-run]
#
# Needs (HIGH-STOP: an operator go-ahead first, AGENTS.md section 3): the password file (0600/0400, 24+ chars of A-Za-z0-9._~-
# so it can sit in a URL unescaped, outside any git work tree), the external network, an engine image that holds
# ai_lego.apps.cli.migrate_db, and --region (the first region name) unless the engine env file already has the URL line.
# Environment: COGNITIVE_DB_PROJECT (cognitive-db), COGNITIVE_DB_NETWORK (lobster-net), COGNITIVE_DB_BACKUP_DIR
# (/root/backups/cognitive-db), COGNITIVE_DB_ENGINE_ENV_FILE (<product>/deploy/.env), COGNITIVE_OS_SLACK_WEBHOOK (optional).
# --dry-run runs the read-only preflight for real, then prints every command it would run and runs none of them.
set -euo pipefail
umask 077

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PRODUCT_ROOT="$(cd -- "$HERE/../.." && pwd)"
export COGNITIVE_DB_COMPOSE_FILE="${COGNITIVE_DB_COMPOSE_FILE:-$HERE/docker-compose.cognitive-db.yml}"
export COMPOSE_PROJECT_NAME="${COGNITIVE_DB_PROJECT:-cognitive-db}"
export COGNITIVE_DB_NETWORK="${COGNITIVE_DB_NETWORK:-lobster-net}"
export COGNITIVE_DB_BACKUP_DIR="${COGNITIVE_DB_BACKUP_DIR:-/root/backups/cognitive-db}"
export COGNITIVE_DB_PASSWORD_FILE="${COGNITIVE_DB_PASSWORD_FILE:-}"
IMAGE="${COGNITIVE_DB_ENGINE_IMAGE:-cognitive-os-api:latest}"
ENGINE_ENV_FILE="${COGNITIVE_DB_ENGINE_ENV_FILE:-$PRODUCT_ROOT/deploy/.env}"
REGION="${COGNITIVE_DB_REGION:-}"
WEBHOOK="${COGNITIVE_OS_SLACK_WEBHOOK:-}"
DB_USER=cognitive
DB_NAME=cognitive_os
DB_HOST=cognitive-db
URL_VAR=COGNITIVE_OS_DATABASE_URLS
DRY_RUN=0

while (( $# > 0 )); do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --region) REGION="${2:?--region needs a name}"; shift ;;
    -h|--help) sed -n '2,19p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

VOLUME="${COMPOSE_PROJECT_NAME}_cognitive-db-data"
RESTORE_NAME="${COMPOSE_PROJECT_NAME}-restore-rehearsal"
CREATED=0              # the compose project was brought up by this run
ADDED_ENV_LINE=0       # this run appended the URL line to the engine env file
CREATED_ENV_FILE=0     # ... and created that file
ENV_TMP=""
NEW_DUMPS=()
FAIL_REASON="installer failed"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
notify() {
  log "notify | $*"
  local msg="${*//\\/\\\\}"
  msg="${msg//\"/\\\"}"
  [[ -n "$WEBHOOK" ]] && curl -s -X POST -H 'Content-type: application/json' --data "{\"text\":\"cognitive-db install: $msg\"}" "$WEBHOOK" >/dev/null || true
}
refuse() { FAIL_REASON="$*"; log "REFUSED: $*"; exit 2; }

# Every state-changing command goes through run: printed in a dry run, executed otherwise.
run() {
  if (( DRY_RUN )); then
    printf '+ (dry-run)'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}
compose() { docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COGNITIVE_DB_COMPOSE_FILE" "$@"; }

remove_env_line() {
  local keep
  keep="$(mktemp)"
  grep -v "^${URL_VAR}=" "$ENGINE_ENV_FILE" >"$keep" || true
  if (( CREATED_ENV_FILE )) && [ ! -s "$keep" ]; then rm -f -- "$ENGINE_ENV_FILE"; else cat -- "$keep" >"$ENGINE_ENV_FILE"; fi
  rm -f -- "$keep"
}

rollback() {
  log "rollback: removing only what this run created"
  docker rm -f "$RESTORE_NAME" >/dev/null 2>&1 || true
  if (( CREATED )); then
    compose down --volumes >/dev/null 2>&1 || log "rollback WARNING: 'compose down --volumes' failed; remove project $COMPOSE_PROJECT_NAME and volume $VOLUME by hand"
  fi
  local dump
  for dump in "${NEW_DUMPS[@]}"; do rm -f -- "$dump"; done
  if (( ADDED_ENV_LINE )); then remove_env_line; fi
}

on_exit() {
  local status=$?
  trap - EXIT
  [ -z "$ENV_TMP" ] || rm -f -- "$ENV_TMP"
  if (( status != 0 && DRY_RUN == 0 && CREATED == 1 )); then
    rollback
    notify "FAILED and rolled back: $FAIL_REASON"
  elif (( status != 0 )); then
    log "FAILED before anything was created: $FAIL_REASON"
  fi
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT TERM

# -- 1. Preflight: read-only, real even in a dry run -------------------------------------------------------------------
log "step 1/6 preflight"
for tool in docker curl; do command -v "$tool" >/dev/null 2>&1 || refuse "$tool is not installed"; done
docker compose version >/dev/null 2>&1 || refuse "docker compose (v2) is not available"
[ -n "$COGNITIVE_DB_PASSWORD_FILE" ] || refuse "COGNITIVE_DB_PASSWORD_FILE is not set"
[ -f "$COGNITIVE_DB_PASSWORD_FILE" ] && [ -s "$COGNITIVE_DB_PASSWORD_FILE" ] || refuse "the password file is missing or empty"
case "$(stat -c %a -- "$COGNITIVE_DB_PASSWORD_FILE")" in 400|600) ;; *) refuse "the password file must be mode 600 or 400 (chmod 600)" ;; esac
PASSWORD="$(tr -d '\r\n' <"$COGNITIVE_DB_PASSWORD_FILE")"
[[ "$PASSWORD" =~ ^[A-Za-z0-9._~-]{24,}$ ]] || refuse "the password must be 24+ characters of A-Za-z0-9._~- (it goes into a URL unescaped); openssl rand -hex 24 makes one"
password_dir="$(cd -- "$(dirname -- "$COGNITIVE_DB_PASSWORD_FILE")" && pwd -P)"
if command -v git >/dev/null 2>&1 && git -C "$password_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  refuse "the password file sits inside a git work tree ($password_dir): secrets never live where git can see them"
fi
docker network inspect "$COGNITIVE_DB_NETWORK" >/dev/null 2>&1 || refuse "docker network $COGNITIVE_DB_NETWORK does not exist"
! docker volume inspect "$VOLUME" >/dev/null 2>&1 || refuse "volume $VOLUME already exists: this installer fills a new volume only and never touches one that may hold data"
[ -z "$(compose ps -aq 2>/dev/null)" ] || refuse "project $COMPOSE_PROJECT_NAME already has containers"
compose config -q 2>/dev/null || refuse "the compose file does not validate ($COGNITIVE_DB_COMPOSE_FILE)"
docker image inspect "$IMAGE" >/dev/null 2>&1 || refuse "engine image $IMAGE is not on this host: build the new engine image first (GO_LIVE.md)"
HEAD_REVISION="$(docker run --rm --network none "$IMAGE" python -m ai_lego.apps.cli.migrate_db --head 2>/dev/null)" \
  || refuse "image $IMAGE has no ai_lego.apps.cli.migrate_db: it is the old engine; build the new image first"
if [ -f "$ENGINE_ENV_FILE" ] && grep -q "^${URL_VAR}=." "$ENGINE_ENV_FILE"; then
  ENV_LINE_PRESENT=1
  existing_region="$(sed -n "s/^${URL_VAR}=\\([^=,]*\\)=.*/\\1/p" "$ENGINE_ENV_FILE" | head -n 1)"
  [ -z "$REGION" ] || [ "$REGION" = "$existing_region" ] || refuse "--region $REGION differs from the region in $ENGINE_ENV_FILE"
  grep -q "^${URL_VAR}=.*@${DB_HOST}:5432/${DB_NAME}\$" "$ENGINE_ENV_FILE" || refuse "$ENGINE_ENV_FILE holds a $URL_VAR that does not point at ${DB_HOST}:5432/${DB_NAME}"
else
  ENV_LINE_PRESENT=0
  [[ "$REGION" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || refuse "--region is required (lowercase letters, digits, '-'): $ENGINE_ENV_FILE has no $URL_VAR yet"
fi
db_hex="$(printf %s "$DB_NAME" | od -An -tx1 | tr -d '[:space:]')"
dump_glob="$COGNITIVE_DB_BACKUP_DIR/cognitive-db-????-??-??-*.dump"
list_dumps() { compgen -G "$dump_glob" | sort || true; }
before_dumps="$(list_dumps)"
log "preflight ok: project $COMPOSE_PROJECT_NAME, network $COGNITIVE_DB_NETWORK, engine image $IMAGE (head $HEAD_REVISION), dry-run=$DRY_RUN"

# -- 2. Create ----------------------------------------------------------------------------------------------------------
log "step 2/6 create the volume and the service"
FAIL_REASON="could not create the service"
if (( ! DRY_RUN )); then CREATED=1; fi
run docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COGNITIVE_DB_COMPOSE_FILE" up -d

# -- 3. Healthy ---------------------------------------------------------------------------------------------------------
log "step 3/6 wait for pg_isready"
FAIL_REASON="cognitive-db did not become healthy in 120 s"
if (( DRY_RUN )); then
  printf '+ (dry-run) poll docker inspect {{.State.Health.Status}} of the %s container every 2 s, up to 120 s, until healthy\n' "$DB_HOST"
  CONTAINER="<container-of-$DB_HOST>"
else
  CONTAINER="$(compose ps -q "$DB_HOST")"
  [ -n "$CONTAINER" ] || { FAIL_REASON="the service has no container"; exit 1; }
  status=""
  for _ in $(seq 1 60); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || true)"
    [ "$status" = healthy ] && break
    sleep 2
  done
  [ "$status" = healthy ] || exit 1
fi
run docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME"

# -- 4. Migrate the empty database to head ------------------------------------------------------------------------------
log "step 4/6 migrate the EMPTY database to head ($HEAD_REVISION)"
FAIL_REASON="the database was not empty or the migration failed"
if (( DRY_RUN )); then
  printf '+ (dry-run) docker exec %s psql -U %s -d %s -Atc <count of public tables; it must be 0>\n' "$CONTAINER" "$DB_USER" "$DB_NAME"
else
  tables="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
  [ "$tables" = 0 ] || { FAIL_REASON="the new database already holds $tables table(s)"; exit 1; }
fi
if (( ENV_LINE_PRESENT == 0 )); then
  if (( DRY_RUN )); then
    log "(dry-run) would append ${URL_VAR}=${REGION}=postgresql://${DB_USER}:<password>@${DB_HOST}:5432/${DB_NAME} to $ENGINE_ENV_FILE (the password file's content; never printed)"
  else
    [ -f "$ENGINE_ENV_FILE" ] || { : >"$ENGINE_ENV_FILE"; CREATED_ENV_FILE=1; }
    ADDED_ENV_LINE=1
    if [ -s "$ENGINE_ENV_FILE" ] && [ -n "$(tail -c 1 "$ENGINE_ENV_FILE")" ]; then printf '\n' >>"$ENGINE_ENV_FILE"; fi
    printf '%s=%s=postgresql://%s:%s@%s:5432/%s\n' "$URL_VAR" "$REGION" "$DB_USER" "$PASSWORD" "$DB_HOST" "$DB_NAME" >>"$ENGINE_ENV_FILE"
  fi
fi
if (( DRY_RUN )); then
  ENV_TMP_NAME="<temp file holding only the $URL_VAR line>"
else
  ENV_TMP="$(mktemp)"
  grep "^${URL_VAR}=" "$ENGINE_ENV_FILE" >"$ENV_TMP"
  ENV_TMP_NAME="$ENV_TMP"
fi
run docker run --rm --network "$COGNITIVE_DB_NETWORK" --env-file "$ENV_TMP_NAME" "$IMAGE" python -m ai_lego.apps.cli.migrate_db
run docker run --rm --network "$COGNITIVE_DB_NETWORK" --env-file "$ENV_TMP_NAME" "$IMAGE" python -m ai_lego.apps.cli.migrate_db --check

# -- 5. Backup once -----------------------------------------------------------------------------------------------------
log "step 5/6 backup once (backup-cognitive-db.sh)"
FAIL_REASON="the first backup failed"
run bash "$HERE/backup-cognitive-db.sh"
DUMP="<the new $DB_NAME dump>"
if (( ! DRY_RUN )); then
  while IFS= read -r path; do NEW_DUMPS+=("$path"); done < <(comm -13 <(printf '%s\n' "$before_dumps") <(list_dumps))
  DUMP=""
  for path in "${NEW_DUMPS[@]}"; do
    case "$path" in *"-${db_hex}-"*) DUMP="$path" ;; esac
  done
  [ -n "$DUMP" ] || exit 1
fi

# -- 6. Restore rehearsal -----------------------------------------------------------------------------------------------
log "step 6/6 restore rehearsal into a throwaway container (restore-cognitive-db.sh)"
FAIL_REASON="the restore rehearsal failed"
run env COGNITIVE_DB_DUMP_FILE="$DUMP" COGNITIVE_DB_RESTORE_CONTAINER="$RESTORE_NAME" COGNITIVE_DB_RESTORE_EXPECT_REVISION="$HEAD_REVISION" bash "$HERE/restore-cognitive-db.sh"

if (( DRY_RUN )); then
  log "DRY RUN OK: nothing was created, written or removed"
else
  notify "installed: project $COMPOSE_PROJECT_NAME, database at $HEAD_REVISION, first backup restored into a throwaway container"
  log "OK. Next: the nightly cron line (README.md), then the engine deploy (docs/platform/GO_LIVE.md). Dump kept: $DUMP"
fi
