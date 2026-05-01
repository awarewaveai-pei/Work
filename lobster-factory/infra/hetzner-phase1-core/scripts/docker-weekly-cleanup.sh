#!/usr/bin/env bash
# Weekly Docker garbage collection — safe prune only.
# Removes: dangling images, stopped containers, unused networks, build cache.
# Does NOT remove: tagged images, running containers, named volumes.
#
# Deployed by: install-maintenance-crons.sh (idempotent)
# Log: /var/log/docker-weekly-cleanup.log (rotated at 5 MB, kept 4 files)
# Schedule: Sunday 03:00–03:30 UTC (see install-maintenance-crons.sh for exact time per host)
#
# Long-run safety: docker system prune -f is non-destructive for running workloads.
# If your stack uses anonymous volumes you never want to lose, add --volumes ONLY
# after verifying all state is in named volumes or external (Supabase / object storage).
set -euo pipefail

LOG=/var/log/docker-weekly-cleanup.log
MAX_LOG_BYTES=5242880  # 5 MB
LOG_KEEP=4

rotate_log() {
  if [[ -f "$LOG" ]] && [[ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -ge "$MAX_LOG_BYTES" ]]; then
    for i in $(seq $((LOG_KEEP - 1)) -1 1); do
      [[ -f "${LOG}.${i}" ]] && mv "${LOG}.${i}" "${LOG}.$((i + 1))"
    done
    mv "$LOG" "${LOG}.1"
  fi
}

rotate_log

{
  echo "=== docker-weekly-cleanup START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "Host: $(hostname)"

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker not found in PATH — skipping."
    exit 1
  fi

  echo "--- docker system df (before) ---"
  docker system df 2>/dev/null || true

  echo "--- docker system prune -f ---"
  docker system prune -f

  echo "--- docker system df (after) ---"
  docker system df 2>/dev/null || true

  echo "=== docker-weekly-cleanup END $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
} >> "$LOG" 2>&1
