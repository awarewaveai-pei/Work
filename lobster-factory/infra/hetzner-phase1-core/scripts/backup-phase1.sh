#!/usr/bin/env bash
# Phase-1 daily backup: WordPress DB + uploads + n8n volume.
# Designed for unattended cron execution with retention + optional offsite.
# Does NOT replace your Supabase backup strategy.
#
# Environment (from .env or shell):
#   BACKUP_DIR           — output root (default: ./backups, absolute recommended for cron)
#   BACKUP_RETAIN_DAYS   — delete local backups older than N days (default: 7)
#   R2_PREFIX            — R2 key prefix (default sg-stack); token from /etc/default/eu-backup
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

# --- 1. WordPress DBs: the site's own plus every staging site's (provision-staging creates wp_s_<site id>) ---
# --databases: one dump carries every database on this server with its CREATE DATABASE, so a staging site added later
# is backed up without a change here; backup-restore-drill.py fails a database prod has and this dump lacks.
DBS="$(docker exec lobster-wordpress-db mariadb -u root -p"${WORDPRESS_DB_ROOT_PASSWORD}" -N -B -e "SHOW DATABASES" \
  | grep -vxE 'information_schema|mysql|performance_schema|sys' | tr '\n' ' ' || true)"
log "Dumping MariaDB (${DBS:-none found})..."
if [[ " ${DBS} " == *" ${WORDPRESS_DB_NAME} "* ]] && docker exec lobster-wordpress-db mariadb-dump \
  -u root -p"${WORDPRESS_DB_ROOT_PASSWORD}" \
  --single-transaction \
  --quick \
  --databases ${DBS} | gzip > "${OUT}/wordpress-db.sql.gz"; then
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

# --- 5. Offsite upload: Cloudflare R2 via REST (MANDATORY, 2026-08-28) ---
# History: this leg was rclone -> `eu-backup:` (SFTP to the EU peer VPS). The
# 2026-08-28 consolidation retired both peers onto ks-aw-01, so the peer remote
# is gone; the machine's rclone S3 remote turned out to be a dead config
# (AccessDenied on every call - never actually used). The path that IS proven
# daily on this host is upload-to-r2.sh (REST + bearer token) - the same leg
# the soulful and stack pipelines use. One uploader, three pipelines.
# R2 is the ONLY offsite in single-machine topology => failure is a hard failure.
R2_PREFIX="${R2_PREFIX:-sg-stack}"
export R2_PREFIX
if [[ -z "${R2_API_TOKEN:-}" && -r /etc/default/eu-backup ]]; then
  # machine-local R2 credential file (shared by all three backup pipelines)
  set -a; source /etc/default/eu-backup; set +a
fi
OFFSITE_OK=false
if [[ -z "${R2_API_TOKEN:-}" ]]; then
  log "  ERROR: R2_API_TOKEN not set - no offsite copy possible"
elif [[ ! -x /root/scripts/upload-to-r2.sh ]]; then
  log "  ERROR: /root/scripts/upload-to-r2.sh missing or not executable"
else
  log "Uploading to R2: lobster-backup/${R2_PREFIX}/${DATE}/ ..."
  if /root/scripts/upload-to-r2.sh "${OUT}" "${DATE}" 2>&1; then
    log "  R2 upload OK"
    OFFSITE_OK=true
  else
    log "  ERROR: R2 upload failed"
  fi
fi

# --- 6. Retention cleanup (only after successful local backup) ---
if [[ "${BACKUP_RETAIN_DAYS}" -gt 0 ]]; then
  # -name '20[0-9][0-9]...' is NOT cosmetic: retention must only ever delete
  # snapshots THIS script created. Without it, `find -maxdepth 1 -type d` matches
  # EVERY directory in BACKUP_DIR, including long-lived ones other processes put
  # there. That is not hypothetical: on 2026-08-24 02:32 UTC this exact line on EU
  # deleted /root/backups/clients/ -- the entire 769 MB soulfulexpression.org
  # migration safety net (DB + uploads + code) -- 7 days after its mtime went
  # static, silently, with every health check still reporting PASS.
  # Still in the blast radius today: `from-sg/` on EU and `from-eu/` on SG, the
  # cross-VPS offsite copies. They survive only because daily rsync keeps their
  # mtime fresh -- meaning "the peer host has been down for a week" would trigger
  # "delete all of the peer's offsite backups", precisely when they are needed.
  # Invariant: a cleanup job may only delete what it created.
  _snap_glob='20[0-9][0-9][01][0-9][0-3][0-9]-[0-2][0-9][0-5][0-9][0-5][0-9]'
  DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "$_snap_glob" -mtime +"${BACKUP_RETAIN_DAYS}" 2>/dev/null | wc -l)
  if [[ "$DELETED" -gt 0 ]]; then
    find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "$_snap_glob" -mtime +"${BACKUP_RETAIN_DAYS}" -exec rm -rf {} + 2>/dev/null || true
    log "Retention: deleted ${DELETED} backup(s) older than ${BACKUP_RETAIN_DAYS} days"
  else
    log "Retention: nothing to clean (keep ${BACKUP_RETAIN_DAYS} days)"
  fi
fi

# --- 7. Summary ---
TOTAL_SIZE=$(du -sh "${OUT}" | cut -f1)
log "=== Backup complete: ${OUT} (${TOTAL_SIZE}) ==="
log "  Local retention: ${BACKUP_RETAIN_DAYS} days"
log "  Offsite: R2 lobster-backup/${R2_PREFIX}/${DATE}/"

if [[ "$OFFSITE_OK" == "false" ]]; then
  log "WARNING: Local backup OK but offsite failed. Data is NOT replicated."
  exit 2
fi

log "DB restore drill command (verify in staging first):"
log "  gunzip -c wordpress-db.sql.gz | docker exec -i lobster-wordpress-db mariadb -u root -p\"***\" ${WORDPRESS_DB_NAME}"
