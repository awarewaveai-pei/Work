#!/usr/bin/env bash
# sg-deploy.sh — sync source from /root/Work (git) to /root/lobster-phase1 (staging) and rebuild containers.
#
# Design:
#   - Single source of truth: /root/Work (git clone of monorepo).
#   - Staging: /root/lobster-phase1/  (holds machine-local docker-compose.yml, .env, nginx/, app build context).
#   - rsync from git -> staging/apps/<APP> with --exclude='.env*' so machine-local secrets stay put.
#   - Rebuild only the changed apps; up -d only those. No full-stack restart.
#   - Records `.deployed-commit` immediately after `docker compose up -d` succeeds, before the
#     healthcheck wait loop. This way a race-condition or healthcheck failure does NOT leave the
#     drift detector blind to what we just shipped.
#
# Usage:
#   sg-deploy.sh                 # deploy default apps (next-admin)
#   sg-deploy.sh next-admin      # deploy specific apps
#   sg-deploy.sh next-admin node-api wordpress
#   sg-deploy.sh --skip-pull     # skip git pull (use whatever is currently in /root/Work)
#   sg-deploy.sh --dry-run       # rsync -n; do not rebuild

set -euo pipefail

REPO_DIR="/root/Work"
STAGING_DIR="/root/lobster-phase1"
GIT_APPS_ROOT="$REPO_DIR/lobster-factory/infra/hetzner-phase1-core/apps"
LOG_DIR="$STAGING_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sg-deploy-$(date +%Y%m%d-%H%M%S).log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; exit 1; }

SKIP_PULL=0
DRY_RUN=0
APPS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull) SKIP_PULL=1; shift ;;
    --dry-run)   DRY_RUN=1; shift ;;
    -h|--help)
      sed -n '1,30p' "$0"
      exit 0
      ;;
    *) APPS+=("$1"); shift ;;
  esac
done

if [[ ${#APPS[@]} -eq 0 ]]; then
  APPS=(next-admin)
fi

log "=== sg-deploy starting ==="
log "apps: ${APPS[*]}"
log "skip-pull: $SKIP_PULL ; dry-run: $DRY_RUN"
log "log file: $LOG_FILE"

# 1. git pull
if [[ $SKIP_PULL -eq 0 ]]; then
  log "--- git pull ---"
  cd "$REPO_DIR"
  git fetch origin main 2>&1 | tee -a "$LOG_FILE"
  BEFORE=$(git rev-parse HEAD)
  git pull --ff-only origin main 2>&1 | tee -a "$LOG_FILE" || fail "git pull failed (non-FF? local edits in /root/Work?)"
  AFTER=$(git rev-parse HEAD)
  if [[ "$BEFORE" != "$AFTER" ]]; then
    log "git: $BEFORE -> $AFTER"
  else
    log "git: already up to date ($AFTER)"
  fi
fi

# 2. rsync each app
# 1.5. test gate — npm test before build, only for next-admin
if [[ " ${APPS[*]} " =~ " next-admin " && $DRY_RUN -eq 0 ]]; then
  TEST_DIR="$GIT_APPS_ROOT/next-admin"
  log "--- npm test gate (next-admin) ---"
  if [[ ! -d "$TEST_DIR/node_modules" ]]; then
    log "node_modules missing; running npm install --include=dev ..."
    npm --prefix "$TEST_DIR" install --include=dev 2>&1 | tee -a "$LOG_FILE" \
      || fail "npm install failed — cannot run test gate"
  fi
  npm --prefix "$TEST_DIR" test 2>&1 | tee -a "$LOG_FILE" \
    || fail "npm test FAILED — deploy aborted; fix tests before re-deploying next-admin"
  log "npm test passed"
fi

for APP in "${APPS[@]}"; do
  SRC="$GIT_APPS_ROOT/$APP/"
  DST="$STAGING_DIR/apps/$APP/"
  [[ -d "$SRC" ]] || fail "source not found: $SRC"
  [[ -d "$DST" ]] || fail "staging dest not found: $DST"

  log "--- rsync $APP ---"
  RSYNC_ARGS=(
    -av
    --delete
    --exclude='.env'
    --exclude='.env.local'
    --exclude='.env.*.local'
    --exclude='.next'
    --exclude='node_modules'
    --exclude='tsconfig.tsbuildinfo'
  )
  if [[ $DRY_RUN -eq 1 ]]; then
    RSYNC_ARGS+=(-n)
  fi
  rsync "${RSYNC_ARGS[@]}" "$SRC" "$DST" 2>&1 | tee -a "$LOG_FILE"
done

if [[ $DRY_RUN -eq 1 ]]; then
  log "DRY RUN complete; not rebuilding."
  exit 0
fi

# 3. build
cd "$STAGING_DIR"
log "--- docker compose build ${APPS[*]} ---"
docker compose build "${APPS[@]}" 2>&1 | tee -a "$LOG_FILE" || fail "docker build failed"

# 4. up -d (with race-condition retry)
log "--- docker compose up -d ${APPS[*]} ---"
UP_OUT=$(docker compose up -d "${APPS[@]}" 2>&1 | tee -a "$LOG_FILE" || true)
UP_STATUS=${PIPESTATUS[0]}
if [[ $UP_STATUS -ne 0 ]]; then
  if echo "$UP_OUT" | grep -q "removal of container .* is already in progress"; then
    log "race condition: previous container still being removed; cleaning + retrying"
    sleep 8
    docker compose stop "${APPS[@]}" 2>&1 | tee -a "$LOG_FILE" || true
    docker compose rm -f "${APPS[@]}" 2>&1 | tee -a "$LOG_FILE" || true
    docker compose up -d "${APPS[@]}" 2>&1 | tee -a "$LOG_FILE" || fail "docker up failed after retry"
  else
    fail "docker up failed"
  fi
fi

# 5. record deployed commit IMMEDIATELY after successful up (before healthcheck wait).
#    This way drift detector knows what we shipped even if healthcheck flakes.
echo "$(git -C "$REPO_DIR" rev-parse HEAD)" > "$STAGING_DIR/.deployed-commit"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGING_DIR/.deployed-at"
log "wrote .deployed-commit = $(cat "$STAGING_DIR/.deployed-commit")"

# 6. wait for healthy (informational; does not invalidate the .deployed-commit record)
for APP in "${APPS[@]}"; do
  CONTAINER="lobster-$APP"
  log "--- waiting for $CONTAINER healthy ---"
  for i in $(seq 1 60); do
    STATUS=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "no-healthcheck")
    if [[ "$STATUS" == "healthy" ]]; then
      log "$CONTAINER healthy after ${i}s"; break
    fi
    if [[ "$STATUS" == "no-healthcheck" ]]; then
      log "$CONTAINER no healthcheck defined; assuming OK"; break
    fi
    if [[ "$STATUS" == "unhealthy" ]]; then
      fail "$CONTAINER unhealthy"
    fi
    sleep 1
    [[ $i -eq 60 ]] && fail "$CONTAINER did not become healthy in 60s (status=$STATUS)"
  done
done


# 7. HTTP smoke check — verifies HTTP layer after container health gate.
#    Non-fatal: SMOKE_WARN logged + .smoke-warn flag written; does NOT exit non-zero.
#    Endpoints confirmed reachable from localhost 2026-05-21.
_smoke_errors=0
_smoke_check() {
  local label="$1" url="$2"
  local http
  http=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [[ "$http" =~ ^2 ]]; then log "  smoke OK: $label -> $http"
  else log "  SMOKE_WARN: $label -> $http"; _smoke_errors=$((_smoke_errors + 1)); fi
}
log "--- HTTP smoke check ---"
_smoke_check "next-admin"                  "http://127.0.0.1:3002/"
_smoke_check "next-admin /api/ops/summary" "http://127.0.0.1:3002/api/ops/summary"
_smoke_check "nginx/wordpress"             "http://127.0.0.1/"
_na_http=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" \
  -H "Host: api.aware-wave.com" "http://127.0.0.1/api/health" 2>/dev/null || echo "000")
if [[ "$_na_http" =~ ^2 ]]; then log "  smoke OK: node-api health -> $_na_http"
else log "  SMOKE_WARN: node-api health -> $_na_http"; _smoke_errors=$((_smoke_errors + 1)); fi

if [[ "$_smoke_errors" -gt 0 ]]; then
  log "SMOKE_WARN: $_smoke_errors endpoint(s) returned non-2xx -- service may be partially degraded"
  printf '%s|%s\n' "$_smoke_errors" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGING_DIR/.smoke-warn"
else
  log "smoke: all endpoints OK"
  rm -f "$STAGING_DIR/.smoke-warn"
fi

log "=== sg-deploy complete ==="
log "deployed commit: $(cat "$STAGING_DIR/.deployed-commit")"
log "deployed at:     $(cat "$STAGING_DIR/.deployed-at")"
