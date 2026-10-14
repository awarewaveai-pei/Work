#!/usr/bin/env bash
# Verify today's EU backup integrity. Logs verdict "=== verify-backup-eu PASSED/FAILED ==="
# to /var/log/eu-backup.log + exits non-zero on failure. This script does NOT push alerts
# itself; failures surface to the operator at AO-RESUME via scripts/check-backup-health.ps1
# (reads the verdict line; FAILED -> backup-health report WARN).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
DATE="$(date +%Y%m%d)"
ERRORS=0
DETAILS=()

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }
fail() { log "FAIL: $1"; DETAILS+=("$1"); ERRORS=$((ERRORS + 1)); }
ok() { log "  OK: $1"; }

log "=== verify-backup-eu START ==="

TODAY_DIR=""
if [[ -d "${BACKUP_DIR}" ]]; then
  TODAY_DIR="$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "${DATE}-*" | sort -r | head -1)"
fi

if [[ -z "$TODAY_DIR" || ! -d "$TODAY_DIR" ]]; then
  fail "No backup directory for today (${DATE}) in ${BACKUP_DIR}"
  log "=== verify-backup-eu FAILED ==="
  exit 1
fi

log "Checking: ${TODAY_DIR}"

for FILE in supabase-all.sql.gz trigger.sql.gz mainwp.sql.gz n8n.tgz; do
  FILEPATH="${TODAY_DIR}/${FILE}"
  if [[ ! -f "$FILEPATH" ]]; then
    fail "${FILE} missing"
  elif [[ ! -s "$FILEPATH" ]]; then
    fail "${FILE} empty"
  else
    SIZE=$(du -h "$FILEPATH" | cut -f1)
    if gunzip -t "$FILEPATH" 2>/dev/null; then
      ok "${FILE} (${SIZE}, gzip OK)"
    else
      fail "${FILE} (${SIZE}) corrupt"
    fi
  fi
done

# Uptime Kuma optional
UK="${TODAY_DIR}/uptime-kuma.tgz"
if [[ -f "$UK" && -s "$UK" ]]; then
  if tar tzf "$UK" >/dev/null 2>&1; then
    SIZE=$(du -h "$UK" | cut -f1)
    ok "uptime-kuma.tgz (${SIZE}, tar OK)"
  else
    fail "uptime-kuma.tgz corrupt"
  fi
fi

# Encrypted .env bundle (CRITICAL — secrets; can't gunzip-test, check exists + non-empty)
ENVENC="${TODAY_DIR}/env.tar.gz.enc"
if [[ -f "$ENVENC" && -s "$ENVENC" ]]; then
  SIZE=$(du -h "$ENVENC" | cut -f1)
  ok "env.tar.gz.enc (${SIZE}, present)"
else
  fail "env.tar.gz.enc missing or empty (secrets NOT protected)"
fi

# --- Offsite (R2) is checked once, for every store, by backup-coverage-check.py: size and upload time per
# artifact, split sets by their parts (BACKUP_COVERAGE_PLAN.md B9). This script checks the local snapshot only.

if [[ $ERRORS -gt 0 ]]; then
  log "=== verify-backup-eu FAILED: ${ERRORS} error(s) ==="
  exit 1
else
  log "=== verify-backup-eu PASSED ==="
  exit 0
fi
