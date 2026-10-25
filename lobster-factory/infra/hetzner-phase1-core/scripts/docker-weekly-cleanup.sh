#!/usr/bin/env bash
# Weekly Docker garbage collection — age-gated prune.
# Removes: UNUSED images/containers/networks/build-cache older than 7 days (168h).
# Does NOT remove: running containers, images in use by them, named volumes,
#                  or anything created in the last 7 days (rollback window).
#
# Deployed by: sync-host-scripts.sh (cron.d/awarewave-schedules runs it from /root/lobster-phase1/scripts)
# Log: /var/log/docker-weekly-cleanup.log (rotated at 5 MB, kept 4 files)
# Schedule: Sunday 03:00–03:30 UTC (see install-maintenance-crons.sh for exact time per host)
#
# Why -af --filter until=168h (changed 2026-06-25 after disk hit 97.5% on SG):
#   Plain `prune -f` only reaps DANGLING images. sg-deploy rebuilds tagged
#   `:local` images every deploy; over weeks ~182 unused-but-tagged image
#   generations accumulated → 42 GB in containerd overlayfs → disk 98%.
#   `-a` reaps unused TAGGED images too; `--filter until=168h` keeps the last
#   7 days of images so recent deploys stay available for rollback.
# Long-run safety: in-use images are NEVER pruned regardless of the filter.
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

  echo "--- docker system prune -af --filter until=168h ---"
  # `|| echo WARN` keeps set -e from aborting mid-block on a prune hiccup, so the
  # `df (after)` + END marker always get logged (failed run = visible, not truncated).
  docker system prune -af --filter "until=168h" || echo "WARN: prune exited $? — see output above; cleanup continued"

  echo "--- docker system df (after) ---"
  docker system df 2>/dev/null || true

  echo "=== docker-weekly-cleanup END $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
} >> "$LOG" 2>&1
