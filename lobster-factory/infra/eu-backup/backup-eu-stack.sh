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
#   OFFSITE_RETAIN_DAYS  — delete offsite copies older than N days (default: 14)
#
# Cron: /etc/cron.d/eu-backup (02:30 UTC daily)
# Log:  /var/log/eu-backup.log
set -euo pipefail

# set -a exports every sourced var so CHILD processes can read them:
#   - upload-to-r2.sh (child script) needs R2_API_TOKEN/R2_* in its environment
#   - openssl -pass env:BACKUP_ENC_KEY reads the process environment
# Root cause of silent R2 WARN since 2026-05: /etc/default/eu-backup uses plain
# assignments (no `export`), so `source` set them as shell vars only — children
# couldn't see them. Fixed 2026-06-26 (verified R2 upload 10/10 files HTTP 200).
set -a
[[ -f /etc/default/eu-backup ]] && source /etc/default/eu-backup
set +a

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

# --- 5b. Offsite retention (prune the copies we pushed) ---
# Root cause 2026-08-12: section 6 below only prunes BACKUP_DIR on THIS host.
# The copies rsynced to SG were never pruned -> 97 snapshots / 30G -> SG disk 90%.
# Rule: retention follows the producer. Whoever pushes a copy also prunes it.
# Only runs after a successful rsync, so a failed push never deletes history.
OFFSITE_RETAIN_DAYS="${OFFSITE_RETAIN_DAYS:-14}"
if [[ "$OFFSITE_OK" == "true" && "${OFFSITE_RETAIN_DAYS}" -gt 0 ]]; then
  OFFSITE_CUTOFF="$(date -u -d "${OFFSITE_RETAIN_DAYS} days ago" +%Y-%m-%d)"
  if OFFSITE_PRUNED=$(ssh -i "${OFFSITE_KEY}" -o StrictHostKeyChecking=no -o ConnectTimeout=30 \
      "root@${OFFSITE_HOST}" \
      "cd '${OFFSITE_DIR}' && ls -1 | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | awk '\$1 < \"${OFFSITE_CUTOFF}\"' > /tmp/offsite-prune.txt; wc -l < /tmp/offsite-prune.txt; xargs -a /tmp/offsite-prune.txt -r -d '\n' rm -r --" 2>/dev/null); then
    log "Offsite retention: pruned ${OFFSITE_PRUNED} snapshot(s) older than ${OFFSITE_CUTOFF} on ${OFFSITE_HOST}"
  else
    log "  WARN: offsite retention prune failed (non-fatal; all copies intact)"
  fi
fi

# --- 6. Retention cleanup ---
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
