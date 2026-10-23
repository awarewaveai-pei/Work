#!/usr/bin/env bash
# Monthly global events cache refresh for next-admin Studio.
# Safe to run manually; the API skips when the current month already has data.
set -euo pipefail

COMPOSE_ROOT="${COMPOSE_ROOT:-/root/lobster-phase1}"
ENV_FILE="${COMPOSE_ROOT}/.env"
LOG_PREFIX="[events-sync]"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

SYNC_URL="${NEXT_ADMIN_EVENTS_SYNC_URL:-http://127.0.0.1:3002/api/internal/events/sync}"

if [[ -z "${OPS_PROXY_SHARED_SECRET:-}" ]]; then
  echo "${LOG_PREFIX} missing OPS_PROXY_SHARED_SECRET" >&2
  exit 1
fi

echo "${LOG_PREFIX} start $(date -u +%Y-%m-%dT%H:%M:%SZ)"
curl -fsS -X POST \
  -H "x-ops-sync-key: ${OPS_PROXY_SHARED_SECRET}" \
  "${SYNC_URL}"
echo
echo "${LOG_PREFIX} done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
