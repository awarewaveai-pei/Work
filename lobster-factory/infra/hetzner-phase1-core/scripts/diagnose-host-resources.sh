#!/usr/bin/env bash
# Read-only host + Docker diagnostics (memory, swap, disk, container RSS, OOM hints).
# Safe: does not stop services, write files, or change configuration.
#
# Usage on VPS (pick one):
#   cd /root/lobster-phase1 && bash scripts/diagnose-host-resources.sh
#   bash /path/to/hetzner-phase1-core/scripts/diagnose-host-resources.sh /root/lobster-phase1
#
# If this repo on the server is not at /root/lobster-phase1, pass the directory that
# contains docker-compose.yml and .env as the first argument.

set -u

PHASE1_DIR="${1:-}"
if [[ -z "${PHASE1_DIR}" ]]; then
  if [[ -f "$(pwd)/docker-compose.yml" ]]; then
    PHASE1_DIR="$(pwd)"
  elif [[ -f /root/lobster-phase1/docker-compose.yml ]]; then
    PHASE1_DIR="/root/lobster-phase1"
  else
    PHASE1_DIR="$(pwd)"
  fi
fi

echo "=========================================="
echo "=== diagnose-host-resources (read-only) ==="
echo "Timestamp (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Phase1 dir: ${PHASE1_DIR}"
echo "=========================================="

echo ""
echo "=== free -h ==="
free -h || true

echo ""
echo "=== swapon --show ==="
swapon --show 2>/dev/null || echo "(no swap or swapon not available)"

echo ""
echo "=== df -h ==="
df -h || true

echo ""
echo "=== docker stats --no-stream ==="
if command -v docker >/dev/null 2>&1; then
  docker stats --no-stream 2>/dev/null || echo "(docker stats failed — is Docker running?)"
else
  echo "(docker not in PATH)"
fi

echo ""
echo "=== docker compose ps ==="
if command -v docker >/dev/null 2>&1 && [[ -f "${PHASE1_DIR}/docker-compose.yml" ]]; then
  (
    cd "${PHASE1_DIR}" || { echo "(cannot cd to ${PHASE1_DIR})"; exit 0; }
    if [[ -f .env ]]; then
      docker compose --env-file .env ps 2>/dev/null || docker compose ps 2>/dev/null || echo "(docker compose ps failed)"
    else
      docker compose ps 2>/dev/null || echo "(docker compose ps failed — missing .env?)"
    fi
  )
else
  echo "(skipped: ${PHASE1_DIR}/docker-compose.yml not found)"
fi

echo ""
echo "=== dmesg (last 80 lines, OOM / kill hints) ==="
if command -v dmesg >/dev/null 2>&1; then
  if dmesg -T 2>/dev/null | tail -n 80; then
    :
  elif sudo dmesg -T 2>/dev/null | tail -n 80; then
    :
  else
    echo "(dmesg not permitted — try: sudo dmesg -T | tail -80)"
  fi
else
  echo "(dmesg not available)"
fi

echo ""
echo "=== quick hints (not measured) ==="
echo "- Swap heavily used + high SI/SO in vmstat => RAM pressure."
echo "- df Use% 90+ on / or /var/lib/docker => slow I/O or write failures."
echo "- dmesg lines with 'Out of memory' / 'Killed process' => OOM killer."
echo "=========================================="
echo "Done. Copy full output above for triage."
echo "=========================================="
