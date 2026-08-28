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

# --- 3. Offsite verification = Cloudflare R2 REST (2026-08-28, matches backup-phase1) ---
if [[ -z "${R2_API_TOKEN:-}" && -r /etc/default/eu-backup ]]; then
  set -a; source /etc/default/eu-backup; set +a
fi
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-aea1a836e6f8b8d7f18206dc8e848bd6}"
R2_VERIFY_BUCKET="${R2_VERIFY_BUCKET:-lobster-backup}"
R2_VERIFY_PREFIX="${R2_VERIFY_PREFIX:-sg-stack}"
if [[ -z "${R2_API_TOKEN:-}" ]]; then
  fail "R2 offsite: R2_API_TOKEN not set - cannot verify the only offsite copy"
else
  R2_LIST=$(curl -s --max-time 30 -H "Authorization: Bearer ${R2_API_TOKEN}"     "https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_VERIFY_BUCKET}/objects?prefix=${R2_VERIFY_PREFIX}/${DATE_DASH}" 2>/dev/null || true)
  R2_COUNT=$(printf '%s' "$R2_LIST" | { grep -o '"key"' || true; } | wc -l)
  if [[ "$R2_COUNT" -gt 0 ]]; then
    ok "R2 offsite: ${R2_COUNT} object(s) under ${R2_VERIFY_PREFIX}/${DATE_DASH}"
  else
    fail "R2 offsite: no objects under ${R2_VERIFY_PREFIX}/${DATE_DASH} (offsite copy MISSING)"
  fi
  # F2-1 (round-2 review): counting keys is not enough. A split upload whose later
  # part failed leaves earlier .part-* keys in the listing - countable, PASSing,
  # and NOT reassemblable. upload-to-r2.sh's contract: the .parts.json manifest is
  # written ONLY after every part succeeded. So the per-file invariant is:
  #   size <= split threshold -> the exact key must exist
  #   size >  split threshold -> the .parts.json manifest key must exist
  R2_KEYS=$(printf '%s' "$R2_LIST" | { grep -oE '"key":"[^"]+"' || true; } | sed 's/"key":"//; s/"$//')
  _THRESH="${R2_SPLIT_THRESHOLD_BYTES:-209715200}"
  if [[ -n "${TODAY_DIR:-}" && -d "${TODAY_DIR}" ]]; then
    for _f in "${TODAY_DIR}"/*; do
      [[ -f "$_f" ]] || continue
      _n=$(basename "$_f"); _sz=$(stat -c %s "$_f")
      if [[ "$_sz" -gt "$_THRESH" ]]; then _want="${R2_VERIFY_PREFIX}/${DATE_DASH}/${_n}.parts.json"; else _want="${R2_VERIFY_PREFIX}/${DATE_DASH}/${_n}"; fi
      if ! printf '%s
' "$R2_KEYS" | grep -qxF "$_want"; then
        fail "R2 offsite: expected object missing: ${_want} (upload incomplete or split set broken)"
      fi
    done
  fi

fi

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
