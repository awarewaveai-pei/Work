#!/usr/bin/env bash
# The clock for client schedules (AUTO_CONTENT_EXECUTION_PLAN.md D6/I3; cron.d/awarewave-schedules, every 5 minutes):
# ask next-admin which (client, job) rows are due and start them. It claims each firing and starts the runs after
# answering, so this returns in seconds. Exit 1 when the sweep did not answer ok: cron-run.sh records it and
# /ops/schedules shows the failure. A job's own failure is not this script's: it lands on the job's row and in the ops
# inbox. Only failures are logged; a clean run is proven by cron-run.sh's record.
set -euo pipefail

ENV_FILE=/root/lobster-phase1/.env
LOG_FILE=/var/log/schedules-run-due.log
NOW_ISO="$(date -u +%FT%TZ)"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "[${NOW_ISO}] ABORT: ${ENV_FILE} not readable -- no schedule was checked" >> "${LOG_FILE}"
  exit 1
fi
set -a; . "${ENV_FILE}"; set +a
if [[ -z "${SCHEDULE_INGEST_TOKEN:-}" ]]; then
  echo "[${NOW_ISO}] ABORT: SCHEDULE_INGEST_TOKEN not set -- no schedule was checked" >> "${LOG_FILE}"
  exit 1
fi

OUT="$(curl -s -m 60 -X POST -H "Authorization: Bearer ${SCHEDULE_INGEST_TOKEN}" \
  http://127.0.0.1:3002/api/internal/schedules/run-due || true)"
[[ -n "${OUT}" ]] || OUT='{"ok":false,"error":"curl_failed"}'
if ! printf '%s' "${OUT}" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
  echo "[${NOW_ISO}] $(printf '%s' "${OUT}" | head -c 400)" >> "${LOG_FILE}"
  exit 1
fi
exit 0
