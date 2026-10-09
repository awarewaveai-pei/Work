# shellcheck shell=bash
# The database half of deploy.sh (sourced, never run): preflight, pre-deploy dump, the explicit migration, the smoke and the
# rollback that puts back the image AND the database. Kept in its own file so the local rehearsal can run exactly these
# functions against a throwaway stack. Needs from the caller: log, notify, PRODUCT_ROOT, COMPOSE_FILE, SERVICES (the API
# service first; its name is also its image name), LOG.
#
# Order in deploy.sh:  db_preflight -> (build) -> db_prepare -> up -> health -> smoke -> db_smoke ; any failure after
# db_prepare -> rollback_all. The engine never migrates by itself (STORAGE_SWITCH.md D2): db_prepare is the only place a
# migration runs, and only after the dump that rollback_all can restore.

DB_PROJECT="${COGNITIVE_DB_PROJECT:-cognitive-db}"
DB_USER=cognitive
DB_NAME=cognitive_os
ENV_FILE="${COS_ENV_FILE:-$PRODUCT_ROOT/deploy/.env}"
PREDEPLOY_BACKUP_DIR="${COS_PREDEPLOY_BACKUP_DIR:-$HOME/cos-predeploy-backups}"
DB_CONTAINER=""
MIGRATED=0            # a migration ran in this deploy: rollback must put the dump back
QUIESCED=0            # this deploy stopped the running API and web (db_prepare, a migration was pending)
NEW_UP=0              # deploy.sh started the new containers
PRE_DEPLOY_DUMP=""

compose_app() { docker compose -f "$COMPOSE_FILE" "$@"; }

# True only when compose answers AND lists no running container of the services: "the stop returned" is not proof.
services_stopped() {
  local running
  running="$(compose_app ps -q "${SERVICES[@]}")" || return 1
  [[ -z "$running" ]]
}

db_container() {
  docker ps -q --filter "label=com.docker.compose.project=$DB_PROJECT" --filter "label=com.docker.compose.service=cognitive-db" | head -n 1
}

# The previous API image can run on this compose only if it speaks PostgreSQL (the SQLite engine has no migrate_db).
image_speaks_postgres() {
  docker image inspect "$1" >/dev/null 2>&1 \
    && docker run --rm "$1" python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('ai_lego.apps.cli.migrate_db') else 1)" >/dev/null 2>&1
}

db_migrate_run() {
  compose_app run --rm --no-deps -T "${SERVICES[0]}" python -m ai_lego.apps.cli.migrate_db "$@"
}

db_preflight() {
  local line tenants
  line="$(grep -m1 '^COGNITIVE_OS_DATABASE_URLS=.' "$ENV_FILE" || true)"
  if [[ -z "$line" ]]; then
    log "db | FAIL: $ENV_FILE has no COGNITIVE_OS_DATABASE_URLS (docs/platform/GO_LIVE.md: install cognitive-db first)"
    return 1
  fi
  COGNITIVE_OS_REGION="${line#COGNITIVE_OS_DATABASE_URLS=}"
  COGNITIVE_OS_REGION="${COGNITIVE_OS_REGION%%=*}"
  unset line
  if [[ ! "$COGNITIVE_OS_REGION" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
    log "db | FAIL: the region name in COGNITIVE_OS_DATABASE_URLS is not lowercase letters, digits, '-'"
    return 1
  fi
  export COGNITIVE_OS_REGION   # docker-compose.yml names the per-region files volume with it
  DB_CONTAINER="$(db_container)"
  if [[ -z "$DB_CONTAINER" ]] || [[ "$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null)" != healthy ]]; then
    log "db | FAIL: the cognitive-db service (compose project $DB_PROJECT) is not running and healthy"
    return 1
  fi
  # A SQLite volume still on the host and no tenant in PostgreSQL = the data move has not happened: deploying now would
  # start an empty engine over a live site.
  if docker volume ls -q | grep -q 'cognitive-os-identity-data$' && [[ "${COS_ALLOW_EMPTY_DB:-0}" != 1 ]]; then
    tenants="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT count(*) FROM tenant' 2>/dev/null || echo unreadable)"
    if [[ "$tenants" == 0 || "$tenants" == unreadable ]]; then
      log "db | FAIL: the SQLite volume exists and PostgreSQL has no tenant ($tenants): run the data move first (GO_LIVE.md), or COS_ALLOW_EMPTY_DB=1 for a deliberate empty start"
      return 1
    fi
  fi
  log "db | preflight ok: region $COGNITIVE_OS_REGION, cognitive-db healthy"
}

# Pre-deploy dump through the cognitive-db backup script (host-side pg_dump streamed out of the container).
db_backup() {
  local before after
  mkdir -p "$PREDEPLOY_BACKUP_DIR"
  before="$(compgen -G "$PREDEPLOY_BACKUP_DIR/cognitive-db-????-??-??-*.dump" | sort || true)"
  COGNITIVE_DB_CONTAINER="$DB_CONTAINER" COGNITIVE_DB_BACKUP_DIR="$PREDEPLOY_BACKUP_DIR" bash "$PRODUCT_ROOT/ops/cognitive-db/backup-cognitive-db.sh" >>"$LOG" 2>&1 || return 1
  after="$(compgen -G "$PREDEPLOY_BACKUP_DIR/cognitive-db-????-??-??-*.dump" | sort || true)"
  PRE_DEPLOY_DUMP="$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | grep -- "-$(printf %s "$DB_NAME" | od -An -tx1 | tr -d '[:space:]')-" | tail -n 1 || true)"
  [[ -n "$PRE_DEPLOY_DUMP" ]] || return 1
  log "db | pre-deploy dump: $PRE_DEPLOY_DUMP"
}

# After the new image is built, before anything starts: dump, then migrate if the schema is behind. A pending migration
# first stops the API and web so nothing writes between the dump and the new schema (the dump is then the exact state to
# go back to); an up-to-date schema is dumped while running.
db_prepare() {
  local status=0
  db_migrate_run --check >>"$LOG" 2>&1 || status=$?
  case "$status" in
    0)
      log "db | schema at head: dump only"
      db_backup || { log "db | FAIL: pre-deploy dump"; return 1; }
      ;;
    1)
      log "db | migration pending: stopping ${SERVICES[*]}, dump, migrate"
      QUIESCED=1   # set first: even a half-failed stop leaves something for rollback_all to start again
      compose_app stop "${SERVICES[@]}" >>"$LOG" 2>&1 || true
      if ! services_stopped; then
        log "db | FAIL: ${SERVICES[*]} are not proven stopped; the database is untouched (no dump, no migration)"
        return 1
      fi
      db_backup || { log "db | FAIL: pre-deploy dump"; return 1; }
      db_migrate_run >>"$LOG" 2>&1 || { log "db | FAIL: migration (it runs in one transaction: the database is unchanged)"; return 1; }
      MIGRATED=1
      db_migrate_run --check >>"$LOG" 2>&1 || { log "db | FAIL: schema not at head after the migration"; return 1; }
      log "db | migrated to head"
      ;;
    *)
      log "db | FAIL: migrate_db --check could not read the database (exit $status; see $LOG)"
      return 1
      ;;
  esac
}

# In the running API container: its own URL, the network path and the schema head (/health is liveness only).
db_smoke() {
  compose_app exec -T "${SERVICES[0]}" python -m ai_lego.apps.cli.migrate_db --check >>"$LOG" 2>&1
}

# Image AND database back to what they were: stop the new containers (no writer), restore the dump if a migration ran,
# retag the previous images, start them. Returns 1 when it could not finish; the caller exits non-zero either way.
rollback_all() {
  local reason="$1" service
  log "rollback | $reason"
  if (( ! QUIESCED && ! NEW_UP )); then
    log "rollback | nothing was stopped or started yet: the previous containers are still running"
    notify "FAILED ($reason) -- nothing changed, previous containers still running"
    return 0
  fi
  notify "FAILED ($reason) -- rolling back"
  compose_app stop "${SERVICES[@]}" >>"$LOG" 2>&1 || true
  if (( MIGRATED )); then
    if ! services_stopped; then
      log "rollback | the new containers are not proven stopped: the dump is NOT restored over live writers"
      notify "ROLLBACK STOPPED: could not stop ${SERVICES[*]}, database left as migrated -- needs human (dump: $PRE_DEPLOY_DUMP)"
      return 1
    fi
    log "rollback | restoring the pre-deploy dump $PRE_DEPLOY_DUMP"
    if ! COGNITIVE_DB_CONTAINER="$DB_CONTAINER" bash "$PRODUCT_ROOT/ops/cognitive-db/restore-live-cognitive-db.sh" "$PRE_DEPLOY_DUMP" >>"$LOG" 2>&1; then
      log "rollback | database restore FAILED"
      notify "ROLLBACK FAILED: the migration ran and the database was not restored -- needs human (dump: $PRE_DEPLOY_DUMP)"
      return 1
    fi
  fi
  if ! image_speaks_postgres "${SERVICES[0]}:rollback"; then
    log "rollback | no previous API image that speaks PostgreSQL (the SQLite engine cannot run on this compose): the new containers stay stopped (GO_LIVE.md, Rollback)"
    notify "ROLLBACK STOPPED: no previous PostgreSQL-capable image -- follow GO_LIVE.md Rollback"
    return 1
  fi
  for service in "${SERVICES[@]}"; do
    if docker image inspect "$service:rollback" >/dev/null 2>&1; then
      docker tag "$service:rollback" "$service:latest"
    fi
  done
  compose_app up -d >>"$LOG" 2>&1 || { log "rollback | up -d FAILED"; notify "ROLLBACK FAILED: service is down, needs human"; return 1; }
  log "rollback | previous images running again"
}
