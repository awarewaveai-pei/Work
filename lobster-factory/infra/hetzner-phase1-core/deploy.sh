#!/bin/bash
# deploy.sh — Update and restart services on 5.223.93.113
# Usage:
#   ./deploy.sh                  # Pull latest + restart all changed containers
#   ./deploy.sh next-admin       # Rebuild + restart only next-admin
#   ./deploy.sh node-api         # Rebuild + restart only node-api
#   ./deploy.sh --apache         # Sync Apache vhosts + reload apache2
#
# Run from: /root/Work/lobster-factory/infra/hetzner-phase1-core

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── Apache vhost sync ─────────────────────────────────────────────────────
if [[ "${1:-}" == "--apache" ]]; then
    log "Syncing Apache vhosts..."
    for f in apache/sites-available/*.conf; do
        name=$(basename "$f")
        cp "$f" "/etc/apache2/sites-available/$name"
        a2ensite "$name" 2>/dev/null || true
        log "  installed: $name"
    done
    apachectl configtest || err "Apache config has errors — NOT reloading"
    systemctl reload apache2
    log "Apache reloaded."
    exit 0
fi

# ── Git pull ──────────────────────────────────────────────────────────────
log "Pulling latest from main..."
# .env is gitignored — safe to reset tracked files
git fetch origin main
git reset --hard origin/main
log "Code updated to $(git rev-parse --short HEAD)"

# ── Docker build + restart ────────────────────────────────────────────────
if [[ -z "${1:-}" ]]; then
    log "Building all services..."
    docker compose --env-file .env build
    log "Starting all services..."
    docker compose --env-file .env up -d
else
    SERVICE="$1"
    log "Rebuilding $SERVICE..."
    docker compose --env-file .env build "$SERVICE"
    log "Restarting $SERVICE..."
    docker compose --env-file .env up -d "$SERVICE"
fi

# ── Status ────────────────────────────────────────────────────────────────
log "Done. Container status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAME|lobster|trigger-webapp|trigger-supervisor" || true
