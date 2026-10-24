#!/usr/bin/env bash
# safe-infra-patch.sh — backup-apply-health-rollback wrapper for critical infra files.
#
# Required by Auto-Repair 紅線: ANY agent modifying nginx/Dockerfile/docker-compose
# MUST use this script. Four steps are mandatory; zero tolerance for skipping.
#
# Usage:
#   echo "new content" | safe-infra-patch.sh compose <file-path> <service>   # any project: /root/chatwoot/docker-compose.yml too
#   echo "new content" | safe-infra-patch.sh nginx   <file-path>
#   echo "new content" | safe-infra-patch.sh host-nginx /etc/nginx/<file> <vhost-to-probe>
#   echo "new content" | safe-infra-patch.sh file    <file-path>   # no health check
#
# nginx = the lobster-nginx CONTAINER. host-nginx = the host's own /etc/nginx (client vhosts such as
# soulfulexpression.org); `nginx` on a host file would pass without testing or reloading it.
#
# Exit 0 = applied + verified. Exit 1 = failed + rolled back.
# Audit log: /root/lobster-phase1/safe-patch.log

set -euo pipefail

TYPE="${1:-}"
FILE_PATH="${2:-}"
TARGET="${3:-}"

[[ -z "$TYPE" || -z "$FILE_PATH" ]] && {
  echo "Usage: safe-infra-patch.sh <compose|nginx|file> <file-path> [service]" >&2
  exit 1
}
[[ -f "$FILE_PATH" ]] || { echo "ERROR: file not found: $FILE_PATH" >&2; exit 1; }

LOGFILE="/root/lobster-phase1/safe-patch.log"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGING_DIR="/root/lobster-phase1"
BACKUP="${FILE_PATH}.bak.safe-patch-${STAMP}"
# host-nginx: never next to the file -- nginx includes whole directories (sites-enabled/*), so a backup
# there would load as a second copy of the vhost.
if [[ "$TYPE" == host-nginx ]]; then
  mkdir -p "$STAGING_DIR/safe-patch-backups"
  BACKUP="$STAGING_DIR/safe-patch-backups/$(realpath -m "$FILE_PATH" | tr / _).safe-patch-${STAMP}"
fi
HEALTH_TIMEOUT="${SAFE_PATCH_HEALTH_TIMEOUT:-90}"
# compose. Invariant: the file patched is a file compose loads for TARGET, and compose runs with exactly the inputs
# that created it. (a) TARGET already has a container whose compose labels list this file: reuse its project, working
# dir, files and env file -- the only way to reach a non-default name (docker-compose.observability.yml in lobster-phase1,
# docker-compose.video.yml with --env-file .env.video). Exactly one such container, else refused.
# (b) no container yet: the project is the file's own directory and the file must be the first default name in compose's
# lookup order; COMPOSE_FILE in shell (unset below) or in the project .env (refused) would change what loads.
COMPOSE_DIR="$(cd "$(dirname "$FILE_PATH")" && pwd)"
COMPOSE_ARGS=()
if [[ "$TYPE" == compose && -n "$TARGET" ]]; then
  ABS_FILE="$COMPOSE_DIR/$(basename "$FILE_PATH")"
  L='{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{index .Config.Labels "com.docker.compose.project.config_files"}}|{{index .Config.Labels "com.docker.compose.project.environment_file"}}'
  matches=()
  while IFS= read -r cid; do
    [[ -n "$cid" ]] || continue
    m="$(docker inspect --format "$L" "$cid")"
    IFS=, read -ra files <<<"$(cut -d'|' -f3 <<<"$m")"
    for f in "${files[@]}"; do [[ "$f" == "$ABS_FILE" ]] && { matches+=("$m"); break; }; done
  done < <(docker ps -aq --filter "label=com.docker.compose.service=$TARGET")
  if (( ${#matches[@]} > 1 )) && [[ "$(printf '%s\n' "${matches[@]}" | sort -u | wc -l)" -gt 1 ]]; then
    echo "ERROR: containers of service $TARGET from $ABS_FILE disagree on project/files/env: ${matches[*]}" >&2
    exit 1
  fi
  if (( ${#matches[@]} )); then
    IFS='|' read -r c_project c_dir c_files c_env <<<"${matches[0]}"
    COMPOSE_DIR="$c_dir"
    COMPOSE_ARGS=(-p "$c_project" --project-directory "$c_dir")
    IFS=, read -ra files <<<"$c_files"
    for f in "${files[@]}"; do COMPOSE_ARGS+=(-f "$f"); done
    IFS=, read -ra envs <<<"$c_env"
    for e in "${envs[@]}"; do [[ -n "$e" ]] && COMPOSE_ARGS+=(--env-file "$e"); done
  fi
fi
if [[ "$TYPE" == compose && ${#COMPOSE_ARGS[@]} -eq 0 ]]; then
  loaded=""
  for n in compose.yaml compose.yml docker-compose.yaml docker-compose.yml; do
    [[ -f "$COMPOSE_DIR/$n" ]] && { loaded="$n"; break; }
  done
  if [[ "$(basename "$FILE_PATH")" != "$loaded" ]]; then
    echo "ERROR: docker compose in $COMPOSE_DIR loads '${loaded:-nothing}', not $(basename "$FILE_PATH")" >&2
    exit 1
  fi
  if [[ -f "$COMPOSE_DIR/.env" ]] && grep -Eq '^[[:space:]]*(export[[:space:]]+)?COMPOSE_FILE[[:space:]]*=' "$COMPOSE_DIR/.env"; then
    echo "ERROR: $COMPOSE_DIR/.env sets COMPOSE_FILE; the patched file may not be the one compose loads" >&2
    exit 1
  fi
fi
compose() {
  (cd "$COMPOSE_DIR" && unset COMPOSE_FILE
   if (( ${#COMPOSE_ARGS[@]} )); then docker compose "${COMPOSE_ARGS[@]}" "$@"
   elif [[ -f .env ]]; then docker compose --env-file .env "$@"; else docker compose "$@"; fi)
}

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOGFILE"; }

# ── Step 1: Backup ────────────────────────────────────────────────────────────
cp "$FILE_PATH" "$BACKUP"
log "backup | file=$FILE_PATH | backup=$BACKUP"

# ── Step 2: Apply (stdin) ─────────────────────────────────────────────────────
NEW_CONTENT="$(cat)"
if [[ -z "$NEW_CONTENT" ]]; then
  log "abort | reason=empty stdin"
  rm -f "$BACKUP"
  echo "ERROR: no content on stdin" >&2
  exit 1
fi
# Invariant: exit 0 <=> the new content was verified and stays; any other end -- an unexpected failure under set -e
# (2026-10-24: a failing `compose up` exited here before Step 4 and kept the new file), TERM/HUP/INT (SSH dropped) or a
# failure while reporting success -- restores the backup. So finished=1 is the script's last statement.
finished=0
rollback() {
  log "rollback | file=$FILE_PATH | restoring=$BACKUP"
  cp "$BACKUP" "$FILE_PATH"
  case "$TYPE" in
    compose)
      compose up -d --no-build "$TARGET" 2>&1 | tail -3 || true
      ;;
    nginx)
      docker exec lobster-nginx nginx -s reload 2>/dev/null || true
      ;;
    host-nginx)
      { nginx -t >/dev/null 2>&1 && systemctl reload nginx; } || log "rollback-warn | host nginx not reloaded; run nginx -t"
      ;;
  esac
  log "rollback-done | file=$FILE_PATH | status=restored"
  echo "SAFE-PATCH FAILED: rolled back to backup $BACKUP" >&2
}
on_exit() { trap - EXIT; set +e; [[ $finished -eq 1 ]] || { rollback; exit 1; }; }
trap on_exit EXIT
trap 'exit 1' TERM HUP INT
printf '%s\n' "$NEW_CONTENT" > "$FILE_PATH"
log "apply | file=$FILE_PATH | bytes=${#NEW_CONTENT}"

# ── Step 3: Health check ──────────────────────────────────────────────────────
health_ok=1

wait_container_healthy() {
  local svc="$1" elapsed=0 cname status hc
  cname=$(compose ps -q "$svc" 2>/dev/null | head -1 || true)
  [[ -z "$cname" ]] && { log "health-warn | container for $svc not found"; return 0; }
  hc=$(docker inspect --format='{{if .Config.Healthcheck}}yes{{end}}' "$cname" 2>/dev/null || true)
  [[ "$hc" != "yes" ]] && { log "health-warn | $svc has no healthcheck — skipping wait"; return 0; }
  echo -n "  Waiting for $svc healthy"
  while true; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$cname" 2>/dev/null || echo "unknown")
    case "$status" in
      healthy)   echo " PASS (${elapsed}s)"; return 0 ;;
      unhealthy) echo " FAIL";               return 1 ;;
    esac
    sleep 3; elapsed=$((elapsed + 3)); printf "."
    if [[ $elapsed -ge $HEALTH_TIMEOUT ]]; then echo " TIMEOUT (${HEALTH_TIMEOUT}s)"; return 1; fi
  done
}

case "$TYPE" in
  compose)
    [[ -z "$TARGET" ]] && { echo "ERROR: service required for compose type" >&2; health_ok=0; }
    if [[ $health_ok -eq 1 ]]; then
      if ! compose config --quiet 2>/dev/null; then
        log "health-fail | reason=compose config invalid ($COMPOSE_DIR)"
        health_ok=0
      else
        compose up -d --no-build "$TARGET" 2>&1 | tail -5
        wait_container_healthy "$TARGET" || health_ok=0
      fi
    fi
    ;;
  nginx)
    if ! docker exec lobster-nginx nginx -t 2>/dev/null; then
      log "health-fail | reason=nginx -t failed"
      health_ok=0
    else
      docker exec lobster-nginx nginx -s reload
      sleep 2
      # Probe lobster-nginx itself, not the outer host-nginx (port 80, Certbot-managed,
      # force-redirects several domains to HTTPS) -- resolved at runtime, not hardcoded,
      # because the host port is NGINX_HOST_PORT-driven (docker-compose.yml) and varies
      # by environment/host.
      nginx_probe_port=$(docker port lobster-nginx 80/tcp 2>/dev/null | head -1 | sed 's/.*://')
      nginx_probe_port="${nginx_probe_port:-80}"
      http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Host: app.aware-wave.com" "http://127.0.0.1:${nginx_probe_port}/api/ops/summary" 2>/dev/null)
      http_code="${http_code:-000}"
      if [[ "$http_code" != "200" ]]; then
        log "health-fail | reason=nginx smoke check returned $http_code"
        health_ok=0
      fi
    fi
    ;;
  host-nginx)
    # TARGET = a vhost this file serves, probed over 127.0.0.1 (cf-only.conf admits loopback).
    case "$(realpath -m "$FILE_PATH")" in /etc/nginx/*) ;; *)
      log "health-fail | reason=host-nginx file outside /etc/nginx"; health_ok=0 ;; esac
    [[ "$TARGET" =~ ^[a-z0-9.-]+$ ]] || { log "health-fail | reason=host-nginx needs a vhost to probe"; health_ok=0; }
    if [[ $health_ok -eq 1 ]]; then
      if ! nt="$(nginx -t 2>&1)"; then
        log "health-fail | reason=nginx -t failed: $(printf '%s' "$nt" | tail -2 | tr '\n' ' ')"
        health_ok=0
      elif ! systemctl reload nginx; then
        log "health-fail | reason=systemctl reload nginx failed"
        health_ok=0
      else
        sleep 2
        http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 30 \
          --resolve "${TARGET}:443:127.0.0.1" "https://${TARGET}/" 2>/dev/null || true)
        if [[ ! "${http_code:-000}" =~ ^[23][0-9][0-9]$ ]]; then
          log "health-fail | reason=https://${TARGET}/ via 127.0.0.1 returned ${http_code:-000}"
          health_ok=0
        fi
      fi
    fi
    ;;
  file)
    log "apply | type=file | health-check=skipped"
    ;;
  *)
    echo "ERROR: unknown type '$TYPE'. Valid: compose|nginx|host-nginx|file" >&2
    health_ok=0
    ;;
esac

# ── Step 4: Rollback if failed (on_exit) ──────────────────────────────────────
[[ $health_ok -eq 1 ]] || exit 1

log "success | type=$TYPE | file=$FILE_PATH | backup=$BACKUP"
echo "safe-infra-patch OK. Backup: $BACKUP"
finished=1
