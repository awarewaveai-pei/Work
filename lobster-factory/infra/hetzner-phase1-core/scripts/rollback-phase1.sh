#!/usr/bin/env bash
# rollback-phase1.sh — image snapshot & rollback for phase-1 compose.
#
# Run from lobster-factory/infra/hetzner-phase1-core/ on the VPS.
#
# COMMANDS
#   save    <service>              snapshot :local image before a deploy
#   restore <service> [snapshot]   re-tag snapshot → :local and restart (default: latest)
#   list    [service]              list available snapshots (all or one service)
#   clean   <service> [days]       remove snapshots older than N days (default: 30)
#   n8n-pin <semver-tag>           update N8N_IMAGE_TAG in .env and restart n8n
#
# LOCAL-BUILD services: wordpress | node-api | next-admin
# EXTERNAL services (n8n): use n8n-pin.
# Other external (nginx, redis, mariadb): manual .env image tag edit + docker compose pull.
#
# Environment overrides:
#   ROLLBACK_HEALTH_TIMEOUT=<seconds>  how long to wait for healthcheck (default: 90)
#
# Audit log: ./rollback.log (append-only; include entry in WORKLOG evidence).
# Owner doc: agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md
# Image pin policy: LONG_TERM_OPS.md §3

set -euo pipefail

[[ "${BASH_VERSINFO[0]}" -ge 4 ]] || { echo "ERROR: bash 4+ required (got ${BASH_VERSION})"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGFILE="$ROOT/rollback.log"
ENV_FILE="$ROOT/.env"
STAMP="$(date +%Y%m%d-%H%M%S)"
HEALTH_TIMEOUT="${ROLLBACK_HEALTH_TIMEOUT:-90}"

declare -A IMAGE_MAP=(
  [wordpress]="lobster-phase1-wordpress"
  [node-api]="lobster-phase1-node-api"
  [next-admin]="lobster-phase1-next-admin"
)

# ---------- helpers ----------

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"; }
die() { echo "ERROR: $*" >&2; exit 1; }

require_env() {
  [[ -f "$ENV_FILE" ]] || die ".env not found at $ENV_FILE — copy from .env.example first."
}

image_exists() { docker image inspect "$1" > /dev/null 2>&1; }

# Wait for a service's Docker healthcheck to pass (uses docker inspect — no curl/wget needed).
wait_healthy() {
  local svc="$1" elapsed=0 cname hc status
  cname=$(docker compose --env-file "$ENV_FILE" ps -q "$svc" 2>/dev/null | head -1 || true)
  [[ -z "$cname" ]] && { echo "  (container not found after up — inspect logs)"; return 1; }
  hc=$(docker inspect --format='{{if .Config.Healthcheck}}yes{{end}}' "$cname" 2>/dev/null || true)
  if [[ "$hc" != "yes" ]]; then
    echo "  (no healthcheck on $svc)"
    return 0
  fi
  echo -n "  Waiting for $svc health"
  while true; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$cname" 2>/dev/null || echo "unknown")
    case "$status" in
      healthy)   echo " PASS (${elapsed}s)"; return 0 ;;
      unhealthy) echo " FAIL"; return 1 ;;
    esac
    sleep 3; elapsed=$(( elapsed + 3 ))
    printf "."
    if [[ $elapsed -ge $HEALTH_TIMEOUT ]]; then
      echo " TIMEOUT (${HEALTH_TIMEOUT}s)"
      return 1
    fi
  done
}

usage() {
  cat <<'EOF'
Usage:
  rollback-phase1.sh save    <service>              snapshot :local before deploy
  rollback-phase1.sh restore <service> [snapshot]   roll back (default: latest snapshot)
  rollback-phase1.sh list    [service]              list available snapshots
  rollback-phase1.sh clean   <service> [days]       prune snapshots older than N days (default: 30)
  rollback-phase1.sh n8n-pin <semver>               update N8N_IMAGE_TAG in .env and restart n8n

Local-build services: wordpress | node-api | next-admin
Env: ROLLBACK_HEALTH_TIMEOUT=<sec> (default: 90)
EOF
  exit 1
}

# ---------- main ----------

cmd="${1:-}"
[[ -z "$cmd" ]] && usage

case "$cmd" in

  save)
    svc="${2:-}"; [[ -z "$svc" ]] && { echo "ERROR: service name required"; usage; }
    img="${IMAGE_MAP[$svc]:-}"
    [[ -z "$img" ]] && die "unknown local-build service '$svc'. Valid: ${!IMAGE_MAP[*]}"
    image_exists "$img:local" || die "$img:local not found — build first: docker compose --env-file .env build $svc"
    snapshot_tag="rollback-$STAMP"
    docker tag "$img:local" "$img:$snapshot_tag"
    log "save | service=$svc | snapshot=$img:$snapshot_tag | user=${USER:-unknown}"
    echo "Saved: $img:$snapshot_tag"
    ;;

  restore)
    svc="${2:-}"; [[ -z "$svc" ]] && { echo "ERROR: service name required"; usage; }
    img="${IMAGE_MAP[$svc]:-}"
    [[ -z "$img" ]] && die "unknown local-build service '$svc'. Valid: ${!IMAGE_MAP[*]}"
    require_env

    if [[ -n "${3:-}" ]]; then
      snapshot_tag="$3"
    else
      snapshot_tag=$(docker images --format '{{.Tag}}' "$img" 2>/dev/null \
        | grep '^rollback-' | sort -r | head -1 || true)
      [[ -z "$snapshot_tag" ]] && die "no rollback snapshot for $img — run 'save' before deploying."
    fi

    image_exists "$img:$snapshot_tag" || die "snapshot $img:$snapshot_tag not found (run 'list' to see available)"
    echo "Restoring $img:$snapshot_tag → $img:local …"
    docker tag "$img:$snapshot_tag" "$img:local"
    cd "$ROOT"
    docker compose --env-file .env up -d --no-build "$svc"
    log "restore | service=$svc | from=$img:$snapshot_tag | user=${USER:-unknown}"
    if wait_healthy "$svc"; then
      log "health | service=$svc | status=PASS"
    else
      log "health | service=$svc | status=FAIL"
      echo "WARNING: health check did not pass — inspect logs: docker compose logs $svc"
    fi
    echo "Rollback done. Verify: docker compose ps"
    ;;

  list)
    svc="${2:-}"
    if [[ -n "$svc" ]]; then
      img="${IMAGE_MAP[$svc]:-}"; [[ -z "$img" ]] && die "unknown service '$svc'"
      docker images --format '{{.Repository}}:{{.Tag}}  {{.CreatedAt}}  {{.Size}}' "$img" \
        | grep 'rollback-' || echo "(no snapshots for $svc)"
    else
      for s in "${!IMAGE_MAP[@]}"; do
        img="${IMAGE_MAP[$s]}"
        echo "=== $s ($img) ==="
        docker images --format '  {{.Repository}}:{{.Tag}}  {{.CreatedAt}}' "$img" \
          | grep 'rollback-' || echo "  (none)"
      done
    fi
    ;;

  clean)
    svc="${2:-}"; [[ -z "$svc" ]] && { echo "ERROR: service name required"; usage; }
    img="${IMAGE_MAP[$svc]:-}"
    [[ -z "$img" ]] && die "unknown local-build service '$svc'. Valid: ${!IMAGE_MAP[*]}"
    days="${3:-30}"
    [[ "$days" =~ ^[0-9]+$ ]] || die "days must be a positive integer (got '$days')"
    cutoff=$(date -d "$days days ago" +%Y%m%d 2>/dev/null) \
      || die "date -d failed — GNU date required (Linux only)"
    removed=0
    while IFS= read -r tag; do
      tag_date="${tag#rollback-}"    # rollback-YYYYMMDD-HHMMSS → YYYYMMDD-HHMMSS
      tag_date="${tag_date%%-*}"     # YYYYMMDD-HHMMSS → YYYYMMDD
      [[ ${#tag_date} -eq 8 ]] || continue
      if [[ "$tag_date" < "$cutoff" ]]; then
        echo "  Removing $img:$tag"
        docker rmi "$img:$tag" 2>/dev/null \
          && removed=$(( removed + 1 )) \
          || echo "  (skipped — $img:$tag may be in use)"
      fi
    done < <(docker images --format '{{.Tag}}' "$img" 2>/dev/null | grep '^rollback-' || true)
    log "clean | service=$svc | days=$days | removed=$removed | user=${USER:-unknown}"
    echo "Done: removed $removed snapshot(s) older than $days days."
    ;;

  n8n-pin)
    tag="${2:-}"; [[ -z "$tag" ]] && { echo "ERROR: semver tag required (e.g. 2.18.5)"; exit 1; }
    [[ "$tag" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-zA-Z0-9._-]+)?$ ]] \
      || die "tag '$tag' does not look like semver (expected e.g. 2.18.5)"
    require_env
    cp "$ENV_FILE" "${ENV_FILE}.bak"
    old_tag=$(grep '^N8N_IMAGE_TAG=' "$ENV_FILE" | cut -d= -f2 || echo "(unset)")
    if grep -q '^N8N_IMAGE_TAG=' "$ENV_FILE"; then
      sed -i "s|^N8N_IMAGE_TAG=.*|N8N_IMAGE_TAG=$tag|" "$ENV_FILE"
    else
      printf '\nN8N_IMAGE_TAG=%s\n' "$tag" >> "$ENV_FILE"
    fi
    cd "$ROOT"
    docker compose --env-file .env pull n8n
    docker compose --env-file .env up -d n8n
    log "n8n-pin | old=$old_tag | new=$tag | backup=${ENV_FILE}.bak | user=${USER:-unknown}"
    echo "n8n pinned to $tag. Backup: ${ENV_FILE}.bak. Verify: curl -sf http://127.0.0.1/n8n/healthz"
    ;;

  *)
    echo "ERROR: unknown command '$cmd'"
    usage
    ;;
esac
