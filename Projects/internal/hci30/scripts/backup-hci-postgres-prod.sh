#!/usr/bin/env bash
# ks-aw-01 daily backup for hci-postgres (ADR-0021 gate 4: independent backup stream, own target
# path, mtime independent of the shared Supabase backup artifact -- deliberately its OWN script,
# never a line added to lobster-factory/infra/eu-backup/backup-eu-stack.sh, so a break in that
# shared script can never silently take hci-postgres's backup down with it, and so gate 4's own
# "two consecutive scheduled runs must produce an artifact whose mtime is independent of the
# Supabase artifact's mtime" test has something real to observe.
#
# Same dump-integrity-check + retention-safety pattern as backup-eu-stack.sh, deliberately copied
# rather than shared: retention cleanup below uses a name-glob that can ONLY match snapshots THIS
# script created (backup-eu-stack.sh's own header comment records why a looser
# `-maxdepth 1 -type d` swept a real 769MB client backup off EU on 2026-08-24 -- "a cleanup job may
# only delete what it created" is the invariant that comment exists to enforce, followed here too).
#
# Environment (from shell or /etc/default/hci-postgres-backup):
#   BACKUP_DIR          -- output root (default: /root/backups-hci-postgres)
#   BACKUP_RETAIN_DAYS  -- delete local backups older than N days (default: 7)
#
# Cron: /etc/cron.d/hci-postgres-backup (installed separately, own schedule -- 02:45 UTC daily,
# 15 minutes after the shared 02:30 backup-eu-stack.sh run, staggered on purpose so both never
# contend for the same disk I/O window on the same host)
# Log: /var/log/hci-postgres-backup.log
set -euo pipefail

set -a
[[ -f /etc/default/hci-postgres-backup ]] && source /etc/default/hci-postgres-backup
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/root/backups-hci-postgres}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
OUT="${BACKUP_DIR}/${STAMP}"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }

mkdir -p "$OUT"
ERRORS=0

log "Dumping hci-postgres (hci_wave1_synthetic via hci_owner)..."
if docker exec hci-postgres pg_dump -U hci_owner hci_wave1_synthetic 2>/dev/null | gzip > "${OUT}/hci-postgres.sql.gz"; then
  if gzip -t "${OUT}/hci-postgres.sql.gz" 2>/dev/null && [[ -s "${OUT}/hci-postgres.sql.gz" ]]; then
    SIZE=$(du -h "${OUT}/hci-postgres.sql.gz" | cut -f1)
    log "  hci-postgres.sql.gz OK (${SIZE})"
  else
    log "  ERROR: hci-postgres.sql.gz integrity failed or empty"
    ERRORS=$((ERRORS + 1))
  fi
else
  log "  ERROR: hci-postgres pg_dump failed"
  ERRORS=$((ERRORS + 1))
fi

# Retention cleanup -- see file header: this glob can only match snapshot dirs THIS script
# creates, never any other directory that happens to live under BACKUP_DIR.
if [[ "${BACKUP_RETAIN_DAYS}" -gt 0 ]]; then
  _snap_glob='20[0-9][0-9][01][0-9][0-3][0-9]-[0-2][0-9][0-5][0-9][0-5][0-9]'
  DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "$_snap_glob" -mtime +"${BACKUP_RETAIN_DAYS}" 2>/dev/null | wc -l)
  if [[ "$DELETED" -gt 0 ]]; then
    find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "$_snap_glob" -mtime +"${BACKUP_RETAIN_DAYS}" -exec rm -rf {} + 2>/dev/null || true
    log "Retention: deleted ${DELETED} backup(s) older than ${BACKUP_RETAIN_DAYS} days"
  else
    log "Retention: nothing to clean (keep ${BACKUP_RETAIN_DAYS} days)"
  fi
fi

log "Done. Errors: ${ERRORS}"
# .complete = this snapshot finished cleanly; the offsite leg and backup-coverage-check.py ship and count only those
# (a failed pg_dump still leaves a 20-byte gzip that passes gzip -t).
if [[ ${ERRORS} -eq 0 ]]; then touch "${OUT}/.complete"; fi
exit "$([[ ${ERRORS} -eq 0 ]] && echo 0 || echo 1)"
