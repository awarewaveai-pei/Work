#!/usr/bin/env bash
# One-time setup: configure rclone for Hetzner Object Storage offsite backup.
#
# Prerequisites:
#   1. Go to Hetzner Cloud Console → your project → Object Storage
#   2. Create a bucket (e.g. "lobster-phase1-backup") in fsn1 (EU, different region from SG VPS)
#   3. Go to Security → S3 Credentials → Generate credentials
#   4. Note the Access Key and Secret Key
#
# Usage:
#   bash scripts/setup-offsite-backup.sh <access-key> <secret-key> <bucket-name>
#
# Example:
#   bash scripts/setup-offsite-backup.sh AKIAEXAMPLE secretexample lobster-phase1-backup
#
# This script:
#   - Creates rclone config for Hetzner Object Storage (S3-compatible, fsn1)
#   - Tests connectivity with a small upload
#   - Adds RCLONE_REMOTE to .env
#   - Runs a backup + verify to confirm end-to-end
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <access-key> <secret-key> <bucket-name>"
  echo ""
  echo "Get credentials from Hetzner Cloud Console:"
  echo "  1. Console → your project → Object Storage → Create bucket in fsn1"
  echo "  2. Security → S3 Credentials → Generate"
  echo "  3. Run this script with the credentials"
  exit 1
fi

ACCESS_KEY="$1"
SECRET_KEY="$2"
BUCKET="$3"
REMOTE_NAME="hetzner-backup"
ENDPOINT="fsn1.your-objectstorage.com"

echo "=== Setting up offsite backup ==="
echo "  Remote: ${REMOTE_NAME}"
echo "  Endpoint: ${ENDPOINT}"
echo "  Bucket: ${BUCKET}"
echo ""

# --- 1. Configure rclone ---
echo "1. Creating rclone config..."

# Remove existing config if present (idempotent)
rclone config delete "${REMOTE_NAME}" 2>/dev/null || true

rclone config create "${REMOTE_NAME}" s3 \
  provider=Other \
  env_auth=false \
  access_key_id="${ACCESS_KEY}" \
  secret_access_key="${SECRET_KEY}" \
  endpoint="${ENDPOINT}" \
  acl=private \
  --non-interactive \
  --quiet

echo "   rclone remote '${REMOTE_NAME}' created"

# --- 2. Test connectivity ---
echo "2. Testing connectivity..."
TEST_FILE=$(mktemp)
echo "offsite-backup-test $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TEST_FILE"

if rclone copy "$TEST_FILE" "${REMOTE_NAME}:${BUCKET}/_connectivity-test/" --quiet 2>&1; then
  echo "   Upload test: PASS"
  # Clean up test file from remote
  rclone delete "${REMOTE_NAME}:${BUCKET}/_connectivity-test/" --quiet 2>/dev/null || true
else
  echo "   Upload test: FAIL"
  echo "   Check your credentials and bucket name."
  rm -f "$TEST_FILE"
  exit 1
fi
rm -f "$TEST_FILE"

# Verify bucket is accessible
FILE_COUNT=$(rclone ls "${REMOTE_NAME}:${BUCKET}/" 2>/dev/null | wc -l)
echo "   Bucket accessible: ${FILE_COUNT} existing file(s)"

# --- 3. Update .env ---
echo "3. Updating .env..."
RCLONE_REMOTE_VALUE="${REMOTE_NAME}:${BUCKET}"

if grep -q "^RCLONE_REMOTE=" .env 2>/dev/null; then
  sed -i "s|^RCLONE_REMOTE=.*|RCLONE_REMOTE=${RCLONE_REMOTE_VALUE}|" .env
  echo "   Updated existing RCLONE_REMOTE in .env"
elif grep -q "^# RCLONE_REMOTE=" .env 2>/dev/null; then
  sed -i "s|^# RCLONE_REMOTE=.*|RCLONE_REMOTE=${RCLONE_REMOTE_VALUE}|" .env
  echo "   Uncommented and set RCLONE_REMOTE in .env"
else
  echo "" >> .env
  echo "# Offsite backup destination (added by setup-offsite-backup.sh)" >> .env
  echo "RCLONE_REMOTE=${RCLONE_REMOTE_VALUE}" >> .env
  echo "   Appended RCLONE_REMOTE to .env"
fi

# --- 4. Run end-to-end test ---
echo "4. Running backup + verify end-to-end test..."
echo ""
if bash "${ROOT}/scripts/backup-phase1.sh"; then
  echo ""
  if bash "${ROOT}/scripts/verify-backup.sh"; then
    echo ""
    echo "=== OFFSITE BACKUP SETUP COMPLETE ==="
    echo ""
    echo "  Remote:    ${RCLONE_REMOTE_VALUE}"
    echo "  Endpoint:  ${ENDPOINT}"
    echo "  Schedule:  daily via /etc/cron.d/lobster-backup"
    echo "  Retention: local ${BACKUP_RETAIN_DAYS:-7} days"
    echo "  Log:       /var/log/lobster-backup.log"
    echo ""
    echo "  To check offsite files:"
    echo "    rclone ls ${RCLONE_REMOTE_VALUE}/"
    echo "    rclone size ${RCLONE_REMOTE_VALUE}/"
  else
    echo "WARNING: Backup OK but verification reported issues."
    exit 1
  fi
else
  echo "WARNING: Backup failed. Check logs above."
  exit 1
fi
