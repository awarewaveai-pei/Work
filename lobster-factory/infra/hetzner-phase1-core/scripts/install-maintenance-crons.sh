#!/usr/bin/env bash
# Idempotent maintenance cron installer for Phase 1 VPS hosts.
# Safe to re-run on fresh servers AND on existing servers that already have
# cron entries in root's crontab (the script upgrades binaries in place
# and does NOT create duplicate entries in /etc/cron.d/).
#
# Usage (run as root on the target VPS):
#   bash /path/to/hetzner-phase1-core/scripts/install-maintenance-crons.sh [--host sg|eu]
#
# If --host is omitted, the script auto-detects based on `hostname`.
#
# Installed schedules (UTC):
#   SG (phase1 stack):
#     Daily  02:00 — backup-phase1.sh
#     Daily  02:30 — verify-backup.sh
#     Sunday 03:00 — docker-weekly-cleanup.sh
#     Monthly 04:10 on day 1 — sync-events-monthly.sh
#   EU (Supabase/Trigger stack):
#     Daily  02:30 — backup-phase1.sh
#     Daily  03:00 — verify-backup.sh
#     Sunday 03:30 — docker-weekly-cleanup.sh
#
# After a server rebuild, re-run this script to restore all maintenance crons.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── detect host ───────────────────────────────────────────────────────────────
HOST_TYPE="${1:-}"
if [[ "$HOST_TYPE" == "--host" ]]; then
  HOST_TYPE="${2:-}"
  shift 2 2>/dev/null || true
fi

if [[ -z "$HOST_TYPE" ]]; then
  HN="$(hostname)"
  case "$HN" in
    *sg*|*phase1*|*lobster*|*sin*) HOST_TYPE="sg" ;;
    *eu*|*supabase*|*trigger*|*hel*) HOST_TYPE="eu" ;;
    *) HOST_TYPE="sg"
       echo "WARN: cannot detect host type from hostname '${HN}', defaulting to sg." ;;
  esac
fi

case "$HOST_TYPE" in
  sg) CLEANUP_MIN=0;  CLEANUP_HOUR=3;  BACKUP_MIN=0;  BACKUP_HOUR=2;  VERIFY_MIN=30; VERIFY_HOUR=2  ;;
  eu) CLEANUP_MIN=30; CLEANUP_HOUR=3;  BACKUP_MIN=30; BACKUP_HOUR=2;  VERIFY_MIN=0;  VERIFY_HOUR=3  ;;
  *)  echo "ERROR: unknown host type '${HOST_TYPE}'. Use --host sg|eu." >&2; exit 1 ;;
esac

echo "=== install-maintenance-crons START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "Host type    : ${HOST_TYPE}"
echo "Compose root : ${COMPOSE_ROOT}"
echo ""

# ── helper: install a script to /usr/local/bin/ ───────────────────────────────
install_script() {
  local name="$1"
  local src="${SCRIPT_DIR}/${name}"
  local dest="/usr/local/bin/${name}"
  if [[ ! -f "$src" ]]; then
    echo "  WARN: ${src} not found — skipping ${name}"
    return 1
  fi
  install -m 0755 "$src" "$dest"
  echo "  Installed ${dest}"
  return 0
}

# ── helper: write or update /etc/cron.d/ entry (idempotent) ───────────────────
# Also checks root's personal crontab for legacy entries.
ensure_cron() {
  local cron_file="$1"    # e.g. /etc/cron.d/lobster-backup
  local marker="$2"       # unique string to grep for (e.g. backup-phase1.sh)
  local entry="$3"        # full cron line
  local label="$4"        # human label for logging

  local in_crond=false
  local in_root=false

  [[ -f "$cron_file" ]] && grep -q "$marker" "$cron_file" 2>/dev/null && in_crond=true
  crontab -l 2>/dev/null | grep -q "$marker" 2>/dev/null && in_root=true

  if $in_root && ! $in_crond; then
    echo "  INFO: ${label} found in root crontab — skipping /etc/cron.d/ (no duplicate)."
    echo "        To migrate: remove root crontab line, then re-run this script."
  elif $in_crond; then
    # Update existing entry (schedule may have changed)
    sed -i "/${marker}/c\\${entry}" "$cron_file"
    echo "  Updated: ${label} in ${cron_file}"
  else
    # Append to cron file
    echo "${entry}" >> "$cron_file"
    echo "  Added: ${label}"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# 1. Docker weekly cleanup (existing)
# ══════════════════════════════════════════════════════════════════════════════
echo "--- Docker weekly cleanup ---"
install_script "docker-weekly-cleanup.sh" || true

CLEANUP_CRON_FILE="/etc/cron.d/docker-weekly-cleanup"
CLEANUP_ENTRY="${CLEANUP_MIN} ${CLEANUP_HOUR} * * 0 root /usr/local/bin/docker-weekly-cleanup.sh >> /var/log/docker-weekly-cleanup.log 2>&1"

if [[ ! -f "$CLEANUP_CRON_FILE" ]] || ! grep -q "docker-weekly-cleanup" "$CLEANUP_CRON_FILE" 2>/dev/null; then
  # Check root crontab for legacy
  if crontab -l 2>/dev/null | grep -q "docker-weekly-cleanup" 2>/dev/null; then
    echo "  INFO: cleanup found in root crontab — skipping /etc/cron.d/"
  else
    cat > "$CLEANUP_CRON_FILE" <<CREOF
# Managed by install-maintenance-crons.sh — do not edit manually.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${CLEANUP_ENTRY}
CREOF
    chmod 0644 "$CLEANUP_CRON_FILE"
    echo "  Written: ${CLEANUP_CRON_FILE}"
  fi
else
  sed -i "/docker-weekly-cleanup/c\\${CLEANUP_ENTRY}" "$CLEANUP_CRON_FILE"
  echo "  Updated: ${CLEANUP_CRON_FILE}"
fi
echo "  Schedule: Sunday ${CLEANUP_HOUR}:$(printf '%02d' ${CLEANUP_MIN}) UTC"

# ══════════════════════════════════════════════════════════════════════════════
# 2. Daily backup + verification
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "--- Daily backup & verification ---"

# Scripts run from compose root (they source .env from there)
BACKUP_SCRIPT="${COMPOSE_ROOT}/scripts/backup-phase1.sh"
VERIFY_SCRIPT="${COMPOSE_ROOT}/scripts/verify-backup.sh"

for SCRIPT in "$BACKUP_SCRIPT" "$VERIFY_SCRIPT"; do
  if [[ -f "$SCRIPT" ]]; then
    chmod +x "$SCRIPT"
    echo "  Executable: ${SCRIPT}"
  else
    echo "  WARN: ${SCRIPT} not found"
  fi
done

BACKUP_CRON_FILE="/etc/cron.d/lobster-backup"
BACKUP_ENTRY="${BACKUP_MIN} ${BACKUP_HOUR} * * * root ${BACKUP_SCRIPT} >> /var/log/lobster-backup.log 2>&1"
VERIFY_ENTRY="${VERIFY_MIN} ${VERIFY_HOUR} * * * root ${VERIFY_SCRIPT} >> /var/log/lobster-backup.log 2>&1"

# Write or update the cron file
cat > "$BACKUP_CRON_FILE" <<CREOF
# Managed by install-maintenance-crons.sh — do not edit manually.
# Re-run the script to change schedule or recover after server rebuild.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Daily backup: WordPress DB + uploads + n8n volume
${BACKUP_ENTRY}

# Daily verification: integrity + offsite check (30 min after backup)
${VERIFY_ENTRY}
CREOF
chmod 0644 "$BACKUP_CRON_FILE"

echo "  Written: ${BACKUP_CRON_FILE}"
echo "  Backup:  daily ${BACKUP_HOUR}:$(printf '%02d' ${BACKUP_MIN}) UTC"
echo "  Verify:  daily ${VERIFY_HOUR}:$(printf '%02d' ${VERIFY_MIN}) UTC"
echo "  Log:     /var/log/lobster-backup.log"

# ══════════════════════════════════════════════════════════════════════════════
# 3. Monthly global events cache refresh (SG only)
# ══════════════════════════════════════════════════════════════════════════════
if [[ "$HOST_TYPE" == "sg" ]]; then
  echo ""
  echo "--- Monthly events cache sync ---"
  EVENTS_SCRIPT="${COMPOSE_ROOT}/scripts/sync-events-monthly.sh"
  if [[ -f "$EVENTS_SCRIPT" ]]; then
    chmod +x "$EVENTS_SCRIPT"
    EVENTS_CRON_FILE="/etc/cron.d/lobster-events-sync"
    EVENTS_ENTRY="10 4 1 * * root COMPOSE_ROOT=${COMPOSE_ROOT} ${EVENTS_SCRIPT} >> /var/log/lobster-events-sync.log 2>&1"
    cat > "$EVENTS_CRON_FILE" <<CREOF
# Managed by install-maintenance-crons.sh — do not edit manually.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Monthly global events cache refresh for next-admin Studio.
${EVENTS_ENTRY}
CREOF
    chmod 0644 "$EVENTS_CRON_FILE"
    echo "  Written: ${EVENTS_CRON_FILE}"
    echo "  Schedule: monthly day 1 04:10 UTC"
    echo "  Log:      /var/log/lobster-events-sync.log"
  else
    echo "  WARN: ${EVENTS_SCRIPT} not found"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# 3b. WordPress scheduler for DISABLE_WP_CRON sites (every host; the script owns its own schedule)
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "--- WordPress cron runner ---"
if [[ -f "${COMPOSE_ROOT}/scripts/wp-cron-runner.sh" ]]; then
  chmod +x "${COMPOSE_ROOT}/scripts/wp-cron-runner.sh"
  "${COMPOSE_ROOT}/scripts/wp-cron-runner.sh" --install
else
  echo "  WARN: ${COMPOSE_ROOT}/scripts/wp-cron-runner.sh not found"
fi

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
echo ""
echo "Active cron files:"
for CF in /etc/cron.d/docker-weekly-cleanup /etc/cron.d/lobster-backup /etc/cron.d/lobster-events-sync; do
  if [[ -f "$CF" ]]; then
    echo "  ${CF}:"
    grep -v '^#' "$CF" | grep -v '^$' | grep -v '^SHELL' | grep -v '^PATH' | sed 's/^/    /'
  fi
done
echo ""
echo "Root crontab entries (if any):"
crontab -l 2>/dev/null | grep -E "backup|cleanup|verify|events-sync" | sed 's/^/    /' || echo "    (none)"
echo ""
echo "To test backup immediately:"
echo "  ${BACKUP_SCRIPT}"
echo "  ${VERIFY_SCRIPT}"
echo "  tail -50 /var/log/lobster-backup.log"
echo ""
echo "To enable offsite backup:"
echo "  1. apt install rclone"
echo "  2. rclone config  (add B2/S3/Hetzner Object Storage remote)"
echo "  3. Add to ${COMPOSE_ROOT}/.env:"
echo "       RCLONE_REMOTE=remote:your-bucket/lobster-phase1"
echo "  4. Test: rclone ls remote:your-bucket/"
echo "  5. Next daily backup will auto-upload"
