#!/usr/bin/env bash
# safe-infra-patch.sh — backup-apply-health-rollback wrapper for critical infra files.
#
# Required by Auto-Repair 紅線: ANY agent modifying nginx/Dockerfile/docker-compose
# MUST use this script. Four steps are mandatory; zero tolerance for skipping.
#
# Usage:
#   echo "new content" | safe-infra-patch.sh compose <file-path> <service>
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
printf '%s\n' "$NEW_CONTENT" > "$FILE_PATH"
log "apply | file=$FILE_PATH | bytes=${#NEW_CONTENT}"

# ── Step 3: Health check ──────────────────────────────────────────────────────
health_ok=1

wait_container_healthy() {
  local svc="$1" elapsed=0 cname status hc
  cname=$(docker compose --env-file "$STAGING_DIR/.env" ps -q "$svc" 2>/dev/null | head -1 || true)
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
      cd "$STAGING_DIR"
      if ! docker compose --env-file .env config --quiet 2>/dev/null; then
        log "health-fail | reason=compose config invalid"
        health_ok=0
      else
        docker compose --env-file .env up -d --no-build "$TARGET" 2>&1 | tail -5
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

# ── Step 4: Rollback if failed ────────────────────────────────────────────────
if [[ $health_ok -eq 0 ]]; then
  log "rollback | file=$FILE_PATH | restoring=$BACKUP"
  cp "$BACKUP" "$FILE_PATH"
  case "$TYPE" in
    compose)
      cd "$STAGING_DIR"
      docker compose --env-file .env up -d --no-build "$TARGET" 2>&1 | tail -3 || true
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
  exit 1
fi

log "success | type=$TYPE | file=$FILE_PATH | backup=$BACKUP"
echo "safe-infra-patch OK. Backup: $BACKUP"
