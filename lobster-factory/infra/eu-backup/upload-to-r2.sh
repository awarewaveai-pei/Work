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

# Transient answers are retried: 000 (connection dropped/timed out), 408, 429, 5xx. One 502 or 000
# with no retry lost a day's offsite set on 2026-09-08, 09-09, 10-13 and 10-14. Any other 4xx
# (401/403 token, 413 too big) is final. eu/ and sg-stack/ keys can be overwritten; ks-aw-01/ is
# WORM-locked (ks-aw-01-backup/README.md "R2 bucket lock"), so a key already stored there answers
# 409 — accepted only when the stored size equals the local file (a lost reply, or a rerun).
# Retries stop once the script has run R2_RETRY_BUDGET_SECONDS, so the verify cron 23+ minutes
# later never reads a set that is still uploading.
R2_PUT_ATTEMPTS="${R2_PUT_ATTEMPTS:-4}"
R2_RETRY_BASE_SECONDS="${R2_RETRY_BASE_SECONDS:-15}"     # waits 15s, 30s, 45s
R2_RETRY_BUDGET_SECONDS="${R2_RETRY_BUDGET_SECONDS:-1200}"

API_BASE="https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects"
ERRORS=0

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }

# remote_size <object-key> -> echoes the stored size of exactly that key, or nothing
remote_size() {
  curl -s --max-time 60 -H "Authorization: Bearer ${R2_API_TOKEN}" "${API_BASE}?prefix=$1" 2>/dev/null \
    | sed 's/{"key":/\n{"key":/g' | grep -F "{\"key\":\"$1\"," | grep -oE '"size":[0-9]+' | head -1 | cut -d: -f2 || true
}

# put_object <local-file> <object-key> -> echoes the last HTTP code, returns 0 on 2xx.
# Retry lines go to stderr: stdout is the caller's $(...) capture.
put_object() {
  local src="$1" key="$2" code attempt=1 wait
  while :; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3600 \
      -X PUT \
      -H "Authorization: Bearer ${R2_API_TOKEN}" \
      --data-binary "@${src}" \
      "${API_BASE}/${key}") || true
    [[ -n "$code" ]] || code=000
    if [[ "$code" =~ ^2[0-9]{2}$ ]]; then echo "$code"; return 0; fi
    if [[ "$code" == 409 && "$(remote_size "$key")" == "$(stat -c %s "$src")" ]]; then
      echo "409 already stored, same size"; return 0
    fi
    wait=$(( R2_RETRY_BASE_SECONDS * attempt ))
    if [[ ! "$code" =~ ^(000|408|429|5[0-9]{2})$ ]] || (( attempt >= R2_PUT_ATTEMPTS )) \
       || (( SECONDS + wait >= R2_RETRY_BUDGET_SECONDS )); then
      echo "$code"; return 1
    fi
    log "    retry ${key} after HTTP ${code} (attempt ${attempt}/${R2_PUT_ATTEMPTS}, waiting ${wait}s)" >&2
    sleep "$wait"
    attempt=$((attempt + 1))
  done
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
