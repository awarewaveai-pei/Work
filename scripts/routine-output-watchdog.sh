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
declare -A rname=( [phase4]=Phase4Weekly [weekly]=WeeklyReview [monthly]=MonthlyReview )

stale_lines=""
stale_set=""
for k in "${keys[@]}"; do
  ts=$(git log -1 --format=%ct origin/main -- "${rpath[$k]}" 2>/dev/null)
  if [ -z "$ts" ]; then
    stale_lines+="- ${rname[$k]}: report MISSING in repo"$'\n'
    stale_set+="${k}:missing "
  else
    age=$(( (now - ts) / 86400 ))
    if [ "$age" -gt "${maxage[$k]}" ]; then
      stale_lines+="- ${rname[$k]}: ${age}d old (max ${maxage[$k]}d)"$'\n'
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
  msg="OK Claude routines recovered — all 3 reports fresh again in awarewaveai-pei/Work."
else
  msg="WARN Claude routine watchdog — report(s) not updating in awarewaveai-pei/Work:"$'\n'"${stale_lines}"$'\n'"A routine may have its source/auth drifted or be disabled. Check https://claude.ai/code/routines"
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
