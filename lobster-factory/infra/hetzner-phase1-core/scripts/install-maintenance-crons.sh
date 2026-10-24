#!/usr/bin/env bash
# Idempotent maintenance installer for the host (rebuilds and re-runs).
# Schedules are NOT written here any more: since 2026-10-24 every schedule we own lives in scripts/cron.d/*
# and install-host-schedules.sh installs them (each line runs through cron-run.sh so /ops/schedules shows the
# outcome). This script installs the helper binaries, the wp-cron-runner logrotate + dead-man registration,
# then calls install-host-schedules.sh, then tightens .env / backup dir permissions.
#
# Usage (run as root on the host):
#   bash /root/lobster-phase1/scripts/install-maintenance-crons.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== install-maintenance-crons START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "Compose root : ${COMPOSE_ROOT}"
echo ""

# cron.d/awarewave-schedules calls /usr/local/bin/docker-weekly-cleanup.sh.
install -m 0755 "${SCRIPT_DIR}/docker-weekly-cleanup.sh" /usr/local/bin/docker-weekly-cleanup.sh
echo "  Installed /usr/local/bin/docker-weekly-cleanup.sh"

# Host schedules first: its backup must capture the cron files as they were before anything here rewrites them.
echo ""
echo "--- Host schedules (scripts/cron.d -> /etc/cron.d) ---"
bash "${SCRIPT_DIR}/install-host-schedules.sh"

echo ""
echo "--- WordPress cron runner (logrotate + dead-man registration) ---"
"${SCRIPT_DIR}/wp-cron-runner.sh" --install


# ══════════════════════════════════════════════════════════════════════════════
# 4. Security hardening
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "--- Security hardening ---"

# .env files: restrict to owner-only (644 → 600)
ENV_FILES=("${COMPOSE_ROOT}/.env")
# Also check for staging and backup .env files
for CANDIDATE in "${COMPOSE_ROOT}/.env.staging" "${COMPOSE_ROOT}/.env.local"; do
  [[ -f "$CANDIDATE" ]] && ENV_FILES+=("$CANDIDATE")
done

for ENV_FILE in "${ENV_FILES[@]}"; do
  if [[ -f "$ENV_FILE" ]]; then
    CURRENT_PERM=$(stat -c '%a' "$ENV_FILE")
    if [[ "$CURRENT_PERM" != "600" ]]; then
      chmod 600 "$ENV_FILE"
      echo "  Fixed: ${ENV_FILE} (${CURRENT_PERM} -> 600)"
    else
      echo "  OK: ${ENV_FILE} already 600"
    fi
  fi
done

# Backup directory: restrict to owner-only
if [[ -f "${COMPOSE_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "${COMPOSE_ROOT}/.env" && set +a
fi
BACKUP_DIR="${BACKUP_DIR:-${COMPOSE_ROOT}/backups}"
if [[ -d "$BACKUP_DIR" ]]; then
  chmod 700 "$BACKUP_DIR"
  echo "  OK: ${BACKUP_DIR} mode 700"
else
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  echo "  Created: ${BACKUP_DIR} (mode 700)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 5. Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "=== install-maintenance-crons DONE $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
bash "${SCRIPT_DIR}/install-host-schedules.sh" --check && echo "Host schedules: in sync with scripts/cron.d" || true
