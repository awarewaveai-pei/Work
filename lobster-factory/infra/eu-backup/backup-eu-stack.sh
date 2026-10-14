#!/usr/bin/env bash
# EU VPS daily backup: Supabase DB + Trigger DB + Uptime Kuma volume.
# Mirror of SG backup-phase1.sh design: retention + offsite + verify.
#
# Environment (from shell or /etc/default/eu-backup):
#   BACKUP_DIR           — output root (default: /root/backups)
#   BACKUP_RETAIN_DAYS   — delete local backups older than N days (default: 7)
#
# OFFSITE_HOST/OFFSITE_KEY/OFFSITE_DIR/OFFSITE_RETAIN_DAYS removed 2026-09-23: the peer-VPS
# rsync leg that read them was deleted outright 2026-08-28 (see "(removed 2026-08-28)" note
# below) but the now-dead defaults were left in place pointing at the released SG IP
# 5.223.93.113 — caught by scripts/verify-no-released-addresses.mjs. If a second machine
# ever exists again, reintroduce the leg with fresh var names and a pinned known_hosts entry.
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

# --- 3c. Secrets: .env x4 + pgsodium_root.key, ENCRYPTED before leaving host (BACKUP_ENC_KEY NOT in backup) ---
# pgsodium_root.key decrypts vault.secrets inside supabase-all.sql.gz; a restore without it cannot read them.
# tar -v lists members on stderr (stdout is the archive) -> env.tar.gz.enc.members, checked by
# backup-coverage-check.py; "tar: " lines there are errors, not members.
SECRET_FILES=(root/supabase/.env root/trigger/.env root/mainwp/.env root/postiz/.env
              var/lib/docker/volumes/supabase_db-config/_data/pgsodium_root.key)
if [[ -n "${BACKUP_ENC_KEY:-}" ]]; then
  log "Archiving + encrypting .env files and pgsodium_root.key (AES-256)..."
  export BACKUP_ENC_KEY   # openssl -pass env: reads the process environment, not a sourced shell var
  if tar czvf - -C / "${SECRET_FILES[@]}" 2>"${OUT}/env.tar.gz.enc.members" \
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

# --- 3d. Volumes: n8n (critical) + minio/postiz/mainwp-files (non-fatal) ---
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
_archive_vol trigger_trigger_minio_data trigger-minio.tgz 0
_archive_vol postiz_postiz_uploads   postiz-uploads.tgz  0
_archive_vol mainwp_mainwp_files     mainwp-files.tgz    0

# --- 3e. Supabase files: storage objects, edge functions, Studio snippets ---
# Binds under /root/supabase/volumes (lobster-factory/infra/supabase/docker-compose.yml). The named volume
# supabase_storage-data archived here before 2026-10-14 is not what supabase-storage mounts.
# GNU tar exits 1 for "file changed as we read it" (a live upload): the archive is still usable; 2+ is a real failure.
log "Archiving Supabase files (storage, functions, snippets)..."
_rc=0; tar czf "${OUT}/supabase-files.tgz" -C /root/supabase/volumes storage functions snippets 2>/dev/null || _rc=$?
if [[ "$_rc" -le 1 && -s "${OUT}/supabase-files.tgz" ]]; then
  SIZE=$(du -h "${OUT}/supabase-files.tgz" | cut -f1); log "  supabase-files.tgz OK (${SIZE})$([[ $_rc -eq 1 ]] && echo ', a file changed while it was read')"
else
  log "  ERROR: supabase-files.tgz failed (tar exit ${_rc})"; ERRORS=$((ERRORS + 1))
fi

# --- 4. Abort if critical errors ---
if [[ $ERRORS -gt 0 ]]; then
  log "FATAL: ${ERRORS} critical error(s). Backup at ${OUT} may be incomplete."
  exit 1
fi

# --- 5. (removed 2026-08-28) peer-VPS offsite leg ---
# The SG rsync leg was deleted outright during the EU/SG consolidation onto
# ks-aw-01: the peer host is being retired, the leg had been dead-skipping on
# every run (no key on this box), and its ssh used StrictHostKeyChecking=no --
# a spoofed peer would have silently received full customer DB dumps (review
# finding F3, 2026-08-28). If a second machine ever exists again, reintroduce
# the leg WITH a pinned known_hosts entry, never with host checking disabled.
OFFSITE_OK=false   # kept only so the summary wording below stays truthful

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

# --- 7. Cloudflare R2 upload (cross-provider offsite) ---
# 2026-08-28 REORDERED to run BEFORE the exit decision, and promoted to MANDATORY.
# Old order had `exit 2` (peer-offsite failed) ABOVE this section. On EU that path
# almost never fired because the SG rsync leg usually succeeded — but after the
# EU/SG consolidation onto ks-aw-01 the peer leg ALWAYS fails (no peer left), so
# the old ordering meant R2 never ran and the machine had ZERO offsite copies
# while reporting only a WARNING. Observed on the first real run on ks-aw-01.
# Invariant: a snapshot is not safe until at least one OFFSITE copy exists.
# Single-machine topology => R2 IS the offsite; its failure is a hard failure.
R2_OK=false
if [[ -n "${R2_API_TOKEN:-}" ]]; then
  if [[ -x "/root/scripts/upload-to-r2.sh" ]]; then
    log "Uploading to Cloudflare R2..."
    if /root/scripts/upload-to-r2.sh "${OUT}" "${DATE}" 2>&1; then
      log "  R2 upload OK"
      R2_OK=true
    else
      log "  ERROR: R2 upload failed"
    fi
  else
    log "  ERROR: /root/scripts/upload-to-r2.sh missing or not executable"
  fi
else
  log "  ERROR: R2_API_TOKEN not set - no cross-provider offsite possible"
fi

# --- 8. Summary + exit policy ---
TOTAL_SIZE=$(du -sh "${OUT}" | cut -f1)
log "=== Backup complete: ${OUT} (${TOTAL_SIZE}) ==="

if [[ "$R2_OK" == "false" ]]; then
  log "FATAL: local snapshot exists but the R2 offsite copy is incomplete or missing (see upload errors above)."
  log "       (peer-VPS leg: OFFSITE_OK=${OFFSITE_OK} - optional since the 2026-08-28 consolidation)"
  exit 2
fi
if [[ "$OFFSITE_OK" == "false" ]]; then
  log "NOTE: peer-VPS offsite leg skipped/failed (expected post-consolidation; R2 copy is in place)."
fi
