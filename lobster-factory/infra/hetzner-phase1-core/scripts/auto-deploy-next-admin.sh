#!/usr/bin/env bash
# auto-deploy-next-admin.sh -- auto-deploys next-admin when drift vs origin/main is detected.
# Runs via cron every 4 hours. Logs to /root/lobster-phase1/logs/auto-deploy.log
# Safe to run manually: bash /root/lobster-phase1/scripts/auto-deploy-next-admin.sh
# Notification: mirrors check-drift-and-alert.sh -- Slack + Telegram, sourced from .env.
#
# Install (SG VPS):
#   sudo cp auto-deploy-next-admin.sh /root/lobster-phase1/scripts/
#   sudo chmod +x /root/lobster-phase1/scripts/auto-deploy-next-admin.sh
#
# Crontab (add via crontab -e):
#   0 3,7,11,15,19,23 * * * /root/lobster-phase1/scripts/auto-deploy-next-admin.sh >> /root/lobster-phase1/logs/auto-deploy.log 2>&1

set -euo pipefail

DEPLOY_DIR="/root/lobster-phase1"
WORK_DIR="/root/Work"
LOG_FILE="$DEPLOY_DIR/logs/auto-deploy.log"
LOCK_FILE="/tmp/auto-deploy-next-admin.lock"
ENV_FILE="$DEPLOY_DIR/.env"
APP="next-admin"

ts()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }

if [ -f "$LOCK_FILE" ]; then
    log "SKIP: lock file exists, another deploy may be running"
    exit 0
fi
trap "rm -f $LOCK_FILE" EXIT INT TERM
touch "$LOCK_FILE"
mkdir -p "$(dirname "$LOG_FILE")"

if [[ ! -f "$DEPLOY_DIR/.deployed-commit" ]]; then
    log "ERROR: .deployed-commit not found"
    exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
    log "ERROR: $ENV_FILE missing"
    exit 1
fi

SLACK_WEBHOOK_URL=$(grep -E '^SLACK_WEBHOOK_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
OPS_INCIDENTS_WEBHOOK=$(grep -E '^OPS_INBOX_SLACK_INCIDENTS_WEBHOOK=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
TELEGRAM_BOT_TOKEN_VAL=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
TELEGRAM_ALLOWED_CHAT_IDS_VAL=$(grep -E '^TELEGRAM_ALLOWED_CHAT_IDS=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
TELEGRAM_PRIMARY_CHAT_ID=$(echo "$TELEGRAM_ALLOWED_CHAT_IDS_VAL" | cut -d',' -f1 | tr -d ' ')
OPS_INBOX_INGEST_TOKEN=$(grep -E '^OPS_INBOX_INGEST_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
OPS_INBOX_BASE_URL=$(grep -E '^OPS_INBOX_BASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
if [[ -z "$OPS_INBOX_BASE_URL" ]]; then OPS_INBOX_BASE_URL="https://app.aware-wave.com"; fi

cd "$WORK_DIR"
git fetch origin main --quiet 2>>"$LOG_FILE" || { log "ERROR: git fetch failed"; exit 1; }

DEPLOYED=$(cat "$DEPLOY_DIR/.deployed-commit" | tr -d '[:space:]')
REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null)

if [[ -z "$DEPLOYED" || -z "$REMOTE_HEAD" ]]; then
    log "ERROR: empty deployed or remote HEAD"
    exit 1
fi

git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null || { log "ERROR: deployed commit not in repo"; exit 1; }

# App-code paths only — ignore governance/tooling commits (same filter as check-drift-and-alert.sh)
APP_PATHS=(
    "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/"
    "lobster-factory/infra/hetzner-phase1-core/nginx/"
    "lobster-factory/infra/hetzner-phase1-core/docker-compose.yml"
)
BEHIND=$(git rev-list --count "${DEPLOYED}..${REMOTE_HEAD}" -- "${APP_PATHS[@]}" 2>/dev/null || echo 0)

if [[ "$BEHIND" -lt 1 ]]; then
    log "OK: no app-code drift (deployed=${DEPLOYED:0:7} origin=${REMOTE_HEAD:0:7})"
    exit 0
fi

# Deploy hold (SSOT: the same origin/main file sg-deploy.sh step 1.85 refuses on). Held drift is
# intentional, so this path stays silent -- no Slack/Telegram every 4h. It is surfaced once per
# session instead, by check-smoke-tests.ps1's deploy_hold check in AO-RESUME.
HOLD_PATH="lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD"
if git -C "$WORK_DIR" cat-file -e "origin/main:$HOLD_PATH" 2>/dev/null; then
    HOLD_REASON="$(git -C "$WORK_DIR" show "origin/main:$HOLD_PATH" 2>/dev/null | grep -m1 '^reason=' | cut -d= -f2- || true)"
    log "HOLD: $HOLD_PATH present, skipping auto-deploy (behind=$BEHIND). reason: ${HOLD_REASON:-unspecified}"
    exit 0
fi

log "DRIFT: deployed=${DEPLOYED:0:7} origin=${REMOTE_HEAD:0:7} app-code behind=$BEHIND -- starting auto-deploy"

post_to_ops_inbox() {
    local event=$1
    if [[ -z "${OPS_INBOX_INGEST_TOKEN:-}" ]]; then
        log "ops-inbox skipped: OPS_INBOX_INGEST_TOKEN not set"
        return 0
    fi
    [[ "$BEHIND" =~ ^[0-9]+$ ]] || BEHIND=0
    local payload
    payload=$(OEVENT="$event" OAPP="$APP" ODEPLOYED="${DEPLOYED:0:12}" OORIGIN="${REMOTE_HEAD:0:12}" OBEHIND="$BEHIND" ORUN_AT="$(ts)" \
        python3 -c 'import json,os; print(json.dumps({"event":os.environ["OEVENT"],"app":os.environ["OAPP"],"deployed_commit":os.environ["ODEPLOYED"],"origin_commit":os.environ["OORIGIN"],"behind":int(os.environ["OBEHIND"]),"run_at":os.environ["ORUN_AT"]}))') || payload=""
    [[ -z "$payload" ]] && { log "ops-inbox: payload build failed, skipping"; return 0; }
    local http
    http=$(curl -sS -o /tmp/opsinbox-resp -w "%{http_code}" \
        -X POST -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${OPS_INBOX_INGEST_TOKEN}" \
        --data "$payload" \
        "${OPS_INBOX_BASE_URL}/api/webhooks/deploy" 2>>"$LOG_FILE" || echo "000")
    if [[ "$http" =~ ^2 ]]; then log "ops-inbox: $event sent: HTTP $http"
    else log "ops-inbox: $event FAILED: HTTP $http: $(head -c 100 /tmp/opsinbox-resp 2>/dev/null)"; fi
    return 0
}

DEPLOY_SUCCESS=0
SMOKE_WARN_SUFFIX=""
ROLLBACK_SUFFIX=""
NEW_COMMIT="${DEPLOYED}"
if bash "$DEPLOY_DIR/scripts/sg-deploy.sh" "$APP" >> "$LOG_FILE" 2>&1; then
    NEW_COMMIT=$(cat "$DEPLOY_DIR/.deployed-commit" | tr -d '[:space:]')
    log "SUCCESS: $APP deployed to ${NEW_COMMIT:0:12}"
    DEPLOY_SUCCESS=1
    # Capture smoke warnings written by sg-deploy.sh step 7
    SMOKE_WARN_SUFFIX=""
    if [[ -f "$DEPLOY_DIR/.smoke-warn" ]]; then
        _sw=$(cat "$DEPLOY_DIR/.smoke-warn" 2>/dev/null || echo "?")
        _sw_count="${_sw%%|*}"; _sw_ts="${_sw##*|}"
        SMOKE_WARN_SUFFIX="\n\n SMOKE_WARN: ${_sw_count} endpoint(s) non-2xx at ${_sw_ts}"
        log "SMOKE_WARN flag detected: $_sw"
    fi
    post_to_ops_inbox "deploy_success"
else
    log "FAILED: sg-deploy.sh exited non-zero for $APP"
    # C1 fix: surface auto-rollback in the failure notification.
    # sg-deploy now exits non-zero AFTER firing rollback-phase1.sh restore on smoke fail.
    if [[ -f "$DEPLOY_DIR/.rollback-triggered" ]]; then
        _rb=$(cat "$DEPLOY_DIR/.rollback-triggered" 2>/dev/null || echo "?")
        if [[ "$_rb" == *"rollback_failures=0|"* ]]; then
            ROLLBACK_SUFFIX="\n\n🔴 AUTO-ROLLBACK FIRED: ${_rb}\n(previous snapshot restored; new code reverted)"
        else
            ROLLBACK_SUFFIX="\n\n🔴 AUTO-ROLLBACK FIRED BUT RESTORE FAILED: ${_rb}\n(URGENT: prod may be running the failed build -- manual check)"
        fi
        log "ROLLBACK flag detected: $_rb"
    fi
    post_to_ops_inbox "deploy_failed"
fi

SUBJECTS=$(cd "$WORK_DIR" && git log --no-merges --format=" - %h %s" --max-count=3 "${DEPLOYED}..${REMOTE_HEAD}" -- "${APP_PATHS[@]}" 2>/dev/null || true)

if [[ "$DEPLOY_SUCCESS" -eq 1 ]]; then
    SLACK_MSG=$(printf ':white_check_mark: *後台自動部署成功 — SG next-admin*\n新版程式碼已上線，共更新 *%s* 個提交\n（技術資訊：auto-deployed, was:`%s` now:`%s` head:`%s`）\n\n最新更新：\n%s' "$BEHIND" "${DEPLOYED:0:12}" "${NEW_COMMIT:0:12}" "${REMOTE_HEAD:0:12}" "$SUBJECTS")
    TG_MSG=$(printf '✅ 後台自動部署成功 — SG next-admin\n新版程式碼已上線，共更新 %s 個提交\n（技術資訊：auto-deployed, was:%s now:%s head:%s）\n\n最新更新：\n%s' "$BEHIND" "${DEPLOYED:0:12}" "${NEW_COMMIT:0:12}" "${REMOTE_HEAD:0:12}" "$SUBJECTS")
else
    SLACK_MSG=$(printf ':x: *後台自動部署失敗，需要手動處理 — SG next-admin*\n程式碼有 *%s* 個更新未能部署，請 SSH 進伺服器手動執行\n修復指令：`/root/lobster-phase1/scripts/sg-deploy.sh next-admin`\n（技術資訊：auto-deploy FAILED, drift=%s, deployed=%s, origin=%s）' "$BEHIND" "$BEHIND" "${DEPLOYED:0:12}" "${REMOTE_HEAD:0:12}")
    TG_MSG=$(printf '❌ 後台自動部署失敗，需要手動處理 — SG next-admin\n程式碼有 %s 個更新未能部署，請 SSH 進伺服器手動執行\n修復指令：/root/lobster-phase1/scripts/sg-deploy.sh next-admin\n（技術資訊：auto-deploy FAILED, drift=%s, deployed=%s, origin=%s）' "$BEHIND" "$BEHIND" "${DEPLOYED:0:12}" "${REMOTE_HEAD:0:12}")
fi

send_slack() {
    local webhook=$1
    local msg=$2
    local tag=$3
    if [[ -n "${webhook:-}" ]]; then
        local payload
        payload=$(TGTEXT="$msg" python3 -c 'import json,os; print(json.dumps({"text":os.environ["TGTEXT"]}))')
        local http
        http=$(curl -sS -o /tmp/slack-resp -w "%{http_code}" -X POST -H "Content-Type: application/json" --data "$payload" "$webhook" 2>>"$LOG_FILE" || echo "000")
        if [[ "$http" =~ ^2 ]]; then log "$tag sent: HTTP $http"
        else log "$tag FAILED: HTTP $http: $(head -c 200 /tmp/slack-resp 2>/dev/null)"; fi
    else
        log "$tag skipped: webhook not set"
    fi
}

SLACK_MSG="${SLACK_MSG}${SMOKE_WARN_SUFFIX}${ROLLBACK_SUFFIX}"
TG_MSG="${TG_MSG}${SMOKE_WARN_SUFFIX}${ROLLBACK_SUFFIX}"
send_slack "${SLACK_WEBHOOK_URL:-}" "$SLACK_MSG" "slack"
send_slack "${OPS_INCIDENTS_WEBHOOK:-}" "$SLACK_MSG" "ops-incidents-slack"

if [[ -n "${TELEGRAM_BOT_TOKEN_VAL:-}" && -n "${TELEGRAM_PRIMARY_CHAT_ID:-}" ]]; then
    TG_PAYLOAD=$(TGCID="$TELEGRAM_PRIMARY_CHAT_ID" TGTEXT="$TG_MSG" python3 -c 'import json,os; print(json.dumps({"chat_id":os.environ["TGCID"],"text":os.environ["TGTEXT"],"disable_web_page_preview":True}))')
    TG_HTTP=$(curl -sS -o /tmp/tg-resp -w "%{http_code}" -X POST -H "Content-Type: application/json" --data "$TG_PAYLOAD" "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_VAL}/sendMessage" 2>>"$LOG_FILE" || echo "000")
    if [[ "$TG_HTTP" =~ ^2 ]]; then log "telegram sent: HTTP $TG_HTTP, chat=$TELEGRAM_PRIMARY_CHAT_ID"
    else log "telegram FAILED: HTTP $TG_HTTP: $(head -c 200 /tmp/tg-resp 2>/dev/null)"; fi
else
    log "telegram skipped: token or chat_id not set"
fi

exit 0
