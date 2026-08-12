#!/usr/bin/env bash
# Phase-1 daily backup: WordPress DB + uploads + n8n volume.
# Designed for unattended cron execution with retention + optional offsite.
# Does NOT replace your Supabase backup strategy.
#
# Environment (from .env or shell):
#   BACKUP_DIR           — output root (default: ./backups, absolute recommended for cron)
#   BACKUP_RETAIN_DAYS   — delete local backups older than N days (default: 7)
#   RCLONE_REMOTE        — rclone destination (e.g. b2:bucket/lobster-phase1); empty = skip
#   OFFSITE_RETAIN_DAYS  — purge offsite copies older than N days (default: 14)
#   WORDPRESS_DB_NAME    — database name (required)
#   WORDPRESS_DB_ROOT_PASSWORD — root password (required)
#
# Usage:
#   Manual:  cd /root/lobster-phase1 && ./scripts/backup-phase1.sh
#   Cron:    installed by scripts/install-maintenance-crons.sh
#
# Exit codes:
#   0 = success (all steps including offsite if configured)
#   1 = dump/archive failure (critical)
#   2 = offsite upload failure (backup exists locally but not replicated)
#
# Design rules (LONG_TERM_OPS.md / AGENTS.md):
#   - State before side-effects: write files first, then upload
#   - Failures are loud (logged + exit non-zero so cron sends mail)
#   - Retention cleanup runs AFTER successful backup only
#   - Offsite failure does not delete local backup
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "FATAL: Missing .env in $ROOT — copy from .env.example first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && source ./.env && set +a

# --- config ---
STAMP="$(date +%Y%m%d-%H%M%S)"
DATE="$(date +%Y-%m-%d)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
OUT="${BACKUP_DIR}/${STAMP}"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }

mkdir -p "$OUT"
ERRORS=0

# --- 1. WordPress DB ---
log "Dumping MariaDB (${WORDPRESS_DB_NAME})..."
if docker exec lobster-wordpress-db mariadb-dump \
  -u root -p"${WORDPRESS_DB_ROOT_PASSWORD}" \
  --single-transaction \
  --quick \
  "${WORDPRESS_DB_NAME}" | gzip > "${OUT}/wordpress-db.sql.gz"; then
  # integrity check
  if gzip -t "${OUT}/wordpress-db.sql.gz" 2>/dev/null; then
    SIZE=$(du -h "${OUT}/wordpress-db.sql.gz" | cut -f1)
    log "  wordpress-db.sql.gz OK (${SIZE})"
  else
    log "  ERROR: wordpress-db.sql.gz failed integrity check"
    ERRORS=$((ERRORS + 1))
  fi
else
  log "  ERROR: MariaDB dump failed"
  ERRORS=$((ERRORS + 1))
fi

# --- 2. WordPress uploads ---
log "Archiving /var/www/html from wordpress container..."
if docker exec lobster-wordpress tar czf - -C /var/www/html . > "${OUT}/wp-html.tgz"; then
  if [[ -s "${OUT}/wp-html.tgz" ]]; then
    SIZE=$(du -h "${OUT}/wp-html.tgz" | cut -f1)
    log "  wp-html.tgz OK (${SIZE})"
  else
    log "  ERROR: wp-html.tgz is empty"
    ERRORS=$((ERRORS + 1))
  fi
else
  log "  ERROR: WordPress archive failed"
  ERRORS=$((ERRORS + 1))
fi

# --- 3. n8n volume (if container running) ---
if docker ps --format '{{.Names}}' | grep -q '^lobster-n8n$'; then
  log "Archiving n8n data volume..."
  if docker run --rm \
    -v lobster-phase1_n8n_data:/data:ro \
    -v "$(realpath "${OUT}")":/backup \
    alpine tar czf /backup/n8n-data.tgz -C /data . 2>/dev/null; then
    if [[ -s "${OUT}/n8n-data.tgz" ]]; then
      SIZE=$(du -h "${OUT}/n8n-data.tgz" | cut -f1)
      log "  n8n-data.tgz OK (${SIZE})"
    else
      log "  WARN: n8n-data.tgz is empty (volume may be empty)"
    fi
  else
    log "  WARN: n8n volume archive failed (non-fatal; n8n may not use named volume)"
  fi
else
  log "  SKIP: lobster-n8n not running"
fi

# --- 4. Abort if critical errors ---
if [[ $ERRORS -gt 0 ]]; then
  log "FATAL: ${ERRORS} critical error(s) during backup. Local backup at ${OUT} may be incomplete."
  exit 1
fi

# --- 5. Offsite upload (opt-in) ---
OFFSITE_OK=true
if [[ -n "${RCLONE_REMOTE}" ]]; then
  if command -v rclone &>/dev/null; then
    log "Uploading to offsite: ${RCLONE_REMOTE}/${DATE}/ ..."
    if rclone copy "${OUT}" "${RCLONE_REMOTE}/${DATE}/" --log-level NOTICE 2>&1; then
      log "  Offsite upload OK"
    else
      log "  ERROR: Offsite upload failed"
      OFFSITE_OK=false
    fi
  else
    log "  WARN: RCLONE_REMOTE set but rclone not installed — skipping offsite"
    OFFSITE_OK=false
  fi
else
  log "  SKIP: RCLONE_REMOTE not set — no offsite upload"
fi

# --- 5b. Offsite retention (purge the copies we pushed) ---
# Root cause 2026-08-12: section 6 below only prunes BACKUP_DIR on THIS host.
# The copies uploaded to the rclone remote were never purged -> 96 snapshots / 31G on EU.
# Rule: retention follows the producer. Whoever pushes a copy also prunes it.
# Only runs after a successful upload, so a failed push never deletes history.
OFFSITE_RETAIN_DAYS="${OFFSITE_RETAIN_DAYS:-14}"
if [[ "$OFFSITE_OK" == "true" && -n "${RCLONE_REMOTE}" && "${OFFSITE_RETAIN_DAYS}" -gt 0 ]]; then
  OFFSITE_CUTOFF="$(date -u -d "${OFFSITE_RETAIN_DAYS} days ago" +%Y-%m-%d)"
  OFFSITE_PRUNED=0
  while read -r offsite_dir; do
    [[ "$offsite_dir" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
    [[ "$offsite_dir" < "$OFFSITE_CUTOFF" ]] || continue
    if rclone purge "${RCLONE_REMOTE}/${offsite_dir}" >/dev/null 2>&1; then
      OFFSITE_PRUNED=$((OFFSITE_PRUNED + 1))
    else
      log "  WARN: offsite purge failed for ${offsite_dir} (non-fatal)"
    fi
  done < <(rclone lsf --dirs-only "${RCLONE_REMOTE}" 2>/dev/null | sed 's:/$::')
  log "Offsite retention: purged ${OFFSITE_PRUNED} snapshot(s) older than ${OFFSITE_CUTOFF} from ${RCLONE_REMOTE}"
fi

# --- 6. Retention cleanup (only after successful local backup) ---
if [[ "${BACKUP_RETAIN_DAYS}" -gt 0 ]]; then
  DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -mtime +"${BACKUP_RETAIN_DAYS}" 2>/dev/null | wc -l)
  if [[ "$DELETED" -gt 0 ]]; then
    find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -mtime +"${BACKUP_RETAIN_DAYS}" -exec rm -rf {} + 2>/dev/null || true
    log "Retention: deleted ${DELETED} backup(s) older than ${BACKUP_RETAIN_DAYS} days"
  else
    log "Retention: nothing to clean (keep ${BACKUP_RETAIN_DAYS} days)"
  fi
fi

# --- 7. Summary ---
TOTAL_SIZE=$(du -sh "${OUT}" | cut -f1)
log "=== Backup complete: ${OUT} (${TOTAL_SIZE}) ==="
log "  Local retention: ${BACKUP_RETAIN_DAYS} days"
[[ -n "${RCLONE_REMOTE}" ]] && log "  Offsite: ${RCLONE_REMOTE}/${DATE}/"

if [[ "$OFFSITE_OK" == "false" ]]; then
  log "WARNING: Local backup OK but offsite failed. Data is NOT replicated."
  exit 2
fi

log "DB restore drill command (verify in staging first):"
log "  gunzip -c wordpress-db.sql.gz | docker exec -i lobster-wordpress-db mariadb -u root -p\"***\" ${WORDPRESS_DB_NAME}"
