#!/usr/bin/env bash
# rollback-phase1.sh — image snapshot & rollback for phase-1 compose.
#
# Run from lobster-factory/infra/hetzner-phase1-core/ on the VPS.
#
# COMMANDS
#   save    <service>              snapshot :local image before a deploy
#   restore <service> [snapshot]   re-tag snapshot → :local and restart (default: latest)
#   list    [service]              list available snapshots (all or one service)
#   n8n-pin <semver-tag>           update N8N_IMAGE_TAG in .env and restart n8n
#
# LOCAL-BUILD services: wordpress | node-api | next-admin
# EXTERNAL services (n8n, nginx, redis, wordpress-db): use n8n-pin or manual .env edit.
#
# Audit log: ./rollback.log (append-only; include in WORKLOG evidence).
# Owner doc: agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md
# Image pin policy: LONG_TERM_OPS.md §3

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGFILE="$ROOT/rollback.log"
ENV_FILE="$ROOT/.env"
STAMP="$(date +%Y%m%d-%H%M%S)"

declare -A IMAGE_MAP=(
  [wordpress]="lobster-phase1-wordpress"
  [node-api]="lobster-phase1-node-api"
  [next-admin]="lobster-phase1-next-admin"
)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"; }

usage() {
  cat <<'EOF'
Usage:
  rollback-phase1.sh save    <service>              snapshot :local before deploy
  rollback-phase1.sh restore <service> [snapshot]   roll back to snapshot (default: latest)
  rollback-phase1.sh list    [service]              list available snapshots
  rollback-phase1.sh n8n-pin <tag>                  update N8N_IMAGE_TAG in .env, restart n8n

Local-build services: wordpress | node-api | next-admin
EOF
  exit 1
}

cmd="${1:-}"
[[ -z "$cmd" ]] && usage

case "$cmd" in

  save)
    svc="${2:-}"
    [[ -z "$svc" ]] && { echo "ERROR: service name required"; usage; }
    img="${IMAGE_MAP[$svc]:-}"
    [[ -z "$img" ]] && { echo "ERROR: unknown local-build service '$svc'. Valid: ${!IMAGE_MAP[*]}"; exit 1; }
    snapshot_tag="rollback-$STAMP"
    docker tag "$img:local" "$img:$snapshot_tag"
    log "save | service=$svc | snapshot=$img:$snapshot_tag | user=${USER:-unknown}"
    echo "Saved: $img:$snapshot_tag"
    ;;

  restore)
    svc="${2:-}"
    [[ -z "$svc" ]] && { echo "ERROR: service name required"; usage; }
    img="${IMAGE_MAP[$svc]:-}"
    [[ -z "$img" ]] && { echo "ERROR: unknown local-build service '$svc'. Valid: ${!IMAGE_MAP[*]}"; exit 1; }

    if [[ -n "${3:-}" ]]; then
      snapshot_tag="$3"
    else
      snapshot_tag=$(docker images --format '{{.Tag}}' "$img" 2>/dev/null \
        | grep '^rollback-' | sort -r | head -1 || true)
      [[ -z "$snapshot_tag" ]] && { echo "ERROR: no rollback snapshot found for $img. Run 'save' before deploying."; exit 1; }
    fi

    echo "Restoring $img:$snapshot_tag → $img:local …"
    docker tag "$img:$snapshot_tag" "$img:local"
    cd "$ROOT"
    docker compose --env-file .env up -d --no-build "$svc"
    log "restore | service=$svc | from=$img:$snapshot_tag | user=${USER:-unknown}"
    echo "Done. Verify: docker compose ps && curl -sf http://127.0.0.1/health"
    ;;

  list)
    svc="${2:-}"
    if [[ -n "$svc" ]]; then
      img="${IMAGE_MAP[$svc]:-}"
      [[ -z "$img" ]] && { echo "ERROR: unknown service '$svc'"; exit 1; }
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

  n8n-pin)
    tag="${2:-}"
    [[ -z "$tag" ]] && { echo "ERROR: semver tag required (e.g. 2.18.5)"; exit 1; }
    [[ ! -f "$ENV_FILE" ]] && { echo "ERROR: .env not found at $ENV_FILE"; exit 1; }
    old_tag=$(grep '^N8N_IMAGE_TAG=' "$ENV_FILE" | cut -d= -f2 || echo "(unset)")
    sed -i "s|^N8N_IMAGE_TAG=.*|N8N_IMAGE_TAG=$tag|" "$ENV_FILE"
    cd "$ROOT"
    docker compose --env-file .env pull n8n
    docker compose --env-file .env up -d n8n
    log "n8n-pin | old=$old_tag | new=$tag | user=${USER:-unknown}"
    echo "n8n pinned to $tag. Verify: curl -sf http://127.0.0.1/n8n/healthz"
    ;;

  *)
    echo "ERROR: unknown command '$cmd'"
    usage
    ;;
esac
