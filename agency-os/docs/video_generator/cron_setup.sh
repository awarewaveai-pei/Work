#!/usr/bin/env bash
# cron_setup.sh — 安裝每日 / 每週 / 每月排程
# 用法：bash cron_setup.sh
# 會把三條 cron 加進當前使用者的 crontab（已存在則不重複加）。
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$(command -v python3 || command -v python)"
LOG="/var/log/autopublish.log"
# 若無權限寫 /var/log，改用本地 log
if ! touch "$LOG" 2>/dev/null; then
  LOG="$DIR/autopublish.log"
fi

JOBS=(
  "0 9 * * * cd $DIR && $PY master_controller.py >> $LOG 2>&1"
  "0 8 * * 1 cd $DIR && $PY master_controller.py --newsletter >> $LOG 2>&1"
  "0 10 1 * * cd $DIR && $PY master_controller.py --update-old >> $LOG 2>&1"
)

current="$(crontab -l 2>/dev/null || true)"
new="$current"
for job in "${JOBS[@]}"; do
  if ! grep -Fq "$job" <<<"$current"; then
    new="$new"$'\n'"$job"
  fi
done

printf '%s\n' "$new" | grep -v '^$' | crontab -
echo "✅ 已安裝排程（log: $LOG）。檢視：crontab -l"
