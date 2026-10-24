#!/usr/bin/env bash
# check-drift-and-alert.sh — daily SG deploy-drift detector with Slack alert.
#
# Compares /root/lobster-phase1/.deployed-commit against /root/Work origin/main.
# Posts to SLACK_WEBHOOK_URL (sourced from /root/lobster-phase1/.env) if drift.
#
# Dedupe: only alerts once per (deployed_commit, origin_head) pair — avoids
# spamming the channel every day if the user simply hasn't deployed yet.
#
# Schedule: cron daily 20:00 UTC (04:00 Asia/Taipei), an hour after the nightly auto-deploy (19:00 UTC): drift
# here means tonight's deploy did not happen (DEPLOY_HOLD, a failed gate, or a failed deploy).
# Logs: /var/log/sg-deploy-drift.log
#
# Manual:
#   /root/lobster-phase1/scripts/check-drift-and-alert.sh           # normal run
#   /root/lobster-phase1/scripts/check-drift-and-alert.sh --force   # ignore dedupe state

set -euo pipefail

REPO_DIR="/root/Work"
STAGING_DIR="/root/lobster-phase1"
ENV_FILE="$STAGING_DIR/.env"
DEPLOYED_FILE="$STAGING_DIR/.deployed-commit"
STATE_FILE="$STAGING_DIR/.drift-alert-state"
LOG_FILE="/var/log/sg-deploy-drift.log"
THRESHOLD_BEHIND=1   # alert when behind >= this many commits
# Absolute, resolved before the cd below: the re-exec after the script sync needs it.
SELF_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "[$(ts)] $*" >> "$LOG_FILE"; }

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

# 1. Sanity
if [[ ! -f "$DEPLOYED_FILE" ]]; then
  log "ERROR: no $DEPLOYED_FILE — sg-deploy.sh has not been run yet"
  exit 1   # the check did not run; cron-run.sh records it, /ops/schedules shows it failed
fi
if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: $ENV_FILE missing"
  exit 1
fi

# 2. Source SLACK_WEBHOOK_URL from .env (only that var, no other side-effects)
SLACK_WEBHOOK_URL=$(grep -E '^SLACK_WEBHOOK_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
  log "ERROR: SLACK_WEBHOOK_URL not set in $ENV_FILE — drift detection runs but alert skipped"
fi

# 3. Fetch latest origin/main (quiet)
cd "$REPO_DIR"
git fetch origin main --quiet 2>>"$LOG_FILE" || { log "ERROR: git fetch failed"; exit 1; }
ORIGIN_HEAD=$(git rev-parse origin/main 2>/dev/null)
if [[ -z "$ORIGIN_HEAD" ]]; then
  log "ERROR: cannot resolve origin/main"
  exit 1
fi

# 3.5 Refresh host scripts from origin/main before deciding; re-run this file if that replaced it, so a
#     change here takes effect on this run, not after the next app deploy (sync-host-scripts.sh header).
if [[ "${DRIFT_CHECK_REEXEC:-0}" != "1" ]]; then
  _self_sum="$(sha256sum < "$SELF_PATH")"
  _sync="$STAGING_DIR/scripts/sync-host-scripts.sh"; _sync_tmp=""
  if [[ ! -f "$_sync" ]]; then
    # Bootstrap (codex r2 F1): run origin/main's copy once when the host has none; it installs itself.
    _sync_tmp="$(mktemp)"; _sync="$_sync_tmp"
    git -C "$REPO_DIR" show "origin/main:lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh" > "$_sync" 2>/dev/null || _sync=""
  fi
  if [[ -n "$_sync" ]]; then
    if _sync_out="$(bash "$_sync" 2>&1)"; then _sync_rc=0; else _sync_rc=$?; fi
  else
    _sync_rc=127; _sync_out="sync-host-scripts.sh: not installed and not on origin/main"
  fi
  [[ -z "$_sync_tmp" ]] || rm -f "$_sync_tmp"
  while IFS= read -r _line; do if [[ -n "$_line" ]]; then log "$_line"; fi; done <<< "$_sync_out"
  if [[ "$_sync_rc" -ne 0 ]]; then
    log "WARN: host script sync failed (rc=$_sync_rc) -- checking with the installed scripts"
  elif [[ "$(sha256sum < "$SELF_PATH")" != "$_self_sum" ]]; then
    log "this script changed on origin/main -- re-running the new copy"
    export DRIFT_CHECK_REEXEC=1
    exec bash "$SELF_PATH" "$@"
  fi
fi

# 4. Read deployed commit
DEPLOYED=$(cat "$DEPLOYED_FILE" | tr -d '[:space:]')
if [[ -z "$DEPLOYED" ]]; then
  log "ERROR: $DEPLOYED_FILE empty"
  exit 1
fi

# 5. Compute behind / ahead (app-code paths only — ignores governance/tooling commits)
APP_PATHS=(
  "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/"
  "lobster-factory/infra/hetzner-phase1-core/nginx/"
  "lobster-factory/infra/hetzner-phase1-core/docker-compose.yml"
)
git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null || {
  log "ERROR: deployed commit $DEPLOYED not in /root/Work — fetch origin?"
  exit 1
}
BEHIND=$(git rev-list --count "${DEPLOYED}..${ORIGIN_HEAD}" -- "${APP_PATHS[@]}" 2>/dev/null || echo 0)
AHEAD=$(git rev-list --count "${ORIGIN_HEAD}..${DEPLOYED}" -- "${APP_PATHS[@]}" 2>/dev/null || echo 0)

# 6. Decide alert
log "check (app-code only): deployed=${DEPLOYED:0:7} origin=${ORIGIN_HEAD:0:7} behind=$BEHIND ahead=$AHEAD"

if [[ "$BEHIND" -lt "$THRESHOLD_BEHIND" ]]; then
  log "OK: in sync"
  exit 0
fi

# 6.5 Deploy hold (same origin/main file sg-deploy.sh step 1.85 refuses on). Held drift is
# deliberate, so the daily alert stays quiet too -- otherwise this script keeps telling the operator
# to deploy the exact thing the hold exists to stop. Visibility comes from check-smoke-tests.ps1's
# deploy_hold check in AO-RESUME instead.
HOLD_PATH="lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD"
if git -C "$REPO_DIR" cat-file -e "origin/main:$HOLD_PATH" 2>/dev/null; then
  HOLD_REASON="$(git -C "$REPO_DIR" show "origin/main:$HOLD_PATH" 2>/dev/null | grep -m1 '^reason=' | cut -d= -f2- || true)"
  log "HOLD: $HOLD_PATH present, suppressing drift alert (behind=$BEHIND). reason: ${HOLD_REASON:-unspecified}"
  exit 0
fi

# 7. Dedupe: only alert if (deployed, origin) pair changed since last alert
PREV_KEY=""
if [[ -f "$STATE_FILE" ]]; then PREV_KEY=$(cat "$STATE_FILE"); fi
CURR_KEY="${DEPLOYED}->${ORIGIN_HEAD}"
if [[ "$FORCE" -eq 0 && "$PREV_KEY" == "$CURR_KEY" ]]; then
  log "skip alert: same (deployed,origin) pair as last alert"
  exit 0
fi

# 8. Build alert message — first 3 app-code commit subjects for context
SUBJECTS=$(git log --no-merges --format=' • %h %s' --max-count=3 "${DEPLOYED}..${ORIGIN_HEAD}" -- "${APP_PATHS[@]}" 2>/dev/null || true)

MSG=$(cat <<MSG_EOF
:warning: *伺服器程式碼落後，有 ${BEHIND} 個更新尚未部署 — SG next-admin*
新程式碼已備好但還沒上線，請執行部署

待部署更新：
${SUBJECTS}

修復方式：在 Claude Code 執行 \`/sg-deploy\`，或 SSH 後執行 \`/root/lobster-phase1/scripts/sg-deploy.sh next-admin\`
（技術資訊：app-code deploy drift, behind=${BEHIND}, deployed=${DEPLOYED:0:12}, origin=${ORIGIN_HEAD:0:12}）
MSG_EOF
)

# 9. Post to Slack (only if webhook is set)
if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
  PAYLOAD=$(jq -nc --arg t "$MSG" '{text: $t}' 2>/dev/null || printf '{"text":%s}' "$(echo "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
  HTTP=$(curl -sS -o /tmp/slack-resp -w "%{http_code}" -X POST -H 'Content-Type: application/json' --data "$PAYLOAD" "$SLACK_WEBHOOK_URL" 2>>"$LOG_FILE" || echo "000")
  if [[ "$HTTP" =~ ^2 ]]; then
    log "alert sent: HTTP $HTTP, behind=$BEHIND"
    echo "$CURR_KEY" > "$STATE_FILE"
  else
    log "alert FAILED: HTTP $HTTP, response: $(head -c 200 /tmp/slack-resp 2>/dev/null)"
  fi
else
  log "alert skipped: no webhook configured"
fi

# 9b. Also post to OPS_INBOX_SLACK_INCIDENTS_WEBHOOK (#ops-incidents — superset channel).
#     Independent of primary Slack outcome; best-effort.
OPS_INCIDENTS_WEBHOOK=$(grep -E '^OPS_INBOX_SLACK_INCIDENTS_WEBHOOK=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
if [[ -n "${OPS_INCIDENTS_WEBHOOK:-}" ]]; then
  OPS_PAYLOAD=$(jq -nc --arg t "$MSG" '{text: $t}' 2>/dev/null || printf '{"text":%s}' "$(echo "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
  OPS_HTTP=$(curl -sS -o /dev/null -w "%{http_code}" -X POST -H 'Content-Type: application/json' --data "$OPS_PAYLOAD" "$OPS_INCIDENTS_WEBHOOK" 2>>"$LOG_FILE" || echo "000")
  if [[ "$OPS_HTTP" =~ ^2 ]]; then
    log "ops-incidents alert sent: HTTP $OPS_HTTP"
  else
    log "ops-incidents alert FAILED: HTTP $OPS_HTTP"
  fi
else
  log "ops-incidents alert skipped: OPS_INBOX_SLACK_INCIDENTS_WEBHOOK not set in $ENV_FILE"
fi

# 10. Also post to Telegram bot DM (independent of Slack; best-effort).
#     Reuses existing TELEGRAM_BOT_TOKEN + first chat ID from TELEGRAM_ALLOWED_CHAT_IDS.
#     Plain text. Failure here does not affect Slack outcome or STATE_FILE.
#     Uses python3 (not jq) to avoid jq dependency on this server.
TELEGRAM_BOT_TOKEN_VAL=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
TELEGRAM_ALLOWED_CHAT_IDS_VAL=$(grep -E '^TELEGRAM_ALLOWED_CHAT_IDS=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
TELEGRAM_PRIMARY_CHAT_ID=$(echo "$TELEGRAM_ALLOWED_CHAT_IDS_VAL" | cut -d',' -f1 | tr -d ' ')

if [[ -n "${TELEGRAM_BOT_TOKEN_VAL:-}" && -n "${TELEGRAM_PRIMARY_CHAT_ID:-}" ]]; then
  TG_MSG=$(cat <<TG_EOF
⚠️ 伺服器程式碼落後，有 ${BEHIND} 個更新尚未部署 — SG next-admin
新程式碼已備好但還沒上線，請執行部署

待部署更新：
${SUBJECTS}

修復：SSH (Termius) -> /root/lobster-phase1/scripts/sg-deploy.sh next-admin
（技術資訊：deploy drift, behind=${BEHIND}, deployed=${DEPLOYED:0:12}, origin=${ORIGIN_HEAD:0:12}）
TG_EOF
)
  TG_PAYLOAD=$(TGCID="$TELEGRAM_PRIMARY_CHAT_ID" TGTEXT="$TG_MSG" python3 -c 'import json,os; print(json.dumps({"chat_id":os.environ["TGCID"],"text":os.environ["TGTEXT"],"disable_web_page_preview":True}))')
  TG_HTTP=$(curl -sS -o /tmp/tg-resp -w "%{http_code}" -X POST -H 'Content-Type: application/json' --data "$TG_PAYLOAD" "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_VAL}/sendMessage" 2>>"$LOG_FILE" || echo "000")
  if [[ "$TG_HTTP" =~ ^2 ]]; then
    log "telegram alert sent: HTTP $TG_HTTP, chat=$TELEGRAM_PRIMARY_CHAT_ID"
  else
    log "telegram alert FAILED: HTTP $TG_HTTP, response: $(head -c 200 /tmp/tg-resp 2>/dev/null)"
  fi
else
  log "telegram alert skipped: bot_token or chat_id not configured in .env"
fi


exit 0
