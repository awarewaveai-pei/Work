#!/usr/bin/env bash
# Upload backup files to Cloudflare R2 via REST API (no S3 credentials needed).
set -euo pipefail

LOCAL_DIR="${1:?Usage: $0 <local-dir> <date-prefix>}"
DATE_PREFIX="${2:?Usage: $0 <local-dir> <date-prefix>}"

R2_API_TOKEN="${R2_API_TOKEN:?R2_API_TOKEN not set}"
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-aea1a836e6f8b8d7f18206dc8e848bd6}"
R2_BUCKET="${R2_BUCKET:-lobster-backup}"
R2_PREFIX="${R2_PREFIX:-unknown}"

API_BASE="https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects"
ERRORS=0

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }

log "Uploading to R2: ${R2_BUCKET}/${R2_PREFIX}/${DATE_PREFIX}/"

for FILE in "${LOCAL_DIR}"/*; do
  [[ -f "$FILE" ]] || continue
  FNAME="$(basename "$FILE")"
  KEY="${R2_PREFIX}/${DATE_PREFIX}/${FNAME}"
  SIZE=$(du -h "$FILE" | cut -f1)

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT \
    -H "Authorization: Bearer ${R2_API_TOKEN}" \
    --data-binary "@${FILE}" \
    "${API_BASE}/${KEY}")

  if [[ "$HTTP_CODE" =~ ^2[0-9]{2}$ ]]; then
    log "  ${FNAME} (${SIZE}) -> ${KEY} [${HTTP_CODE}]"
  else
    log "  ERROR: ${FNAME} upload failed [HTTP ${HTTP_CODE}]"
    ERRORS=$((ERRORS + 1))
  fi
done

if [[ $ERRORS -gt 0 ]]; then
  log "R2 upload: ${ERRORS} error(s)"
  exit 1
else
  log "R2 upload: OK"
fi
