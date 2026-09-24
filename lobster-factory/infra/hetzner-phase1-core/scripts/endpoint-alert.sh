#!/usr/bin/env bash
# AwareWave public endpoint check + Slack/PagerDuty/Telegram alerter (systemd oneshot, fired every minute).
#
# Design rules:
#  1. State file is the source of truth for dedup. It MUST be persisted before any
#     side effect (Slack / PagerDuty / Telegram / heartbeat) so a side-effect crash cannot
#     regress the state machine and re-trigger the same alert.
#  2. Same set of failing URLs => same fingerprint => one Slack message, not many.
#     Only a different fingerprint (or transition to/from ok) re-notifies.
#  3. Heartbeat is observability for THIS alerter; a heartbeat failure must never
#     crash the alerter itself.
#  4. RENOTIFY_AFTER_SEC is opt-in periodic re-up for ongoing incidents.
#     Default 0 = silent forever for the same fingerprint.
#  5. Backwards compatible: legacy state files containing plain "ok" or "fail"
#     are read correctly; new writes use "ok" or "fail:<sha256>".
set -euo pipefail

# STATE_DIR is overridable (default unchanged) so the state machine can be
# exercised against a throwaway dir in tests without touching prod state.
STATE_DIR="${STATE_DIR:-/var/lib/awarewave-alert}"
STATE_FILE="${STATE_DIR}/last_state"
LAST_NOTIFY_FILE="${STATE_DIR}/last_notify_at"
STREAK_FILE="${STATE_DIR}/fail_streak"
WEBHOOK_WARN_STAMP="${STATE_DIR}/.warned_missing_webhook"

WEBHOOK_URL="${WEBHOOK_URL:-}"
# Built-in default = local SG services only. Cross-region canaries belong in
# CHECK_URLS_SLOW (see below) — do NOT add them here, the 12s fast tier will false-positive
# on routine network jitter. Operators add per-VPS extras via /etc/default/awarewave-endpoint-alert.local.
CHECK_URLS="${CHECK_URLS:-https://aware-wave.com/ https://app.aware-wave.com/api/ops/summary https://api.aware-wave.com/health}"
TIMEOUT_SEC="${TIMEOUT_SEC:-12}"
# Optional second URL list for cross-region or known-slow probes. Default empty =
# fully backwards compatible (no second loop runs, no fingerprint change).
# Use a longer timeout for cross-region canaries to absorb routine network variance.
CHECK_URLS_SLOW="${CHECK_URLS_SLOW:-}"
TIMEOUT_SEC_SLOW="${TIMEOUT_SEC_SLOW:-20}"
HEARTBEAT_URL="${HEARTBEAT_URL:-}"
TELEGRAM_NOTIFY_ENABLED="${TELEGRAM_NOTIFY_ENABLED:-false}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_ALLOWED_CHAT_IDS="${TELEGRAM_ALLOWED_CHAT_IDS:-}"

# Optional: PagerDuty Events API v2 integration key.
PAGERDUTY_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY:-}"
PAGERDUTY_DEDUP_KEY="${PAGERDUTY_DEDUP_KEY:-awarewave-endpoint-$(hostname)}"

# Optional: re-notify the same fingerprint after this many seconds. 0 = never.
RENOTIFY_AFTER_SEC="${RENOTIFY_AFTER_SEC:-0}"
case "${RENOTIFY_AFTER_SEC}" in
  ''|*[!0-9]*) RENOTIFY_AFTER_SEC=0 ;;
esac

# Consecutive failing runs required before the FIRST alert fires (debounce /
# hysteresis). 1 = legacy behaviour (alert on the very first failing check).
# Default 2 suppresses single-run transients — e.g. one curl exceeding --max-time
# during a brief Cloudflare edge / cross-region stall — which previously paged and
# then self-recovered the next minute (alert fatigue). A real outage persists
# across runs and still alerts after FAIL_THRESHOLD minutes. The raw failure is
# logged to the journal every run regardless, so forensics are unaffected.
# COVERAGE NOTE: this is CONSECUTIVE-failure hysteresis. A target that flaps with
# a < FAIL_THRESHOLD run-length (e.g. down every other minute) never accumulates
# enough consecutive failures to page here. That is acceptable for this alerter
# because comprehensive public-surface monitoring is Uptime Kuma's job (see the
# .local drop-in header); this script is the SG-side + EU dead-man safety net.
FAIL_THRESHOLD="${FAIL_THRESHOLD:-2}"
case "${FAIL_THRESHOLD}" in
  ''|*[!0-9]*) FAIL_THRESHOLD=2 ;;
esac
[[ "${FAIL_THRESHOLD}" -lt 1 ]] && FAIL_THRESHOLD=1

mkdir -p "${STATE_DIR}"

# Empty WEBHOOK_URL used to exit 1 every run -> systemd oneshot failures every minute and huge journal
# growth. Prefer: still run HTTP checks; skip Slack notifications until configured.
if [[ -z "${WEBHOOK_URL}" ]]; then
  if [[ ! -f "${WEBHOOK_WARN_STAMP}" ]]; then
    echo "endpoint-alert: WEBHOOK_URL is empty; Slack notifications disabled. Set WEBHOOK_URL in /etc/default/awarewave-endpoint-alert" >&2
    : >"${WEBHOOK_WARN_STAMP}"
  fi
fi

write_atomic() {
  # write_atomic <path> <content>
  local path="$1"
  local content="$2"
  printf "%s" "${content}" >"${path}.tmp"
  mv -f "${path}.tmp" "${path}"
}

send_webhook() {
  # Primary channel (e.g. #infra-alerts)
  if [[ -n "${WEBHOOK_URL:-}" ]]; then
    local text="$1"
    local payload
    payload=$(printf '{"text":%s}' "$(echo "$text" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
    curl -sS -o /dev/null -w "" -X POST -H 'Content-Type: application/json' --data "$payload" "${WEBHOOK_URL}" 2>/dev/null || true
  fi
  # Secondary channel (#ops-incidents — superset of all alerts)
  if [[ -n "${OPS_INCIDENTS_WEBHOOK_URL:-}" ]]; then
    local text="$1"
    local payload
    payload=$(printf '{"text":%s}' "$(echo "$text" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
    curl -sS -o /dev/null -w "" -X POST -H 'Content-Type: application/json' --data "$payload" "${OPS_INCIDENTS_WEBHOOK_URL}" 2>/dev/null || true
  fi
  return 0
}

send_pagerduty() {
  local event_action="$1" # trigger | resolve
  local summary="$2"
  local details="$3"
  [[ -z "${PAGERDUTY_ROUTING_KEY}" ]] && return 0
  export PD_EVENT_ACTION="${event_action}"
  export PD_SUMMARY="${summary}"
  export PD_DETAILS="${details}"
  export PD_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY}"
  export PD_DEDUP_KEY="${PAGERDUTY_DEDUP_KEY}"
  export PD_HOST="$(hostname)"
  python3 <<'PY'
import json, os, urllib.error, urllib.request

action = os.environ["PD_EVENT_ACTION"]
rk = os.environ["PD_ROUTING_KEY"]
dedup = os.environ["PD_DEDUP_KEY"]
host = os.environ["PD_HOST"]

if action == "trigger":
    summary = os.environ["PD_SUMMARY"]
    details = os.environ["PD_DETAILS"]
    body = {
        "routing_key": rk,
        "event_action": "trigger",
        "dedup_key": dedup,
        "payload": {
            "summary": summary,
            "source": host,
            "severity": "error",
            "component": "endpoint-alert",
            "group": "aware-wave-public",
            "class": "http_check",
            "custom_details": {"failures": details},
        },
    }
else:
    body = {
        "routing_key": rk,
        "event_action": "resolve",
        "dedup_key": dedup,
    }

data = json.dumps(body).encode("utf-8")
req = urllib.request.Request(
    "https://events.pagerduty.com/v2/enqueue",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        _ = resp.read()
except urllib.error.HTTPError as e:
    print(f"endpoint-alert: PagerDuty HTTP {e.code}: {e.read()!r}", file=__import__("sys").stderr)
    raise
PY
}

send_telegram() {
  local text="$1"
  local enabled
  enabled="$(printf '%s' "${TELEGRAM_NOTIFY_ENABLED}" | tr '[:upper:]' '[:lower:]')"
  [[ "${enabled}" == "true" || "${enabled}" == "1" || "${enabled}" == "yes" || "${enabled}" == "on" ]] || return 0
  [[ -n "${TELEGRAM_BOT_TOKEN}" && -n "${TELEGRAM_ALLOWED_CHAT_IDS}" ]] || return 0

  local chat_id
  for chat_id in ${TELEGRAM_ALLOWED_CHAT_IDS//,/ }; do
    [[ -z "${chat_id}" ]] && continue
    curl -sS -o /dev/null -w "" \
      -X POST \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      --data-urlencode "chat_id=${chat_id}" \
      --data-urlencode "text=${text}" \
      --data-urlencode "disable_web_page_preview=true" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>/dev/null || true
  done
}

# Heartbeat is observability for THIS alerter. Must NEVER take down the alerter.
# No -f: HTTP non-2xx is logged as a warning but does not affect exit status.
send_heartbeat() {
  [[ -z "${HEARTBEAT_URL}" ]] && return 0
  local code
  code="$(curl -sS -o /dev/null --max-time "${TIMEOUT_SEC}" -w '%{http_code}' "${HEARTBEAT_URL}" 2>/dev/null || echo '000')"
  if [[ ! "${code}" =~ ^2[0-9]{2}$ ]]; then
    echo "endpoint-alert: heartbeat returned HTTP ${code} (non-fatal); check HEARTBEAT_URL token" >&2
  fi
}

# --- HTTP checks ---
fail_lines=()
# Probe one URL. Echoes URL identity to stderr on failure so journal entries
# self-explain which target timed out (curl's own "timed out" message has no URL).
# fail_lines mutation is intentional global state — kept here so the dual loops below
# share the same fingerprint input format.
probe_url() {
  local url="$1" timeout="$2" code
  # `|| echo '000'` (not `|| true`) — when curl itself dies (DNS resolver crash,
  # /dev/null unwritable, etc.), code would be empty string and journal line
  # would print "url -> (timeout=Ns)" with no code, misleading the operator.
  # '000' mirrors the same convention used in send_heartbeat() above.
  code="$(curl -sS -o /dev/null -L -w "%{http_code}" --max-time "${timeout}" "${url}" || echo '000')"
  # 2xx / 3xx only (avoid bash ERE pitfall: ^2|3 matches a lone "3" anywhere)
  if [[ ! "${code}" =~ ^[23][0-9]{2}$ ]]; then
    echo "endpoint-alert: ${url} -> ${code} (timeout=${timeout}s)" >&2
    fail_lines+=("${url} -> ${code}")
  fi
}

# `:-` defends against any future caller that unsets these vars (slack-alert-drill.sh
# already does for symmetry); without `:-` an unset var crashes under `set -u`.
for url in ${CHECK_URLS:-}; do
  probe_url "${url}" "${TIMEOUT_SEC}"
done
# Second tier runs only when operator opts in via CHECK_URLS_SLOW (.local drop-in).
# Order matters for fingerprint stability: fast tier first, slow tier second.
# fingerprint dedup below uses sort -u so order isn't load-bearing, but keeping it
# deterministic helps log readability.
for url in ${CHECK_URLS_SLOW:-}; do
  probe_url "${url}" "${TIMEOUT_SEC_SLOW}"
done

# --- Host-job freshness (dead-man switches) ---
# A host job registers by dropping one line "<stamp-file> <max-age-seconds> <label>" into FRESH_DIR and
# touching the stamp only after a healthy run. Missing or older stamp = one failure line, through the
# same debounce / fingerprint / channels as a URL. First user: wp-cron-runner.sh (2026-09-24).
FRESH_DIR="${FRESH_DIR:-/etc/awarewave-alert/fresh.d}"
for reg in "${FRESH_DIR}"/*; do
  [[ -f "${reg}" ]] || continue
  read -r stamp max_age label _ < "${reg}" || true
  if [[ -z "${stamp:-}" || ! "${max_age:-}" =~ ^[0-9]+$ ]]; then
    fail_lines+=("job $(basename "${reg}") -> bad registration")
    continue
  fi
  if [[ ! -e "${stamp}" ]]; then
    fail_lines+=("job ${label:-$(basename "${reg}")} -> never ran (${stamp} missing)")
    continue
  fi
  age=$(( $(date +%s) - $(stat -c %Y "${stamp}") ))
  if (( age > max_age )); then
    echo "endpoint-alert: job ${label:-$(basename "${reg}")} stale ${age}s > ${max_age}s" >&2
    fail_lines+=("job ${label:-$(basename "${reg}")} -> stale (no healthy run for > ${max_age}s)")
  fi
done

# --- Fingerprint + state machine ---
# fingerprint = sha256 of this run's sorted failing URLs (empty when all OK).
fingerprint=""
if [[ ${#fail_lines[@]} -gt 0 ]]; then
  fingerprint="$(printf '%s\n' "${fail_lines[@]}" | LC_ALL=C sort -u | sha256sum | awk '{print $1}')"
fi

# --- Debounce: consecutive failing-run counter (hysteresis) ---
# Persist the streak BEFORE deriving notifiable state so a crash cannot regress it
# (same invariant as the STATE_FILE write below). A single transient failure
# (streak < FAIL_THRESHOLD) is NOT notifiable. This single lever tames both the
# SG-service Cloudflare-hairpin jitter and the EU cross-region canary, which a
# longer per-URL timeout could not (uptime still hit the 20s wall).
prev_streak="$(cat "${STREAK_FILE}" 2>/dev/null || echo 0)"
case "${prev_streak}" in
  ''|*[!0-9]*) prev_streak=0 ;;
esac
if [[ -n "${fingerprint}" ]]; then
  fail_streak=$(( prev_streak + 1 ))
else
  fail_streak=0
fi
write_atomic "${STREAK_FILE}" "${fail_streak}"

# new_state is the NOTIFIABLE state: "ok" or "fail:<sha256>". Sub-threshold
# failures present as "ok" (not yet paging); probe_url() already logged the raw
# failure to the journal above.
new_state="ok"
if [[ -n "${fingerprint}" && "${fail_streak}" -ge "${FAIL_THRESHOLD}" ]]; then
  new_state="fail:${fingerprint}"
fi

old_state="$(cat "${STATE_FILE}" 2>/dev/null || true)"
last_notify_at="$(cat "${LAST_NOTIFY_FILE}" 2>/dev/null || echo 0)"
case "${last_notify_at}" in
  ''|*[!0-9]*) last_notify_at=0 ;;
esac
now_epoch="$(date +%s)"

# Classify into categories the rest of the script understands.
# old_kind / new_kind: ok | fail (legacy "fail" treated as a fingerprint of "<legacy>")
old_kind="ok"
[[ -n "${old_state}" && "${old_state}" != "ok" ]] && old_kind="fail"
new_kind="ok"
# Derive from the NOTIFIABLE state (threshold-gated), not the raw fingerprint, so
# a sub-threshold transient does not count as a notifiable failure.
[[ "${new_state}" != "ok" ]] && new_kind="fail"

notify=false
notify_kind=""

if [[ "${new_state}" != "${old_state}" ]]; then
  if [[ "${new_kind}" == "fail" ]]; then
    # ok -> fail OR fail:A -> fail:B (different failure set). Always notify.
    notify=true
    notify_kind="alert"
  elif [[ "${new_kind}" == "ok" && -z "${fingerprint}" && -n "${old_state}" ]]; then
    # fail -> ok. Recovered. The `-z fingerprint` guard ensures we only announce
    # recovery when there are genuinely zero current failures — not when failures
    # are merely sub-threshold (which would mis-report an ongoing incident as
    # resolved, e.g. when this debounce upgrade lands mid-incident).
    notify=true
    notify_kind="recovered"
  fi
elif [[ "${new_kind}" == "fail" && "${RENOTIFY_AFTER_SEC}" -gt 0 ]]; then
  # Same failure ongoing: optional periodic re-up.
  if (( now_epoch - last_notify_at >= RENOTIFY_AFTER_SEC )); then
    notify=true
    notify_kind="alert-reminder"
  fi
fi

# CRITICAL: persist state BEFORE any side effect. If the next line crashes the
# script (heartbeat 404, Slack rate-limit, PagerDuty timeout), the state machine
# must not regress and re-trigger the same alert.
write_atomic "${STATE_FILE}" "${new_state}"

if [[ "${notify}" == "true" ]]; then
  host="$(hostname)"
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  # Persist the notify timestamp BEFORE the channel sends — same persist-before-
  # side-effect invariant as STATE_FILE / STREAK_FILE. Recording the attempt time
  # up front keeps the RENOTIFY_AFTER_SEC clock advancing even if a channel send
  # crashes, preventing a per-minute reminder storm during a channel outage.
  write_atomic "${LAST_NOTIFY_FILE}" "${now_epoch}"
  if [[ "${new_kind}" == "ok" ]]; then
    msg="✅ 網站服務恢復正常 — ${host}
（技術資訊：endpoint recovered ${ts}）"
    send_webhook "${msg}"
    send_telegram "${msg}"
    # `|| true`: a PagerDuty enqueue failure (HTTP error / connection timeout
    # re-raises in send_pagerduty) must NEVER abort the alerter under `set -e`
    # — same principle as the heartbeat (design rule #3). PagerDuty has its own
    # dedup_key, so a missed enqueue self-heals on the next run.
    send_pagerduty "resolve" "[aware-wave] public endpoint check recovered (${host})" "" || true
  else
    prefix="🚨"
    [[ "${notify_kind}" == "alert-reminder" ]] && prefix="⚠️ [提醒]"
    fail_detail="$(printf '%s\n' "${fail_lines[@]}")"
    msg="$(printf '%s 網站端點或主機排程異常 — %s\n失敗項目：\n%s\n（技術資訊：%s endpoint alert %s）' "${prefix}" "${host}" "${fail_detail}" "${prefix}" "${ts}")"
    detail_text="$(printf '%s\n' "${fail_lines[@]}")"
    send_webhook "${msg}"
    send_telegram "${msg}"
    # Reminders do not re-trigger PagerDuty (the incident is already open;
    # PagerDuty's own dedup_key would absorb it anyway).
    if [[ "${notify_kind}" != "alert-reminder" ]]; then
      send_pagerduty "trigger" "[aware-wave] public endpoint check failed (${host})" "${detail_text}" || true
    fi
  fi
fi

# Heartbeat last; failure non-fatal (see send_heartbeat).
# Always send — alerter-running monitor; endpoint health via Slack/PD
send_heartbeat || true
