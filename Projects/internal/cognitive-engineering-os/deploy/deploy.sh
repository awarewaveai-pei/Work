#!/usr/bin/env bash
# Cognitive OS Phase 1 API -- deploy script for ks-aw-01. Satisfies AGENTS.md's 6-item new-
# deployable-service checklist: test gate -> healthcheck -> smoke -> rollback -> notification ->
# typecheck. Run FROM THE MONOREPO ROOT on the target host (matches this repo's own
# resolve_spec_root() layout expectation -- see ai_lego/__init__.py).
#
# Usage: bash Projects/internal/cognitive-engineering-os/deploy/deploy.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PRODUCT_ROOT="$REPO_ROOT/Projects/internal/cognitive-engineering-os"
COMPOSE_FILE="$PRODUCT_ROOT/docker-compose.yml"
SERVICE="cognitive-os-api"
HEALTH_URL="http://127.0.0.1:8420/health"
SMOKE_URL="https://cognitive.aware-wave.com/health"
LOG="$PRODUCT_ROOT/deploy/deploy.log"
SLACK_WEBHOOK="${COGNITIVE_OS_SLACK_WEBHOOK:-}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }
notify() {
  log "notify | $*"
  local msg="$*"
  msg="${msg//\\/\\\\}"   # escape backslashes first
  msg="${msg//\"/\\\"}"   # then quotes
  [[ -n "$SLACK_WEBHOOK" ]] && curl -s -X POST -H 'Content-type: application/json' --data "{\"text\":\"cognitive-os-api deploy: $msg\"}" "$SLACK_WEBHOOK" >/dev/null || true
}

cd "$REPO_ROOT"

# -- 1. Typecheck substitute (Python has no tsc; the closest real equivalent is "does every
#    module even import cleanly" -- catches syntax errors and import-time exceptions before
#    they'd otherwise only surface at request time inside the container). --
log "typecheck | importing every ai_lego.apps.api / ai_lego.platform.identity / ai_lego.platform.entitlement module"
( cd "$PRODUCT_ROOT" && python3 -c "
import importlib
for mod in ['ai_lego.apps.api.main', 'ai_lego.apps.api.dispatch', 'ai_lego.platform.identity.store', 'ai_lego.platform.entitlement.check', 'ai_lego.core.domain.identity', 'ai_lego.core.domain.workspace']:
    importlib.import_module(mod)
print('OK: all modules import cleanly')
" ) || { log "typecheck | FAIL"; notify "FAILED at typecheck (import sanity)"; exit 1; }

# -- 2. Test gate -- Phase 1 API-surface test files (the ~260 other tests/unit/* files are
#    Method Atlas method-implementation tests, covered by their own CI path, not re-run here). --
log "test-gate | running pytest for the Phase 1 test files"
( cd "$PRODUCT_ROOT" && python3 -m pytest tests/unit/test_workspace_domain.py tests/unit/test_identity_domain.py tests/unit/test_identity_store.py tests/unit/test_entitlement_check.py tests/unit/test_api_dispatch.py tests/unit/test_api_main.py tests/unit/test_authenticate_timing.py -q ) \
  || { log "test-gate | FAIL"; notify "FAILED at test gate"; exit 1; }

# -- Tag the currently-running image as :rollback BEFORE building the new one, so a failed
#    deploy can restore the last-known-good image (mirrors oracle-web's own rollback recipe). --
if docker image inspect cognitive-os-api:latest >/dev/null 2>&1; then
  docker tag cognitive-os-api:latest cognitive-os-api:rollback
  log "rollback-tag | tagged current cognitive-os-api:latest as :rollback"
fi

# -- 3. Build + up. --
log "build | docker compose build"
docker compose -f "$COMPOSE_FILE" build || { log "build | FAIL"; notify "FAILED at build"; exit 1; }
log "up | docker compose up -d"
docker compose -f "$COMPOSE_FILE" up -d || { log "up | FAIL"; notify "FAILED at docker compose up -d"; exit 1; }

# -- 4. Healthcheck: wait for the container's own HEALTHCHECK to report healthy. Ceiling is
#    120s, comfortably clearing two of compose.yml's 30s healthcheck intervals (Docker's first
#    probe fires at t=~30s, not t=0) so ordinary cold-start variance doesn't trigger a false
#    rollback. --
log "healthcheck | waiting up to 120s for $SERVICE to report healthy"
elapsed=0
while true; do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$SERVICE" 2>/dev/null || echo "unknown")"
  [[ "$status" == "healthy" ]] && break
  if [[ "$elapsed" -ge 120 ]]; then
    log "healthcheck | FAIL | last status=$status"
    notify "FAILED healthcheck (status=$status) -- rolling back"
    if docker image inspect cognitive-os-api:rollback >/dev/null 2>&1; then
      docker tag cognitive-os-api:rollback cognitive-os-api:latest
      docker compose -f "$COMPOSE_FILE" up -d || { log "rollback | up -d FAILED"; notify "ROLLBACK FAILED: docker compose up -d errored -- service is down, needs human"; exit 1; }
      rb_elapsed=0
      while true; do
        rb_status="$(docker inspect --format='{{.State.Health.Status}}' "$SERVICE" 2>/dev/null || echo "unknown")"
        [[ "$rb_status" == "healthy" ]] && { log "rollback | restored image is healthy after ${rb_elapsed}s"; notify "rolled back to previous image, confirmed healthy"; break; }
        if [[ "$rb_elapsed" -ge 30 ]]; then
          log "rollback | restored image did NOT become healthy (status=$rb_status)"
          notify "ROLLBACK DID NOT HEAL: restored :rollback image but it is not healthy either (status=$rb_status) -- service may be down, needs human"
          break
        fi
        sleep 3
        rb_elapsed=$((rb_elapsed + 3))
      done
    else
      log "rollback | no :rollback image exists (first deploy) -- stopping the unhealthy container instead of leaving it crash-looping"
      docker compose -f "$COMPOSE_FILE" down || true
      notify "first deploy failed healthcheck, no rollback image available -- stopped the service"
    fi
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
log "healthcheck | healthy after ${elapsed}s"

# -- 5. Smoke test -- local container port first (works even before DNS/nginx are wired up),
#    then the real public domain if it resolves (skipped, not failed, if it doesn't yet -- DNS
#    propagation and nginx wiring are separate steps in the deploy runbook). --
log "smoke | local: curl $HEALTH_URL"
curl -sf "$HEALTH_URL" | grep -q '"status":"ok"' || { log "smoke | local FAIL"; notify "FAILED local smoke test"; exit 1; }
log "smoke | local: PASS"

if getent hosts cognitive.aware-wave.com >/dev/null 2>&1; then
  log "smoke | public: curl $SMOKE_URL"
  if curl -sf "$SMOKE_URL" | grep -q '"status":"ok"'; then
    log "smoke | public: PASS"
  else
    log "smoke | public: FAIL (DNS resolves but request failed -- check nginx wiring, TLS cert SAN, firewall)"
    notify "WARNING: local smoke passed but public smoke failed -- check nginx/TLS wiring"
  fi
else
  log "smoke | public: SKIPPED (cognitive.aware-wave.com does not resolve yet -- DNS/nginx step not done)"
fi

# -- 6. Notification (success). --
notify "deployed successfully, local health OK"
log "done"
