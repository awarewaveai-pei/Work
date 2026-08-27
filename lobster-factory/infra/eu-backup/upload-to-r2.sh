#!/usr/bin/env bash
# Upload backup files to Cloudflare R2 via REST API (no S3 credentials needed).
#
# Large files are SPLIT before upload. The Cloudflare REST objects endpoint rejects
# bodies above a few hundred MB with HTTP 413 Payload Too Large — measured, not
# assumed: a 767 MB tarball returned 413 in 0s on 2026-08-27, while a 15.8 MB dump
# on the same run returned 200. This is not a future risk for EU either; its
# trigger.sql.gz was already 204 MB in R2 on 2026-06-26 and grows with run history.
#
# Splitting rather than S3 multipart is deliberate: multipart needs S3 Access Key
# credentials, while every host here already has the REST bearer token and nothing
# else. Restore stays trivial — `cat <name>.part-* > <name>` — and each part is an
# independent object, so a failed part can be retried alone.
set -euo pipefail

LOCAL_DIR="${1:?Usage: $0 <local-dir> <date-prefix>}"
DATE_PREFIX="${2:?Usage: $0 <local-dir> <date-prefix>}"

R2_API_TOKEN="${R2_API_TOKEN:?R2_API_TOKEN not set}"
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-aea1a836e6f8b8d7f18206dc8e848bd6}"
R2_BUCKET="${R2_BUCKET:-lobster-backup}"
R2_PREFIX="${R2_PREFIX:-unknown}"
# Well under the observed 413 threshold, and a round number that makes the part
# count obvious when reading a bucket listing.
R2_SPLIT_THRESHOLD_BYTES="${R2_SPLIT_THRESHOLD_BYTES:-209715200}"   # 200 MiB
R2_SPLIT_PART_BYTES="${R2_SPLIT_PART_BYTES:-209715200}"             # 200 MiB

API_BASE="https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects"
ERRORS=0

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }

# put_object <local-file> <object-key> -> echoes HTTP code, returns 0 on 2xx
put_object() {
  local src="$1" key="$2" code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3600 \
    -X PUT \
    -H "Authorization: Bearer ${R2_API_TOKEN}" \
    --data-binary "@${src}" \
    "${API_BASE}/${key}")
  echo "$code"
  [[ "$code" =~ ^2[0-9]{2}$ ]]
}

log "Uploading to R2: ${R2_BUCKET}/${R2_PREFIX}/${DATE_PREFIX}/"

for FILE in "${LOCAL_DIR}"/*; do
  [[ -f "$FILE" ]] || continue
  FNAME="$(basename "$FILE")"
  KEY="${R2_PREFIX}/${DATE_PREFIX}/${FNAME}"
  BYTES=$(stat -c %s "$FILE")
  SIZE=$(du -h "$FILE" | cut -f1)

  if [[ "$BYTES" -le "$R2_SPLIT_THRESHOLD_BYTES" ]]; then
    CODE=$(put_object "$FILE" "$KEY") && \
      log "  ${FNAME} (${SIZE}) -> ${KEY} [${CODE}]" || {
        log "  ERROR: ${FNAME} upload failed [HTTP ${CODE}]"
        ERRORS=$((ERRORS + 1))
      }
    continue
  fi

  # ---- split path ----
  SPLIT_DIR="$(mktemp -d)"
  # Numeric 3-digit suffixes sort correctly in a bucket listing and in `cat *`.
  if ! split -b "$R2_SPLIT_PART_BYTES" -d -a 3 "$FILE" "${SPLIT_DIR}/${FNAME}.part-"; then
    log "  ERROR: ${FNAME} split failed"
    ERRORS=$((ERRORS + 1))
    rm -rf "$SPLIT_DIR"
    continue
  fi
  PART_COUNT=$(find "$SPLIT_DIR" -type f | wc -l)
  log "  ${FNAME} (${SIZE}) exceeds ${R2_SPLIT_THRESHOLD_BYTES}B -> ${PART_COUNT} part(s)"

  PART_FAILED=0
  for PART in "${SPLIT_DIR}"/*; do
    PNAME="$(basename "$PART")"
    PSIZE=$(du -h "$PART" | cut -f1)
    CODE=$(put_object "$PART" "${R2_PREFIX}/${DATE_PREFIX}/${PNAME}") && \
      log "    ${PNAME} (${PSIZE}) [${CODE}]" || {
        log "    ERROR: ${PNAME} failed [HTTP ${CODE}]"
        PART_FAILED=1
      }
  done

  if [[ "$PART_FAILED" -eq 0 ]]; then
    # Manifest so a restorer knows this object is split and how to rebuild it,
    # without having to infer it from the bucket listing.
    MANIFEST="${SPLIT_DIR}/${FNAME}.parts.json"
    printf '{"file":"%s","bytes":%s,"parts":%s,"part_prefix":"%s.part-","reassemble":"cat %s.part-* > %s","sha256":"%s"}\n' \
      "$FNAME" "$BYTES" "$PART_COUNT" "$FNAME" "$FNAME" "$FNAME" \
      "$(sha256sum "$FILE" | cut -d' ' -f1)" > "$MANIFEST"
    CODE=$(put_object "$MANIFEST" "${R2_PREFIX}/${DATE_PREFIX}/${FNAME}.parts.json") && \
      log "    ${FNAME}.parts.json [${CODE}]" || {
        log "    ERROR: ${FNAME}.parts.json failed [HTTP ${CODE}]"
        PART_FAILED=1
      }
  fi

  [[ "$PART_FAILED" -eq 1 ]] && ERRORS=$((ERRORS + 1))
  rm -rf "$SPLIT_DIR"
done

if [[ $ERRORS -gt 0 ]]; then
  log "R2 upload: ${ERRORS} error(s)"
  exit 1
else
  log "R2 upload: OK"
fi
