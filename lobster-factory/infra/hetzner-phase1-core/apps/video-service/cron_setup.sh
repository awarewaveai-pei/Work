#!/bin/bash
# cron_setup.sh — 設定每日自動排程
#
# 用法：
#   ./cron_setup.sh                 # 用 venv 的 python，每天 09:00 執行
#   PY=/usr/bin/python3 ./cron_setup.sh   # 自訂 python
#   HOUR=8 MIN=30 ./cron_setup.sh         # 自訂時間
#
# 注意：cron 不會載入 .env 的 shell session，但 controller 透過 python-dotenv
#       讀取專案目錄下的 .env，所以排程指令會 cd 進專案目錄再執行。

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 預設用專案 venv 的 python；沒有就 fallback 系統 python3
PY="${PY:-$DIR/.venv/bin/python}"
[ -x "$PY" ] || PY="$(command -v python3)"

HOUR="${HOUR:-9}"
MIN="${MIN:-0}"
LOG="${LOG:-$DIR/autopublish.log}"

CRON_JOB="$MIN $HOUR * * * cd $DIR && $PY $DIR/controller.py >> $LOG 2>&1"

# 加入 crontab（先移除舊的同專案項，避免重複）
( crontab -l 2>/dev/null | grep -v "$DIR/controller.py"; echo "$CRON_JOB" ) | crontab -

echo "cron 排程設定完成"
echo "  python : $PY"
echo "  時間   : 每天 $(printf '%02d:%02d' "$HOUR" "$MIN")"
echo "  log    : $LOG"
echo ""
echo "目前 crontab："
crontab -l | grep "$DIR/controller.py" || true
echo ""
echo "看執行 log： tail -f $LOG"
