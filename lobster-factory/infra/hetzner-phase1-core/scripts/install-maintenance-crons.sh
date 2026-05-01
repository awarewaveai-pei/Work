#!/usr/bin/env bash
# Idempotent maintenance cron installer for Phase 1 VPS hosts.
# Safe to re-run on fresh servers AND on existing servers that already have
# cron entries in root's crontab (the script upgrades the binary in place
# and does NOT create a duplicate entry in /etc/cron.d/).
#
# Usage (run as root on the target VPS):
#   bash /path/to/hetzner-phase1-core/scripts/install-maintenance-crons.sh [--host sg|eu]
#
# If --host is omitted, the script auto-detects based on `hostname`.
# SG (phase1 stack)  : docker-weekly-cleanup Sunday 03:00 UTC
# EU (Supabase stack): docker-weekly-cleanup Sunday 03:30 UTC
#
# After a server rebuild, re-run this script to restore all maintenance crons.
# The cleanup script itself must be present at CLEANUP_SCRIPT_SRC path (see below).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLEANUP_SCRIPT_SRC="${SCRIPT_DIR}/docker-weekly-cleanup.sh"
CLEANUP_SCRIPT_DEST="/usr/local/bin/docker-weekly-cleanup.sh"

# ── detect host ───────────────────────────────────────────────────────────────
HOST_TYPE="${1:-}"
if [[ "$HOST_TYPE" == "--host" ]]; then
  HOST_TYPE="${2:-}"
  shift 2 2>/dev/null || true
fi

if [[ -z "$HOST_TYPE" ]]; then
  HN="$(hostname)"
  case "$HN" in
    *sg*|*phase1*|*lobster*|*sin*) HOST_TYPE="sg" ;;
    *eu*|*supabase*|*trigger*|*hel*) HOST_TYPE="eu" ;;
    *) HOST_TYPE="sg"
       echo "WARN: cannot detect host type from hostname '${HN}', defaulting to sg (03:00 UTC)." ;;
  esac
fi

case "$HOST_TYPE" in
  sg) CRON_MINUTE=0;  CRON_HOUR=3  ;;
  eu) CRON_MINUTE=30; CRON_HOUR=3  ;;
  *)  echo "ERROR: unknown host type '${HOST_TYPE}'. Use --host sg|eu." >&2; exit 1 ;;
esac

CRON_ENTRY="${CRON_MINUTE} ${CRON_HOUR} * * 0 root ${CLEANUP_SCRIPT_DEST} >> /var/log/docker-weekly-cleanup.log 2>&1"
CRON_FILE="/etc/cron.d/docker-weekly-cleanup"
CRON_MARKER="docker-weekly-cleanup.sh"

echo "=== install-maintenance-crons START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "Host type : ${HOST_TYPE}"
echo "Schedule  : ${CRON_HOUR}:$(printf '%02d' "${CRON_MINUTE}") UTC every Sunday"

# ── install cleanup script ────────────────────────────────────────────────────
if [[ ! -f "$CLEANUP_SCRIPT_SRC" ]]; then
  echo "ERROR: source not found: ${CLEANUP_SCRIPT_SRC}" >&2
  echo "Run this script from within the cloned repo, or copy docker-weekly-cleanup.sh to ${CLEANUP_SCRIPT_DEST} manually." >&2
  exit 1
fi

echo "Installing ${CLEANUP_SCRIPT_DEST} ..."
install -m 0755 "$CLEANUP_SCRIPT_SRC" "$CLEANUP_SCRIPT_DEST"

# ── install cron entry (duplicate-safe) ──────────────────────────────────────
# Check all possible locations where the cron entry might already exist:
#   1. /etc/cron.d/docker-weekly-cleanup  (written by this script on fresh servers)
#   2. root's personal crontab            (legacy: installed in an earlier session)
IN_CROND=false
IN_ROOT_CRONTAB=false

[[ -f "$CRON_FILE" ]] && grep -q "$CRON_MARKER" "$CRON_FILE" 2>/dev/null && IN_CROND=true
crontab -l 2>/dev/null | grep -q "$CRON_MARKER" 2>/dev/null && IN_ROOT_CRONTAB=true

if $IN_ROOT_CRONTAB && ! $IN_CROND; then
  # Entry lives in root's personal crontab — do NOT duplicate to /etc/cron.d/.
  # The binary has already been upgraded above; the schedule is already correct.
  echo "INFO: cron entry found in root crontab — skipping /etc/cron.d/ (no duplicate)."
  echo "      To migrate to /etc/cron.d/ (optional): remove the root crontab line,"
  echo "      then re-run this script."
elif $IN_CROND; then
  echo "Cron entry already present in ${CRON_FILE} — updating schedule."
  sed -i "/${CRON_MARKER}/c\\${CRON_ENTRY}" "$CRON_FILE"
else
  # Fresh server: install to /etc/cron.d/ (preferred, auditable, no personal crontab needed).
  echo "Writing ${CRON_FILE} ..."
  cat > "$CRON_FILE" <<EOF
# Managed by install-maintenance-crons.sh — do not edit manually.
# Re-run the script to change schedule or recover after server rebuild.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${CRON_ENTRY}
EOF
  chmod 0644 "$CRON_FILE"
fi

# ── verify ────────────────────────────────────────────────────────────────────
echo ""
echo "--- active cron sources ---"
echo "  /etc/cron.d/:"
grep "$CRON_MARKER" "$CRON_FILE" 2>/dev/null && echo "    ↑ /etc/cron.d/docker-weekly-cleanup" || echo "    (not in /etc/cron.d/)"
echo "  root crontab:"
crontab -l 2>/dev/null | grep "$CRON_MARKER" && echo "    ↑ root crontab" || echo "    (not in root crontab)"
echo ""
echo "Cleanup script:"
ls -lh "$CLEANUP_SCRIPT_DEST"

echo "=== install-maintenance-crons DONE $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo ""
echo "To test immediately (output goes to log):"
echo "  bash ${CLEANUP_SCRIPT_DEST}"
echo "  tail -50 /var/log/docker-weekly-cleanup.log"
