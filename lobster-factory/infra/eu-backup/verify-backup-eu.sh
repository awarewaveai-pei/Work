#!/usr/bin/env bash
# Verify today's EU backup integrity. Logs verdict "=== verify-backup-eu PASSED/FAILED ==="
# to /var/log/eu-backup.log + exits non-zero on failure. This script does NOT push alerts
# itself; failures surface to the operator at AO-RESUME via scripts/check-backup-health.ps1
# (reads the verdict line; FAILED -> backup-health report WARN).
set -euo pipefail

# Precedence: explicit caller env > /etc/default/eu-backup > built-in default.
# The file is sourced exactly ONCE, here. Sourcing it after reading caller env
# (or a second time later) clobbers overrides and makes the checks untestable.
_pre_token="${R2_API_TOKEN:-}"; _pre_acct="${R2_ACCOUNT_ID:-}"
_pre_bucket="${R2_BUCKET:-}"; _pre_prefix="${R2_PREFIX:-}"
[[ -f /etc/default/eu-backup ]] && source /etc/default/eu-backup
[[ -n "$_pre_token"  ]] && R2_API_TOKEN="$_pre_token"
[[ -n "$_pre_acct"   ]] && R2_ACCOUNT_ID="$_pre_acct"
[[ -n "$_pre_bucket" ]] && R2_BUCKET="$_pre_bucket"
[[ -n "$_pre_prefix" ]] && R2_PREFIX="$_pre_prefix"

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
DATE="$(date +%Y%m%d)"
DATE_DASH="$(date +%Y-%m-%d)"
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

# Check offsite = Cloudflare R2 (MANDATORY since the 2026-08-28 consolidation:
# the peer-VPS leg is gone, so R2 is the only offsite; a verifier that passes
# without confirming it would re-create the exact blind spot review finding F2
# described -- "verified" backups with zero offsite copies).
# (defaults file already sourced once at the top, with caller-env precedence)
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-aea1a836e6f8b8d7f18206dc8e848bd6}"
R2_BUCKET="${R2_BUCKET:-lobster-backup}"
R2_PREFIX="${R2_PREFIX:-eu}"
if [[ -z "${R2_API_TOKEN:-}" ]]; then
  fail "R2 offsite: R2_API_TOKEN not set - cannot verify the only offsite copy"
else
  R2_LIST=$(curl -s --max-time 30     -H "Authorization: Bearer ${R2_API_TOKEN}"     "https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects?prefix=${R2_PREFIX}/${DATE_DASH}" 2>/dev/null || true)
  # grep exits 1 on zero matches; under set -euo pipefail that would kill the
  # script HERE, silently, before the fail() below ever prints. The || true
  # inside the group keeps "no matches" a data value (0) instead of a death.
  R2_COUNT=$(printf '%s' "$R2_LIST" | { grep -o '"key"' || true; } | wc -l)
  if [[ "$R2_COUNT" -gt 0 ]]; then
    ok "R2 offsite: ${R2_COUNT} object(s) under ${R2_PREFIX}/${DATE_DASH}"
  else
    fail "R2 offsite: no objects under ${R2_PREFIX}/${DATE_DASH} (offsite copy MISSING)"
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
      if [[ "$_sz" -gt "$_THRESH" ]]; then _want="${R2_PREFIX}/${DATE_DASH}/${_n}.parts.json"; else _want="${R2_PREFIX}/${DATE_DASH}/${_n}"; fi
      if ! printf '%s
' "$R2_KEYS" | grep -qxF "$_want"; then
        fail "R2 offsite: expected object missing: ${_want} (upload incomplete or split set broken)"
      fi
    done
  fi

fi

if [[ $ERRORS -gt 0 ]]; then
  log "=== verify-backup-eu FAILED: ${ERRORS} error(s) ==="
  exit 1
else
  log "=== verify-backup-eu PASSED ==="
  exit 0
fi
