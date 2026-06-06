#!/usr/bin/env bash
# routine-output-watchdog.sh
#
# ALWAYS-ON leg of the Claude-routine freshness watchdog (companion to the local legs:
# AO-RESUME scripts/check-routine-freshness.ps1 + AO-CLOSE system-health-check.ps1 §11).
#
# Why this exists (2026-06-06): the 3 cloud routines' `sources` had drifted to a deleted
# public repo, so their reports silently stopped landing in awarewaveai-pei/Work. The local
# legs only fire when the operator boots their machine. This runs on SG (always-on; has the
# Telegram bot token + a /root/Work checkout) so the operator is alerted on Telegram even
# when their machine is off.
#
# Detection: last-commit date of each report file on origin/main (read-only `git log`, no
# working-tree mutation). Anti-spam: state file — only sends on a stale-set *transition*
# (broke or recovered), never re-sends the same state.
#
# Cron (SG):  17 7 * * *  /root/Work/scripts/routine-output-watchdog.sh   # 07:17 UTC daily
# Dry run:    /root/Work/scripts/routine-output-watchdog.sh --dry-run     # prints, never sends
#
# Rollback: remove the cron line + `rm /root/.routine-watchdog-state`. Script is in repo.

set -uo pipefail

REPO=/root/Work
ENVFILE=/root/lobster-phase1/.env
STATE=/root/.routine-watchdog-state
DRYRUN="${1:-}"

cd "$REPO" 2>/dev/null || { echo "watchdog: $REPO missing"; exit 1; }
git fetch -q origin main 2>/dev/null || { echo "watchdog: git fetch failed"; exit 1; }

now=$(date +%s)

# Report contract — mirrors scripts/check-routine-freshness.ps1 + system-health-check.ps1 §11.
keys=(phase4 weekly monthly)
declare -A rpath=(
  [phase4]=agency-os/reports/repair-center/phase4-LATEST.md
  [weekly]=agency-os/reports/weekly/weekly-automation-LATEST.md
  [monthly]=agency-os/reports/monthly/monthly-review-LATEST.md
)
declare -A maxage=( [phase4]=8 [weekly]=9 [monthly]=35 )
# Bilingual friendly names (中文 / English) so the phone alert is self-explanatory.
declare -A rname=( [phase4]="Phase 4 健檢 / Phase4Weekly" [weekly]="週報 / WeeklyReview" [monthly]="月報 / MonthlyReview" )

stale_lines=""
stale_set=""
for k in "${keys[@]}"; do
  ts=$(git log -1 --format=%ct origin/main -- "${rpath[$k]}" 2>/dev/null)
  if [ -z "$ts" ]; then
    stale_lines+="• ${rname[$k]} — 報告從未產出 / report never produced"$'\n'
    stale_set+="${k}:missing "
  else
    age=$(( (now - ts) / 86400 ))
    if [ "$age" -gt "${maxage[$k]}" ]; then
      stale_lines+="• ${rname[$k]} — ${age} 天未更新 / ${age}d stale (max ${maxage[$k]}d)"$'\n'
      stale_set+="${k}:stale "
    fi
  fi
done

prev=$(cat "$STATE" 2>/dev/null || echo "")
if [ "$stale_set" = "$prev" ]; then
  echo "watchdog: no state change (set='${stale_set}') — silent"
  exit 0
fi

if [ -z "$stale_set" ]; then
  msg="✅ 排程已恢復 / Routines recovered"$'\n\n'
  msg+="中文：先前異常的自動排程已恢復，3 份報告（Phase 4 健檢、週報、月報）都正常更新了。"$'\n'
  msg+="EN: The previously-failing routine(s) recovered — all 3 reports are fresh again in awarewaveai-pei/Work."
else
  msg="⚠️ 排程健康警報 / Routine health alert"$'\n\n'
  msg+="中文：有自動排程沒在更新它的報告。可能原因：指向錯誤的倉庫 / 授權過期 / 被停用 —— 代表這項自動化可能默默停擺了。"$'\n'
  msg+="EN: A scheduled automation stopped updating its report (wrong repo / expired auth / disabled). It may have silently stopped."$'\n\n'
  msg+="受影響 / Affected:"$'\n'"${stale_lines}"$'\n'
  msg+="怎麼處理 / What to do:"$'\n'
  msg+="1. 開 / Open: https://claude.ai/code/routines"$'\n'
  msg+="2. 確認該排程已啟用、來源倉庫為 awarewaveai-pei/Work / Verify it is enabled and its source repo is awarewaveai-pei/Work"$'\n'
  msg+="3. 修好後下次自動跑會再傳「已恢復」/ Once fixed, you'll get a 'recovered' message on the next run"$'\n\n'
  msg+="(SG 永遠在線 watchdog，每天 07:17 UTC 檢查，不重複洗版 / always-on, daily, de-duplicated)"
fi

if [ "$DRYRUN" = "--dry-run" ]; then
  echo "[DRY-RUN] state would change: '${prev}' -> '${stale_set}'"
  echo "[DRY-RUN] would send Telegram:"
  echo "$msg"
  exit 0
fi

# Read creds locally on SG (never leaves the host). Strip surrounding quotes + CR.
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENVFILE" | head -1 | sed -E 's/^[^=]+=//; s/\r$//; s/^"//; s/"$//; s/^'\''//; s/'\''$//')
CHATS=$(grep -E '^OPS_INBOX_TELEGRAM_CHAT_IDS=' "$ENVFILE" | head -1 | sed -E 's/^[^=]+=//; s/\r$//; s/^"//; s/"$//; s/^'\''//; s/'\''$//')
if [ -z "$TOKEN" ] || [ -z "$CHATS" ]; then
  echo "watchdog: missing TELEGRAM creds in $ENVFILE — not sending, state NOT advanced"
  exit 1
fi

sent_ok=1
for chat in $(echo "$CHATS" | tr ',' ' '); do
  [ -z "$chat" ] && continue
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 \
    "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=${msg}")
  echo "watchdog: telegram chat=${chat} http=${code}"
  [ "$code" = "200" ] || sent_ok=0
done

# Only advance state if the alert actually went out — otherwise retry next run.
if [ "$sent_ok" = "1" ]; then
  echo "$stale_set" > "$STATE"
  echo "watchdog: sent + state advanced (set='${stale_set}')"
else
  echo "watchdog: send failed — state NOT advanced, will retry next run"
  exit 1
fi
