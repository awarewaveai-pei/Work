#!/usr/bin/env bash
# EU VPS daily backup: Supabase DB + Trigger DB + Uptime Kuma volume.
# Mirror of SG backup-phase1.sh design: retention + offsite + verify.
#
# Environment (from shell or /etc/default/eu-backup):
#   BACKUP_DIR           — output root (default: /root/backups)
#   BACKUP_RETAIN_DAYS   — delete local backups older than N days (default: 7)
#   OFFSITE_HOST         — SG VPS IP for cross-VPS backup (default: 5.223.93.113)
#   OFFSITE_KEY          — SSH key for offsite (default: /root/.ssh/backup_to_sg)
#   OFFSITE_DIR          — remote dir (default: /root/lobster-phase1/backups/from-eu)
#
# Cron: /etc/cron.d/eu-backup (02:30 UTC daily)
# Log:  /var/log/eu-backup.log
set -euo pipefail

[[ -f /etc/default/eu-backup ]] && source /etc/default/eu-backup

STAMP="$(date +%Y%m%d-%H%M%S)"
DATE="$(date +%Y-%m-%d)"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
OFFSITE_HOST="${OFFSITE_HOST:-5.223.93.113}"
OFFSITE_KEY="${OFFSITE_KEY:-/root/.ssh/backup_to_sg}"
OFFSITE_DIR="${OFFSITE_DIR:-/root/lobster-phase1/backups/from-eu}"
OUT="${BACKUP_DIR}/${STAMP}"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }

mkdir -p "$OUT"
ERRORS=0

# --- 1. Supabase Postgres (supabase_admin has full access) ---
log "Dumping Supabase Postgres (all databases via supabase_admin)..."
if docker exec supabase-db pg_dumpall -U supabase_admin 2>/dev/null | gzip > "${OUT}/supabase-all.sql.gz"; then
  if gzip -t "${OUT}/supabase-all.sql.gz" 2>/dev/null && [[ -s "${OUT}/supabase-all.sql.gz" ]]; then
    SIZE=$(du -h "${OUT}/supabase-all.sql.gz" | cut -f1)
    log "  supabase-all.sql.gz OK (${SIZE})"
  else
    log "  ERROR: supabase-all.sql.gz integrity failed or empty"
    ERRORS=$((ERRORS + 1))
  fi
else
  log "  ERROR: Supabase pg_dumpall failed"
  ERRORS=$((ERRORS + 1))
fi

# --- 2. Trigger.dev Postgres (user=trigger) ---
if docker ps --format '{{.Names}}' | grep -q '^trigger-postgres$'; then
  log "Dumping Trigger.dev Postgres (user=trigger)..."
  if docker exec trigger-postgres pg_dump -U trigger trigger 2>/dev/null | gzip > "${OUT}/trigger.sql.gz"; then
    if gzip -t "${OUT}/trigger.sql.gz" 2>/dev/null && [[ -s "${OUT}/trigger.sql.gz" ]]; then
      SIZE=$(du -h "${OUT}/trigger.sql.gz" | cut -f1)
      log "  trigger.sql.gz OK (${SIZE})"
    else
      log "  ERROR: trigger.sql.gz integrity failed or empty"
      ERRORS=$((ERRORS + 1))
    fi
  else
    log "  ERROR: Trigger pg_dump failed"
    ERRORS=$((ERRORS + 1))
  fi
else
  log "  SKIP: trigger-postgres not running"
fi

# --- 3. Uptime Kuma volume ---
if docker ps --format '{{.Names}}' | grep -q '^uptime-kuma$'; then
  log "Archiving Uptime Kuma data..."
  if docker run --rm -v uptime-kuma:/data:ro -v "$(realpath "${OUT}")":/backup \
    alpine tar czf /backup/uptime-kuma.tgz -C /data . 2>/dev/null; then
    if [[ -s "${OUT}/uptime-kuma.tgz" ]]; then
      SIZE=$(du -h "${OUT}/uptime-kuma.tgz" | cut -f1)
      log "  uptime-kuma.tgz OK (${SIZE})"
    else
      log "  WARN: uptime-kuma.tgz is empty"
    fi
  else
    log "  WARN: Uptime Kuma archive failed (non-fatal)"
  fi
else
  log "  SKIP: uptime-kuma not running"
fi

# --- 3b. MainWP DB (mysqldump; root pw read from container env — no hardcode) ---
if docker ps --format '{{.Names}}' | grep -q '^mainwp-db$'; then
  log "Dumping MainWP DB (mysqldump --single-transaction)..."
  if docker exec mainwp-db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction mainwp' 2>/dev/null | gzip > "${OUT}/mainwp.sql.gz"; then
    if gzip -t "${OUT}/mainwp.sql.gz" 2>/dev/null && [[ -s "${OUT}/mainwp.sql.gz" ]]; then
      SIZE=$(du -h "${OUT}/mainwp.sql.gz" | cut -f1); log "  mainwp.sql.gz OK (${SIZE})"
    else
      log "  ERROR: mainwp.sql.gz integrity failed or empty"; ERRORS=$((ERRORS + 1))
    fi
  else
    log "  ERROR: MainWP mysqldump failed"; ERRORS=$((ERRORS + 1))
  fi
else
  log "  SKIP: mainwp-db not running"
fi

# --- 3c. Secrets: .env x4, ENCRYPTED before leaving host (key NOT in backup) ---
if [[ -n "${BACKUP_ENC_KEY:-}" ]]; then
  log "Archiving + encrypting .env files (AES-256)..."
  export BACKUP_ENC_KEY   # openssl -pass env: reads the process environment, not a sourced shell var
  if tar czf - -C / root/supabase/.env root/trigger/.env root/mainwp/.env root/postiz/.env 2>/dev/null \
       | openssl enc -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENC_KEY -out "${OUT}/env.tar.gz.enc" 2>/dev/null; then
    if [[ -s "${OUT}/env.tar.gz.enc" ]]; then
      SIZE=$(du -h "${OUT}/env.tar.gz.enc" | cut -f1); log "  env.tar.gz.enc OK (${SIZE})"
    else
      log "  ERROR: env.tar.gz.enc empty"; ERRORS=$((ERRORS + 1))
    fi
  else
    log "  ERROR: .env encrypt failed"; ERRORS=$((ERRORS + 1))
  fi
else
  log "  ERROR: BACKUP_ENC_KEY not set in /etc/default/eu-backup — .env NOT backed up (secrets unprotected)"
  ERRORS=$((ERRORS + 1))
fi

# --- 3d. Volumes: n8n (critical) + storage/minio/postiz/mainwp-files (non-fatal) ---
_archive_vol() {  # $1=volume  $2=outfile  $3=critical(1=ERRORS++,0=WARN)
  local vol="$1" out="$2" crit="$3"
  if docker volume inspect "$vol" >/dev/null 2>&1; then
    log "Archiving volume ${vol} -> ${out}..."
    if docker run --rm -v "${vol}":/data:ro -v "$(realpath "${OUT}")":/backup \
         alpine tar czf "/backup/${out}" -C /data . 2>/dev/null && [[ -s "${OUT}/${out}" ]]; then
      SIZE=$(du -h "${OUT}/${out}" | cut -f1); log "  ${out} OK (${SIZE})"
    elif [[ "$crit" == "1" ]]; then
      log "  ERROR: ${out} failed"; ERRORS=$((ERRORS + 1))
    else
      log "  WARN: ${out} failed (non-fatal)"
    fi
  else
    log "  SKIP: volume ${vol} not found"
  fi
}
_archive_vol n8n_n8n_data            n8n.tgz             1
_archive_vol supabase_storage-data   supabase-storage.tgz 0
_archive_vol trigger_trigger_minio_data trigger-minio.tgz 0
_archive_vol postiz_postiz_uploads   postiz-uploads.tgz  0
_archive_vol mainwp_mainwp_files     mainwp-files.tgz    0

# --- 4. Abort if critical errors ---
if [[ $ERRORS -gt 0 ]]; then
  log "FATAL: ${ERRORS} critical error(s). Backup at ${OUT} may be incomplete."
  exit 1
fi

# --- 5. Offsite: rsync to SG VPS ---
OFFSITE_OK=true
if [[ -f "${OFFSITE_KEY}" ]]; then
  log "Syncing to SG VPS (${OFFSITE_HOST}:${OFFSITE_DIR}/${DATE}/)..."
  if ssh -i "${OFFSITE_KEY}" -o StrictHostKeyChecking=no -o ConnectTimeout=30 \
    "root@${OFFSITE_HOST}" "mkdir -p ${OFFSITE_DIR}/${DATE}" 2>/dev/null && \
    rsync -az -e "ssh -i ${OFFSITE_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=30" \
    "${OUT}/" "root@${OFFSITE_HOST}:${OFFSITE_DIR}/${DATE}/" 2>&1; then
    log "  Offsite rsync OK"
  else
    log "  ERROR: Offsite rsync failed"
    OFFSITE_OK=false
  fi
else
  log "  SKIP: no offsite key at ${OFFSITE_KEY}"
  OFFSITE_OK=false
fi

# --- 6. Retention cleanup ---
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

if [[ "$OFFSITE_OK" == "false" ]]; then
  log "WARNING: Local backup OK but offsite failed."
  exit 2
fi

# --- 8. Cloudflare R2 upload (cross-provider offsite) ---
if [[ -n "${R2_API_TOKEN:-}" ]]; then
  if [[ -x "/root/scripts/upload-to-r2.sh" ]]; then
    log "Uploading to Cloudflare R2..."
    if /root/scripts/upload-to-r2.sh "${OUT}" "${DATE}" 2>&1; then
      log "  R2 upload OK"
    else
      log "  WARN: R2 upload failed (non-fatal; cross-VPS offsite still active)"
    fi
  fi
else
  log "  SKIP: R2_API_TOKEN not set"
fi
