#!/usr/bin/env bash
# Verify today's backup integrity and alert on failure.
# Run after backup-phase1.sh (e.g. cron 30 minutes later).
#
# Checks:
#   1. Today's backup directory exists
#   2. Expected files exist and are non-zero
#   3. Gzip/tar integrity (gunzip -t / tar tzf)
#   4. Offsite copy exists (if RCLONE_REMOTE configured)
#
# Alerting:
#   Uses WEBHOOK_URL from /etc/default/awarewave-endpoint-alert (same Slack channel
#   as endpoint alerts) — no extra config needed. Override with BACKUP_SLACK_WEBHOOK.
#
# Exit codes:
#   0 = all checks pass
#   1 = one or more checks failed
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "FATAL: Missing .env in $ROOT" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && source ./.env && set +a

# Load Slack webhook from endpoint-alert env (reuse existing config)
if [[ -f /etc/default/awarewave-endpoint-alert ]]; then
  # shellcheck disable=SC1091
  source /etc/default/awarewave-endpoint-alert
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
SLACK_HOOK="${BACKUP_SLACK_WEBHOOK:-${WEBHOOK_URL:-}}"

DATE="$(date +%Y%m%d)"
DATE_DASH="$(date +%Y-%m-%d)"
ERRORS=0
WARNINGS=0
DETAILS=()

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }
fail() { log "FAIL: $1"; DETAILS+=("$1"); ERRORS=$((ERRORS + 1)); }
warn() { log "WARN: $1"; DETAILS+=("(warn) $1"); WARNINGS=$((WARNINGS + 1)); }
ok() { log "  OK: $1"; }

log "=== verify-backup START ==="

# --- 1. Find today's backup directory ---
# backup-phase1.sh creates dirs like 20260508-020000; match by date prefix.
TODAY_DIR=""
if [[ -d "${BACKUP_DIR}" ]]; then
  TODAY_DIR="$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "${DATE}-*" | sort -r | head -1)"
fi

if [[ -z "$TODAY_DIR" || ! -d "$TODAY_DIR" ]]; then
  fail "No backup directory found for today (${DATE}) in ${BACKUP_DIR}"
  # Cannot continue without a directory
  log "=== verify-backup FAILED: ${ERRORS} error(s) ==="
  # alert
  if [[ -n "$SLACK_HOOK" ]]; then
    HOST="$(hostname)"
    MSG=":x: [backup-verify FAILED] ${HOST} ${DATE_DASH} — No backup directory found"
    PAYLOAD="$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "${MSG}")"
    curl -fsS -X POST -H "Content-Type: application/json" --data "${PAYLOAD}" "${SLACK_HOOK}" >/dev/null 2>&1 || true
  fi
  exit 1
fi

log "Checking: ${TODAY_DIR}"

# --- 2. Check expected files ---
for FILE in wordpress-db.sql.gz wp-html.tgz; do
  FILEPATH="${TODAY_DIR}/${FILE}"
  if [[ ! -f "$FILEPATH" ]]; then
    fail "${FILE} missing"
  elif [[ ! -s "$FILEPATH" ]]; then
    fail "${FILE} exists but is empty (0 bytes)"
  else
    SIZE=$(du -h "$FILEPATH" | cut -f1)
    # integrity test
    if [[ "$FILE" == *.gz ]]; then
      if gunzip -t "$FILEPATH" 2>/dev/null; then
        ok "${FILE} (${SIZE}, gzip integrity pass)"
      else
        fail "${FILE} (${SIZE}) gzip integrity FAILED — file is corrupt"
      fi
    elif [[ "$FILE" == *.tgz ]]; then
      if tar tzf "$FILEPATH" >/dev/null 2>&1; then
        ok "${FILE} (${SIZE}, tar integrity pass)"
      else
        fail "${FILE} (${SIZE}) tar integrity FAILED — file is corrupt"
      fi
    fi
  fi
done

# n8n is optional (only if container was running during backup)
N8N_FILE="${TODAY_DIR}/n8n-data.tgz"
if [[ -f "$N8N_FILE" ]]; then
  if [[ -s "$N8N_FILE" ]]; then
    SIZE=$(du -h "$N8N_FILE" | cut -f1)
    if tar tzf "$N8N_FILE" >/dev/null 2>&1; then
      ok "n8n-data.tgz (${SIZE}, tar integrity pass)"
    else
      warn "n8n-data.tgz (${SIZE}) tar integrity FAILED"
    fi
  else
    warn "n8n-data.tgz exists but is empty"
  fi
else
  log "  SKIP: n8n-data.tgz not present (n8n may not have been running)"
fi

# --- Offsite (R2) is checked once, for every store, by backup-coverage-check.py: size and upload time per
# artifact, split sets by their parts (BACKUP_COVERAGE_PLAN.md B9). This script checks the local snapshot only.

# --- 4. Result ---
if [[ $ERRORS -gt 0 ]]; then
  log "=== verify-backup FAILED: ${ERRORS} error(s), ${WARNINGS} warning(s) ==="

  # Slack alert
  if [[ -n "$SLACK_HOOK" ]]; then
    HOST="$(hostname)"
    DETAIL_TEXT="$(printf '%s\n' "${DETAILS[@]}")"
    MSG=":x: [backup-verify FAILED] ${HOST} ${DATE_DASH}\n${DETAIL_TEXT}"
    PAYLOAD="$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "${MSG}")"
    curl -fsS -X POST -H "Content-Type: application/json" --data "${PAYLOAD}" "${SLACK_HOOK}" >/dev/null 2>&1 || true
  fi
  exit 1
else
  log "=== verify-backup PASSED: 0 errors, ${WARNINGS} warning(s) ==="
  exit 0
fi
