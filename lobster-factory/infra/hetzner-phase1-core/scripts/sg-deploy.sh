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
# Per-app git source root (2026-09-18, hci-app prod-deploy prep): every app before hci-app lives
# under GIT_APPS_ROOT, one directory per app name. hci-app does not -- it is
# Projects/internal/hci30/'s own product root (needed whole, not just its app/ subdirectory, since
# app/server.mjs imports sibling packages/ and public-intelligence/ by relative path -- see that
# product's own Dockerfile header). This function is the one place that difference lives; every
# other reference to "where does $APP's source come from" below calls it, so a future app with the
# same shape needs one new case here, not a scattered set of if-APP-is-hci-app checks.
app_git_source_root() {
  case "$1" in
    hci-app) echo "$REPO_DIR/Projects/internal/hci30" ;;
    *) echo "$GIT_APPS_ROOT/$1" ;;
  esac
}
# Per-app deployed container name (2026-09-18): every app before hci-app is deployed as
# "lobster-$APP" (docker-compose.yml container_name:). hci-app's own compose block deliberately
# uses the bare product name "hci-app" instead (HCI-30 is not "lobster"-branded), matching
# hci-postgres/hci-fetch-runner's own container_name: choices in the same file.
app_container_name() {
  case "$1" in
    hci-app) echo "hci-app" ;;
    *) echo "lobster-$1" ;;
  esac
}
LOG_DIR="$STAGING_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_FILE:-$LOG_DIR/sg-deploy-$(date +%Y%m%d-%H%M%S).log}"
export LOG_FILE
SELF_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; exit 1; }

SKIP_PULL=0
DRY_RUN=0
FORCE=0
APPS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull) SKIP_PULL=1; shift ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --force)     FORCE=1; shift ;;
    -h|--help)
      sed -n '1,30p' "$0"
      exit 0
      ;;
    *) APPS+=("$1"); shift ;;
  esac
done

# ─── Deploy lock (prevent concurrent runs) ───────────────────────
LOCK_FILE="/tmp/sg-deploy.lock"
LOCK_HELD=0
if [ -f "$LOCK_FILE" ] && [ "$FORCE" -eq 0 ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ "$LOCK_PID" = "$$" ]; then
    # Our own lock, inherited across step 1.8's self-update `exec` (exec keeps the PID and
    # never runs the EXIT trap). Without this, every deploy that pulled a changed
    # sg-deploy.sh aborted here as "Another deploy is running (PID <self>)".
    :
  elif [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[sg-deploy] Another deploy is running (PID $LOCK_PID). Use --force to override."
    exit 1
  else
    echo "[sg-deploy] Stale lock found, removing."
    rm -f "$LOCK_FILE"
  fi
fi
echo $$ > "$LOCK_FILE"
LOCK_HELD=1
trap 'if [ $LOCK_HELD -eq 1 ]; then rm -f "$LOCK_FILE"; fi' EXIT INT TERM
# A previous run's rollback marker must not be reported as THIS run's rollback when this run
# fails before reaching do_rollback (auto-deploy-next-admin.sh reads it on any failure).
rm -f "$STAGING_DIR/.rollback-triggered"

if [[ ${#APPS[@]} -eq 0 ]]; then
  APPS=(next-admin)
fi

# C1 fix (Errata EMaj-2): partition APPS into restorable (have image snapshot semantics
# in rollback-phase1.sh IMAGE_MAP) vs not. Only restorable apps participate in
# save-before-build + restore-on-smoke-fail.
# From SELF_PATH (absolute, resolved before any cd), never "$(dirname "$0")": the documented
# invocation is `bash scripts/sg-deploy.sh` (relative $0) and step 1 cd's to $REPO_DIR, so a
# $0-relative path pointed at /root/Work/scripts/ -- the -x check failed and auto-rollback was
# silently disabled on every such run (WORKLOG 2026-09-19 續81; logs show it since 2026-07-04).
ROLLBACK_SCRIPT="$(dirname "$SELF_PATH")/rollback-phase1.sh"
RESTORABLE_APPS=()
NON_RESTORABLE_APPS=()
for _app in "${APPS[@]}"; do
  case "$_app" in
    wordpress|node-api|next-admin|hci-app|renderer) RESTORABLE_APPS+=("$_app") ;;
    *) NON_RESTORABLE_APPS+=("$_app") ;;
  esac
done

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

# 1.8. self-sync deploy scripts from git → staging (prevents script drift without manual copy).
#      Runs only after a successful git pull (SKIP_PULL=0) so --skip-pull stays truly isolated.
#      If sg-deploy.sh itself changed: exec the new version so the rest of the deploy uses
#      the latest code (avoids bash reading the old script body after self-overwrite).
if [[ $SKIP_PULL -eq 0 ]]; then
  _git_scripts="$REPO_DIR/lobster-factory/infra/hetzner-phase1-core/scripts"
  _staging_scripts="$STAGING_DIR/scripts"
  [[ -f "$_git_scripts/sg-deploy.sh" ]] || fail "git scripts dir missing: $_git_scripts"
  _self_changed=0
  cmp -s "$_git_scripts/sg-deploy.sh" "$SELF_PATH" 2>/dev/null || _self_changed=1
  log "--- sync deploy scripts ---"
  rsync -a "$_git_scripts/" "$_staging_scripts/" 2>&1 | tee -a "$LOG_FILE"
  find "$_staging_scripts" -maxdepth 1 -name "*.sh" -exec chmod +x {} + 2>/dev/null || true
  if [[ "$_self_changed" -eq 1 ]]; then
    log "sg-deploy.sh updated from git — re-execing new version"
    _reexec=(--skip-pull)
    [[ $DRY_RUN -eq 1 ]] && _reexec+=(--dry-run)
    _reexec+=("${APPS[@]}")
    exec "$_staging_scripts/sg-deploy.sh" "${_reexec[@]}"
  fi
  log "deploy scripts synced"
fi

# 1.85. deploy hold. While DEPLOY_HOLD exists on origin/main, every app deploy is refused --
# manual runs included, because the auto-deploy failure alert tells the operator to run this
# script by hand, which is exactly how unfinished work reaches prod. Read from origin/main, not
# the worktree, so --skip-pull (step 1.8 re-exec) and auto-deploy's pre-pull path agree.
HOLD_PATH="lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD"
if git -C "$REPO_DIR" cat-file -e "origin/main:$HOLD_PATH" 2>/dev/null; then
  HOLD_REASON="$(git -C "$REPO_DIR" show "origin/main:$HOLD_PATH" 2>/dev/null | grep -m1 '^reason=' | cut -d= -f2- || true)"
  [[ -n "$HOLD_REASON" ]] || HOLD_REASON="(no reason= line in $HOLD_PATH)"
  if [[ "${DEPLOY_HOLD_OVERRIDE:-0}" == "1" ]]; then
    log "DEPLOY HOLD present, DEPLOY_HOLD_OVERRIDE=1 set -- continuing. reason: $HOLD_REASON"
  else
    log "DEPLOY HOLD active. reason: $HOLD_REASON"
    fail "deploy held by $HOLD_PATH -- git rm that file to resume, or re-run with DEPLOY_HOLD_OVERRIDE=1"
  fi
fi

# 2. rsync each app
# 1.5. pre-build gate — typecheck then tests, only for next-admin, before rsync/snapshot.
#      Order: tsc first (fast, clean diagnostics) then vitest.
#      Note: tsc runs against the source tree (no .next/types/** regeneration);
#      covers source-level type errors — same scope as GHA next-admin-typecheck.yml.
if [[ " ${APPS[*]} " =~ " next-admin " && $DRY_RUN -eq 0 ]]; then
  TEST_DIR="$GIT_APPS_ROOT/next-admin"
  # npm ci every run, NOT "install only when node_modules is missing": that old check tested
  # directory existence as a proxy for "deps match the lockfile", so a commit that ADDED a
  # dependency left the stale tree untouched and the typecheck gate below failed TS2307 forever,
  # re-alerting every 4h (pixelmatch, 2026-09-21..23). npm ci IS the invariant: tree == lockfile.
  log "--- npm ci gate (next-admin deps == package-lock.json) ---"
  npm --prefix "$TEST_DIR" ci --include=dev 2>&1 | tee -a "$LOG_FILE"     || fail "npm ci failed -- cannot run pre-build gate (lockfile out of sync with package.json, or registry unreachable)"

  log "--- tsc typecheck gate (next-admin) ---"
  npm --prefix "$TEST_DIR" run typecheck 2>&1 | tee -a "$LOG_FILE" \
    || fail "tsc typecheck FAILED — deploy aborted; fix type errors before re-deploying next-admin"
  log "tsc typecheck passed"

  log "--- npm test gate (next-admin) ---"
  npm --prefix "$TEST_DIR" test 2>&1 | tee -a "$LOG_FILE" \
    || fail "npm test FAILED — deploy aborted; fix tests before re-deploying next-admin"
  log "npm test passed"
fi

# 1.6. pre-build gate for hci-app -- Node-native only (node --check + node --test), deliberately
# NOT the full tests/architecture/*.ps1 / test-wave1-local.ps1 suite: those need PowerShell + an
# ephemeral Docker Postgres, and ks-aw-01 is a bare Ubuntu host with no PowerShell -- installing it
# just for this one gate would be disproportionate (per this session's own earlier deploy-plan
# investigation). This fast subset still catches the two failure classes that actually matter for
# a deploy gate: a syntax-broken server.mjs, and a real regression in any pure-Node architecture
# test under tests/architecture/*.mjs (critic review, 2026-09-18: deliberately not enumerated by
# name here -- a hardcoded list drifts the moment a new one is added, exactly what this comment
# itself did on its first draft, which named 4 of the 5 already present and missed
# peer-boundary.test.mjs). Deliberately EXCLUDED: the .ps1 architecture tests (fetch-runner
# network/content/object-storage isolation) -- these need PowerShell + a real Docker Postgres,
# unavailable on ks-aw-01. Known, named residual risk: a regression in the isolated fetch-runner's
# actual network isolation (ADR-0029) would NOT be caught by this deploy gate -- it can only be
# caught by manually re-running those .ps1 tests, which this gate does not automate.
if [[ " ${APPS[*]} " =~ " hci-app " && $DRY_RUN -eq 0 ]]; then
  HCI_SRC_ROOT="$(app_git_source_root hci-app)"
  log "--- node --check gate (hci-app) ---"
  node --check "$HCI_SRC_ROOT/app/server.mjs" 2>&1 | tee -a "$LOG_FILE" \
    || fail "node --check FAILED on hci-app/app/server.mjs — deploy aborted"
  log "node --check passed"

  log "--- node --test gate (hci-app architecture tests) ---"
  node --test "$HCI_SRC_ROOT/tests/architecture/"*.mjs 2>&1 | tee -a "$LOG_FILE" \
    || fail "hci-app architecture tests FAILED — deploy aborted; fix before re-deploying hci-app"
  log "hci-app architecture tests passed"
fi

# 1.7. pre-build gate for renderer -- same Node-native shape as hci-app's above (no tsc: plain .mjs).
# Only the pure refusals are unit-tested here (test/lib.test.mjs); the part that actually contains a
# hostile page -- entrypoint.sh's egress policy and privilege drop -- can only be proven inside the
# running container, which is why step 7's renderer smoke performs a REAL render, not just /healthz.
if [[ " ${APPS[*]} " =~ " renderer " && $DRY_RUN -eq 0 ]]; then
  RENDERER_SRC="$(app_git_source_root renderer)"
  log "--- node --check gate (renderer) ---"
  node --check "$RENDERER_SRC/server.mjs" 2>&1 | tee -a "$LOG_FILE"     && node --check "$RENDERER_SRC/lib.mjs" 2>&1 | tee -a "$LOG_FILE"     && sh -n "$RENDERER_SRC/entrypoint.sh" 2>&1 | tee -a "$LOG_FILE"     || fail "syntax check FAILED on renderer -- deploy aborted"
  log "--- node --test gate (renderer) ---"
  node --test "$RENDERER_SRC/test/"*.test.mjs 2>&1 | tee -a "$LOG_FILE"     || fail "renderer unit tests FAILED -- deploy aborted"
  log "renderer gates passed"
fi

for APP in "${APPS[@]}"; do
  SRC="$(app_git_source_root "$APP")/"
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

# 2.5 snapshot before build (C1 EMaj-2 fix: auto-rollback needs prior `save`).
#     Without this, the first auto-rollback fires on a build that has no snapshot →
#     rollback-phase1.sh restore would error. We snapshot every restorable app pre-build
#     so the smoke-fail rollback path always has a tag to restore.
#     Invariant (critic review 2026-09-19): a restorable app is never built without a working
#     rollback point from THIS run. A missing script or a failed save stops the deploy before
#     build; a WARN-and-continue here is what hid the $0-relative path bug for months.
#     SNAPSHOT_TAG[app] = this run's tag, so rollback restores exactly it, never "latest
#     rollback-*" (which a failed save would silently turn into an older deploy's image).
#     Empty = first deploy of that app (save printed "Saved: NONE"): nothing to roll back to.
declare -A SNAPSHOT_TAG=()
if [[ ${#RESTORABLE_APPS[@]} -gt 0 ]]; then
  [[ -x "$ROLLBACK_SCRIPT" ]] \
    || fail "$ROLLBACK_SCRIPT not executable -- refusing to deploy ${RESTORABLE_APPS[*]} without auto-rollback"
  log "--- snapshot before build (rollback prep) ---"
  for APP in "${RESTORABLE_APPS[@]}"; do
    if ! _save_out=$("$ROLLBACK_SCRIPT" save "$APP" 2>&1); then
      printf '%s\n' "$_save_out" | tee -a "$LOG_FILE"
      fail "snapshot save for $APP failed -- refusing to deploy without a rollback point"
    fi
    printf '%s\n' "$_save_out" | tee -a "$LOG_FILE"
    SNAPSHOT_TAG[$APP]=$(printf '%s\n' "$_save_out" | sed -n 's/^Saved: [^:]*:\(rollback-[0-9-]*\)$/\1/p' | tail -1)
    # Empty tag is accepted ONLY for an explicit first deploy; anything else (e.g. save's
    # tag format changed) must not quietly become "nothing to restore" at rollback time.
    if [[ -z "${SNAPSHOT_TAG[$APP]}" ]] && ! grep -qx 'Saved: NONE' <<< "$_save_out"; then
      fail "cannot parse snapshot tag for $APP from save output -- refusing to deploy without a rollback point"
    fi
  done
fi
if [[ ${#NON_RESTORABLE_APPS[@]} -gt 0 ]]; then
  log "WARN: apps outside rollback-phase1.sh IMAGE_MAP, no auto-rollback for: ${NON_RESTORABLE_APPS[*]}"
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
#    C1 fix: also remember the PREVIOUS commit so smoke-fail auto-rollback can revert
#    the drift marker. EMin-7 also addressed (no more unassigned $DEPLOYED_COMMIT reference).
PREVIOUS_COMMIT=""
if [[ -f "$STAGING_DIR/.deployed-commit" ]]; then
  PREVIOUS_COMMIT=$(cat "$STAGING_DIR/.deployed-commit")
fi
NEW_COMMIT=$(git -C "$REPO_DIR" rev-parse HEAD)
echo "$NEW_COMMIT" > "$STAGING_DIR/.deployed-commit"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGING_DIR/.deployed-at"
log "wrote .deployed-commit = $NEW_COMMIT (previous: ${PREVIOUS_COMMIT:-none})"

# Auto-rollback: ONE path for every post-`up` failure (health in step 6, smoke in step 7).
# Before 2026-09-19 only smoke failure rolled back; an unhealthy/crash-looping new container
# (the most common failed-deploy shape) was left running with .deployed-commit advanced.
# Restores each restorable app to SNAPSHOT_TAG from this run, reverts .deployed-commit,
# always exits non-zero. AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false (drill mode) skips it.
rollback_enabled() { [[ "${AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL:-true}" == "true" ]]; }
do_rollback() {
  local reason="$1" smoke_errors="${2:-0}" failures=0 app tag
  log "--- AUTO-ROLLBACK triggered: $reason ---"
  [[ ${#RESTORABLE_APPS[@]} -gt 0 ]] || fail "$reason; no restorable apps in this deploy, cannot auto-rollback"
  for app in "${RESTORABLE_APPS[@]}"; do
    tag="${SNAPSHOT_TAG[$app]:-}"
    if [[ -z "$tag" ]]; then
      log "ROLLBACK_FAILED for $app -- no snapshot from this run (first deploy of $app, nothing to restore)"
      failures=$((failures + 1)); continue
    fi
    log "rolling back $app to $tag..."
    if ! "$ROLLBACK_SCRIPT" restore "$app" "$tag" 2>&1 | tee -a "$LOG_FILE"; then
      log "ROLLBACK_FAILED for $app -- manual intervention required"
      failures=$((failures + 1))
    fi
  done
  if [[ -n "$PREVIOUS_COMMIT" ]]; then
    echo "$PREVIOUS_COMMIT" > "$STAGING_DIR/.deployed-commit"
    log ".deployed-commit reverted to $PREVIOUS_COMMIT (pre-rollback state)"
  fi
  printf 'ROLLBACK|smoke_errors=%d|rollback_failures=%d|%s|reason=%s\n' \
    "$smoke_errors" "$failures" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$reason" \
    > "$STAGING_DIR/.rollback-triggered"
  if [[ "$failures" -gt 0 ]]; then
    fail "auto-rollback fired ($reason) but $failures app(s) failed to restore; URGENT manual check required"
  fi
  fail "auto-rollback fired ($reason); new code reverted to this run's pre-deploy snapshot"
}
health_fail() {
  rollback_enabled && do_rollback "$1"
  fail "$1"
}

# 6. wait for healthy. Failure -> auto-rollback (see do_rollback).
for APP in "${APPS[@]}"; do
  CONTAINER="$(app_container_name "$APP")"
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
      health_fail "$CONTAINER unhealthy"
    fi
    sleep 1
    [[ $i -eq 60 ]] && health_fail "$CONTAINER did not become healthy in 60s (status=$STATUS)"
  done
done


# 7. HTTP smoke check + auto-rollback gate.
#    C1 fix (Plan v3.2 §五 third layer): smoke fail → auto-restore last snapshot.
#    Drill mode (AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false) preserves the legacy
#    "non-fatal warn" behavior for scheduled drills where degradation is intentional.
#    Endpoints confirmed reachable from localhost 2026-05-21.
#    ⚠ 2026-08-29 fix: the wordpress + node-api probes below were last verified against the OLD
#    single-tenant SG box, which no longer exists -- SG+EU were fully consolidated onto ks-aw-01
#    on 2026-08-28 (agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md banner), and that box
#    hosts many vhosts (mainwp/n8n/postiz/oracle/soulfulexpression/sg-stack/...). A bare
#    `http://127.0.0.1/` with no Host header no longer resolves to WordPress -- it hits nginx's
#    default vhost and 404s -- and node-api's real health path is `/health`, not `/api/health`
#    (the api.aware-wave.com vhost passes the path through unchanged, no prefix strip). This
#    caused a FALSE-POSITIVE smoke failure on every next-admin deploy since the consolidation,
#    auto-rolling back healthy deploys because of two UNRELATED, already-broken probes --
#    confirmed live 2026-08-29 during the portal.aware-wave.com deploy (next-admin's own two
#    probes passed; these two didn't). The wordpress probe went through two more revisions after
#    that (see _smoke_check's resolve_host param below for why -- a `-L` follow-redirect version
#    leaked the probe out to public DNS/Cloudflare, which a critic pass caught before merge).
#    Final verified form: `curl -k --resolve aware-wave.com:443:127.0.0.1
#    https://aware-wave.com/` -> 200, remote_ip=127.0.0.1 (stays on-box; apex not www, so no
#    extra www->apex redirect hop); `curl -H "Host: api.aware-wave.com"
#    http://127.0.0.1/health` -> 200.
_smoke_errors=0
_smoke_check() {
  local label="$1" url="$2" host_header="${3:-}" resolve_host="${4:-}"
  local http
  local -a curl_args=(-s --max-time 5 -o /dev/null -w "%{http_code}")
  if [[ -n "$resolve_host" ]]; then
    # Critic finding (2026-08-29, Major): an earlier version of this probe used `-L` to follow
    # WordPress's forced http->https redirect. Following it means curl re-resolves the hostname
    # via PUBLIC DNS and can land on Cloudflare's edge, satisfying this probe even if the LOCAL
    # nginx->WordPress path on THIS box is dead -- injecting an external dependency (DNS/CF
    # availability) into a gate that auto-rolls back production, on the exact false-positive
    # axis this whole fix exists to close. `--resolve host:443:127.0.0.1` forces the hostname to
    # resolve to this box while keeping Host/SNI correct, so it tests the real vhost+TLS path
    # end-to-end without ever leaving localhost. Same pattern already used at
    # lobster-factory/infra/soulful/cutover-sync.sh:234. `-k` skips cert verification (fine here
    # -- this box IS the origin; only reachability/routing is being tested, not cert validity).
    curl_args+=(-k --resolve "${resolve_host}:443:127.0.0.1")
  elif [[ -n "$host_header" ]]; then
    curl_args+=(-H "Host: $host_header")
  fi
  # Critic finding (2026-08-29, minor): `$(curl ...) || echo "000"` CONCATENATES -- curl without
  # -f already prints its -w code before exiting non-zero on a transport failure, so the old form
  # could log a misleading "404000"/"000000". Assign first, fall back on failure, never append.
  http=$(curl "${curl_args[@]}" "$url" 2>/dev/null) || http="000"
  if [[ "$http" =~ ^2 ]]; then log "  smoke OK: $label -> $http"
  else log "  SMOKE_WARN: $label -> $http"; _smoke_errors=$((_smoke_errors + 1)); fi
}
log "--- HTTP smoke check ---"
# next-admin liveness probes /login (public, excluded from the auth gate) instead of "/".
# Since the Supabase-Auth cutover (2026-06-05) the root "/" page is gated → an
# unauthenticated curl gets 302→/login, which is HEALTHY but not 2xx and would wrongly
# trip the smoke-fail auto-rollback. /login renders 200 and proves the app + routing are up;
# /api/ops/summary (exempt server-to-server endpoint) covers API liveness.
_smoke_check "next-admin /login"           "http://127.0.0.1:3002/login"
_smoke_check "next-admin /api/ops/summary" "http://127.0.0.1:3002/api/ops/summary"
_smoke_check "nginx/wordpress"             "https://aware-wave.com/" "" "aware-wave.com"
# 2026-09-12 fix: this used to go through the outer host-nginx (port 80, Certbot-managed) with a
# Host header, same wrong-layer bug as safe-infra-patch.sh's nginx smoke check (fixed same day,
# commit 5a1ec19e1 — see that commit for the full root-cause account). A Certbot cert change for
# an unrelated domain (cognitive.aware-wave.com) started forcing api.aware-wave.com onto HTTPS at
# that outer layer too, turning this into a false-positive 301 that auto-rolled-back a healthy
# next-admin deploy with nothing wrong with next-admin.
#
# First fix attempt hardcoded 127.0.0.1:3001 with the reasoning "node-api's PORT env var is fixed
# in docker-compose.yml" -- critic review (second pass, same day) caught that this conflates the
# CONTAINER-internal PORT with the HOST-published port, which is actually `${NODE_API_HOST_PORT:-
# 127.0.0.1:3001}` (docker-compose.yml) -- the exact same override-fragility class the sibling
# commit's own critic review already flagged for NGINX_HOST_PORT, and one SAME_VPS_STAGING_RUNBOOK.md
# already documents as a LIVE override (staging maps it to 9001). Resolved at runtime instead, same
# pattern as safe-infra-patch.sh's `docker port lobster-nginx 80/tcp`.
node_api_port=$(docker port lobster-node-api 3001/tcp 2>/dev/null | head -1 | sed 's/.*://')
node_api_port="${node_api_port:-3001}"
_smoke_check "node-api health"             "http://127.0.0.1:${node_api_port}/health"
# Second critic finding: the direct-port probe above only proves node-api itself is alive -- it
# bypasses nginx entirely, silently dropping the coverage the old (broken) Host-header probe was
# AT LEAST attempting before the Certbot regression (is api.aware-wave.com's own public vhost/TLS
# routing intact?). Restored using the wordpress probe's already-reviewed --resolve pattern, which
# sidesteps the port-80 redirect trap because a valid :443 request is never subject to an
# http->https force-redirect rule (confirmed live 2026-09-12: returns 200 while port 80 still 301s).
_smoke_check "nginx/api"                   "https://api.aware-wave.com/health" "" "api.aware-wave.com"
# hci-app (2026-09-18): direct-port probe only, matching node-api's own reasoning above (the
# nginx/DNS vhost for hci.aware-wave.com is a separate, not-yet-done step -- see this app's own
# WORKLOG entry -- so there is deliberately no "nginx/hci" probe here yet; add one the same day
# that vhost lands, same pattern as the api.aware-wave.com probe two lines up).
if [[ " ${APPS[*]} " =~ " hci-app " ]]; then
  hci_app_port=$(docker port hci-app 4030/tcp 2>/dev/null | head -1 | sed 's/.*://')
  hci_app_port="${hci_app_port:-4030}"
  _smoke_check "hci-app health"              "http://127.0.0.1:${hci_app_port}/health"
fi

# renderer (2026-09-21): /healthz only proves node is up -- the browser is launched lazily, so a
# Chromium that cannot start under the dropped capabilities would still pass it. The second probe
# performs one REAL render of a public page, which exercises the launch, the egress policy (DNS +
# public internet must work) and the secret check together. Published on 127.0.0.1 only.
if [[ " ${APPS[*]} " =~ " renderer " ]]; then
  renderer_port=$(docker port lobster-renderer 3000/tcp 2>/dev/null | head -1 | sed 's/.*://')
  renderer_port="${renderer_port:-3190}"
  _smoke_check "renderer healthz" "http://127.0.0.1:${renderer_port}/healthz"
  renderer_secret=$(grep -m1 '^RENDERER_SHARED_SECRET=' "$STAGING_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')
  # The secret goes in through curl's --config on stdin, never as an argument: arguments are readable
  # by any local user via ps / /proc/<pid>/cmdline for as long as the request runs (cross-model
  # review, 2026-09-21). printf is a bash builtin, so it never appears in a process list either.
  render_ok=$(printf 'header = "x-renderer-secret: %s"
' "$renderer_secret"     | curl -s --max-time 60 --config - -X POST -H "content-type: application/json"       --data '{"url":"https://example.com/","timeoutMs":30000}'       "http://127.0.0.1:${renderer_port}/render" 2>/dev/null | grep -c '"ok":true' || true)
  if [[ "$render_ok" -ge 1 ]]; then log "  smoke OK: renderer real render (example.com)"
  else log "  SMOKE_WARN: renderer real render failed"; _smoke_errors=$((_smoke_errors + 1)); fi
fi

if [[ "$_smoke_errors" -gt 0 ]]; then
  log "SMOKE_WARN: $_smoke_errors endpoint(s) returned non-2xx -- service may be partially degraded"
  printf '%s|%s\n' "$_smoke_errors" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGING_DIR/.smoke-warn"

  # C1: Plan §五 third-layer auto-rollback (default ON).
  if rollback_enabled; then
    do_rollback "smoke check: $_smoke_errors endpoint(s) non-2xx" "$_smoke_errors"
  else
    log "AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false -- DRILL MODE; leaving degraded state for inspection"
  fi
else
  log "smoke: all endpoints OK"
  rm -f "$STAGING_DIR/.smoke-warn"
  rm -f "$STAGING_DIR/.rollback-triggered"
fi

log "=== sg-deploy complete ==="
log "deployed commit: $(cat "$STAGING_DIR/.deployed-commit")"
log "deployed at:     $(cat "$STAGING_DIR/.deployed-at")"
