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
SERVICES=(cognitive-os-api cognitive-os-web)
HEALTH_URLS=("http://127.0.0.1:8420/health" "http://127.0.0.1:8421/login")
HEALTH_URL="${HEALTH_URLS[0]}"
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

# -- -1. Ownership self-heal. Root-owned files anywhere under this checkout, or under this
#    product's known /tmp scratch dirs, make later steps fail with errors that look nothing like
#    an ownership problem: 19 unrelated-looking RecipeRunTests failures (PermissionError deep in
#    _atomic_write_journal under PRODUCT_ROOT/.runtime/), or a demo CLI slice returning exit_code 1
#    (PermissionError in shutil.rmtree under /tmp/ai-lego-<method>-slice/). Traced 2026-09-18 across
#    three separate root-owned locations on ks-aw-01 (ai_lego/data/repositories/, PRODUCT_ROOT's
#    own .runtime/, /tmp/ai-lego-cross-impact-analysis-slice/) back to one cause: some earlier
#    command on this host ran as root -- plausibly a sudo-tainted shell that never dropped back
#    after the one command that actually needed it (`sudo apt-get install python3.12-venv`,
#    2026-09-12 WORKLOG, was the last confirmed legitimate use of sudo here). Rather than chase
#    each new instance by hand as a fresh test happens to touch one, normalize ownership of
#    everything this script depends on, every run, before anything else executes. ubuntu has
#    passwordless sudo on this host (see runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md) so this never
#    prompts; the check is cheap (`-quit` stops at the first hit) so sudo only actually runs when
#    something is actually wrong.
_me="$(id -un)"; _mygroup="$(id -gn)"
# Self-consistency guard (critic finding, 2026-09-18): REPO_ROOT above is pure string math on
# BASH_SOURCE -- correct only if this file is actually four directories below REPO_ROOT right now.
# A convenience symlink (e.g. /usr/local/bin/cognitive-os-deploy), a future systemd ExecStart
# pointing at a copy, or a refactor that moves this file would silently walk the `..` hops
# somewhere else -- landing at "/" is possible once you run out of parents to ascend past.
# ks-aw-01 has no fallback host (AGENTS.md SS0): `sudo chown -R ubuntu:ubuntu /` is exactly the
# class of command that ends with a rescue-mode recovery. Verify the round-trip lands back on this
# exact file before any privileged recursive operation is allowed to run at all.
if [[ ! -f "$REPO_ROOT/Projects/internal/cognitive-engineering-os/deploy/deploy.sh" ]]; then
  log "FATAL: REPO_ROOT ('$REPO_ROOT') does not resolve back to this script -- BASH_SOURCE path math is wrong here, refusing ownership self-heal"
  notify "FAILED: REPO_ROOT self-check failed, refusing to run (see deploy.log)"
  exit 1
fi
if find "$REPO_ROOT" -not -user "$_me" -print -quit 2>/dev/null | grep -q .; then
  log "ownership | root-owned files found under $REPO_ROOT -- normalizing to $_me:$_mygroup"
  sudo -n chown -R "$_me:$_mygroup" "$REPO_ROOT"
fi
if find /tmp -maxdepth 1 -iname "ai-lego-*" -not -user "$_me" -print -quit 2>/dev/null | grep -q .; then
  log "ownership | root-owned /tmp/ai-lego-* scratch dir(s) found -- normalizing to $_me:$_mygroup"
  find /tmp -maxdepth 1 -iname "ai-lego-*" -not -user "$_me" -print0 2>/dev/null | xargs -0 --no-run-if-empty sudo -n chown -R "$_me:$_mygroup"
fi

# -- 0. Typecheck/test-gate venv. Self-contained on purpose: this script must not depend on
#    the invoking shell having already `source`d a venv (true for cron/systemd, and for any
#    fresh SSH session that doesn't know this repo's local convention -- discovered 2026-09-18
#    when a plain `bash deploy.sh` failed with ModuleNotFoundError: fastapi despite deploy.log
#    showing many prior clean runs, because those ran from a shell where .deploy-venv had
#    already been activated by hand). Assumes a dedicated per-product checkout (prod uses a
#    sparse clone at /opt/cognitive-os) -- a shared monorepo checkout running this same pattern
#    for a second product would collide on this directory name.
#    No longer a "looks functional, skip reinstall" shortcut (root-cause fix, 2026-09-18): a prior
#    version only checked `import fastapi, pytest` before deciding to skip `pip install` entirely,
#    which passed even though a REAL, already-declared-in-pyproject.toml dependency
#    (matplotlib, added by the chart-rendering feature) was missing from this already-bootstrapped
#    venv -- first deploy attempt after that feature merged failed at the typecheck step below with
#    `ModuleNotFoundError: matplotlib`. The check was approximating "is the venv correct" with two
#    hardcoded names that can never track pyproject.toml's actual dependency list as it grows --
#    the same failure shape as a hand-maintained allowlist drifting from its source of truth.
#    Fix: always run `pip install -e ...[test]` (idempotent -- pip resolves against what's already
#    satisfied and typically finishes in a couple seconds when nothing changed); only the expensive
#    `python3 -m venv` creation step is skipped when the directory already exists.
DEPLOY_VENV="$REPO_ROOT/.deploy-venv"
if [[ ! -x "$DEPLOY_VENV/bin/python3" ]]; then
  log "venv | $DEPLOY_VENV missing or incomplete (no executable bin/python3) -- creating"
  timeout 300 python3 -m venv "$DEPLOY_VENV" >>"$LOG" 2>&1 || { log "venv | FAIL: python3 -m venv (see $LOG for detail)"; notify "FAILED to bootstrap .deploy-venv"; exit 1; }
fi
# shellcheck disable=SC1091
source "$DEPLOY_VENV/bin/activate"
timeout 300 pip install --quiet --upgrade pip >>"$LOG" 2>&1 || log "venv | WARN: pip self-upgrade failed, continuing with bundled pip"
log "venv | ensuring deps match pyproject.toml (pip install -e ...[test])"
timeout 300 pip install --quiet -e "$PRODUCT_ROOT[test]" >>"$LOG" 2>&1 || { log "venv | FAIL: pip install (see $LOG for detail)"; notify "FAILED to install deploy-venv deps"; exit 1; }
log "venv | using $(command -v python3) ($(python3 --version))"

# -- 1. Typecheck substitute (Python has no tsc; the closest real equivalent is "does every
#    module even import cleanly" -- catches syntax errors and import-time exceptions before
#    they'd otherwise only surface at request time inside the container). --
log "typecheck | importing every ai_lego.apps.api / ai_lego.platform.identity / ai_lego.platform.entitlement module"
( cd "$PRODUCT_ROOT" && python3 -c "
import importlib
for mod in ['ai_lego.apps.api.main', 'ai_lego.apps.api.dispatch', 'ai_lego.platform.ai_gateway.provider', 'ai_lego.platform.ai_gateway.draft', 'ai_lego.platform.net.egress', 'ai_lego.platform.identity.store', 'ai_lego.platform.entitlement.check', 'ai_lego.core.domain.identity', 'ai_lego.core.domain.workspace']:
    importlib.import_module(mod)
print('OK: all modules import cleanly')
" ) || { log "typecheck | FAIL"; notify "FAILED at typecheck (import sanity)"; exit 1; }

# -- 2. Test gate -- Phase 1 API-surface test files (the ~260 other tests/unit/* files are
#    Method Atlas method-implementation tests, covered by their own CI path, not re-run here). --
log "test-gate | running pytest for the Phase 1 test files"
( cd "$PRODUCT_ROOT" && python3 -m pytest tests/unit/test_workspace_domain.py tests/unit/test_identity_domain.py tests/unit/test_identity_store.py tests/unit/test_entitlement_check.py tests/unit/test_api_dispatch.py tests/unit/test_api_main.py tests/unit/test_authenticate_timing.py tests/unit/test_ai_gateway.py -q ) \
  || { log "test-gate | FAIL"; notify "FAILED at test gate"; exit 1; }

# -- Tag the currently-running image as :rollback BEFORE building the new one, so a failed
#    deploy can restore the last-known-good image (mirrors oracle-web's own rollback recipe). --
for service in "${SERVICES[@]}"; do
  if docker image inspect "$service:latest" >/dev/null 2>&1; then
    docker tag "$service:latest" "$service:rollback"
    log "rollback-tag | tagged current $service:latest as :rollback"
  fi
done

# -- AI gateway env: docker-compose.yml env_file needs the file to exist even when no key is configured
#    (short env_file syntax works on every Compose v2; the long `required: false` form needs >= 2.24). --
touch "$PRODUCT_ROOT/deploy/.env"

# -- 3. Build + up. --
log "build | docker compose build ${SERVICES[*]}"
docker compose -f "$COMPOSE_FILE" build "${SERVICES[@]}" || { log "build | FAIL"; notify "FAILED at build"; exit 1; }
log "up | docker compose up -d"
docker compose -f "$COMPOSE_FILE" up -d || { log "up | FAIL"; notify "FAILED at docker compose up -d"; exit 1; }

# -- 4. Healthcheck: wait for the container's own HEALTHCHECK to report healthy. Ceiling is
#    120s, comfortably clearing two of compose.yml's 30s healthcheck intervals (Docker's first
#    probe fires at t=~30s, not t=0) so ordinary cold-start variance doesn't trigger a false
#    rollback. --
for index in "${!SERVICES[@]}"; do
  service="${SERVICES[$index]}"
  log "healthcheck | waiting up to 120s for $service to report healthy"
  elapsed=0
  while true; do
    status="$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "unknown")"
    [[ "$status" == "healthy" ]] && break
    if [[ "$elapsed" -ge 120 ]]; then
      log "healthcheck | FAIL | service=$service last status=$status"
      notify "FAILED healthcheck for $service -- rolling back"
      for rollback_service in "${SERVICES[@]}"; do
        if docker image inspect "$rollback_service:rollback" >/dev/null 2>&1; then
          docker tag "$rollback_service:rollback" "$rollback_service:latest"
        fi
      done
      docker compose -f "$COMPOSE_FILE" up -d || { log "rollback | up -d FAILED"; notify "ROLLBACK FAILED: service is down, needs human"; exit 1; }
      exit 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  log "healthcheck | $service healthy after ${elapsed}s"
done

# -- 5. Smoke test -- local container port first (works even before DNS/nginx are wired up),
#    then the real public domain if it resolves (skipped, not failed, if it doesn't yet -- DNS
#    propagation and nginx wiring are separate steps in the deploy runbook). --
log "smoke | local: curl $HEALTH_URL"
curl -sf "$HEALTH_URL" | grep -q '"status":"ok"' || { log "smoke | local FAIL"; notify "FAILED local smoke test"; exit 1; }
log "smoke | local: PASS"
log "smoke | local: curl ${HEALTH_URLS[1]}"
curl -sf "${HEALTH_URLS[1]}" >/dev/null || { log "smoke | web local FAIL"; notify "FAILED web local smoke test"; exit 1; }
log "smoke | web local: PASS"

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
