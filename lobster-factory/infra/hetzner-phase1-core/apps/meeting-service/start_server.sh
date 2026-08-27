#!/usr/bin/env bash
# 在 WSL2（或任何 Linux）啟動 meeting-service，與呼叫端 shell 脫鉤。
#
# 存在理由：Windows 的 Smart App Control 封鎖 av 套件未簽章的 .pyd，該機 SAC
# 為完全鎖定狀態無法關閉，所以主要執行環境改為 WSL2（見 lib/transcribe.py 開頭）。
#
# 為什麼啟動邏輯放在 .sh 而不是全部寫在 start_server.ps1 裡：
# PowerShell 的 Start-Process -ArgumentList 傳遞含空白的參數時不會自動加引號，
# 複雜的 bash 命令列會被空白拆碎（2026-08-27 實測：`echo HELLO > file` 只剩
# `echo` 被執行）。把命令收斂成單一無空白的腳本路徑就繞開整類問題。
#
# 可獨立使用：wsl -d Ubuntu -- bash ~/…/start_server.sh

set -u

PORT=8420
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${MEETING_VENV:-$HOME/mtg-venv/bin/python}"
LOG=/tmp/mtg-server.log

if [ ! -x "$VENV" ]; then
    echo "找不到 venv python: $VENV" >&2
    echo "建立方式見 README「WSL2 執行」章節；或設 MEETING_VENV 指向你的 python" >&2
    exit 1
fi

# 已在監聽就不重複啟動（等冪，重複執行安全）
if (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; then
    exec 3<&- 2>/dev/null
    echo "已經在跑了：http://127.0.0.1:$PORT"
    exit 0
fi

# 模型快取預設指向 Windows 既有的（large-v3/medium 都已下載完成）。
# 這是刻意的：WSL2 內下載數 GB 大檔實測會斷流卡死，共用 Windows 那份可完全
# 避開下載。非 WSL 環境（沒有 /mnt/c）就退回預設 ~/.cache。
# ⚠️ 不能用 $USER：那是 WSL 的使用者名稱（pei），不是 Windows 的（user1115），
# /mnt/c/Users/pei 根本不存在。經 start_server.ps1 啟動時 HF_HOME 已由 Windows
# 端設好所以看不出問題，但獨立執行這支 .sh（README 明列為支援用法）會靜默退回
# ~/.cache 並觸發那個會卡死的多 GB 下載。改問 Windows 自己要使用者名稱。
# cmd.exe 必須在 Windows 可見的工作目錄下執行（cwd 是 Linux 路徑時它會抱怨
# UNC 路徑並回傳空字串——實測 /tmp 下失敗、/mnt/c 下正常），故先 cd。
if [ -z "${HF_HOME:-}" ]; then
    _winuser="$(cd /mnt/c 2>/dev/null && cmd.exe /c 'echo %USERNAME%' 2>/dev/null | tr -d '\r\n')"
    [ -z "$_winuser" ] && _winuser="$USER"
    if [ -d "/mnt/c/Users/$_winuser/.cache/huggingface" ]; then
        export HF_HOME="/mnt/c/Users/$_winuser/.cache/huggingface"
    fi
fi

# start_server.ps1 用 MEETING_HF_TOKEN 轉送（避免與 WSL2 內既有的 HF_TOKEN 打架），
# 這裡還原成套件實際讀取的名稱。直接在 WSL2 手動執行時本來就設 HF_TOKEN，也相容。
if [ -n "${MEETING_HF_TOKEN:-}" ]; then
    export HF_TOKEN="$MEETING_HF_TOKEN"
fi
# 空字串等同未設定：lib/archive.py 對空值會安全停用 Drive 同步而非寫到錯的地方
if [ -z "${MEETING_DRIVE_BASE:-}" ]; then
    unset MEETING_DRIVE_BASE
else
    # Google Drive 這類虛擬磁碟**不會**被 WSL2 自動掛載（automount 只涵蓋它能
    # 列舉成 volume 的實體磁碟），所以 /mnt/h 天生不存在，Drive 同步在搬進
    # WSL2 之後其實已完全失效（2026-08-27 critic 抓到）。這裡補掛 drvfs。
    # 掛載失敗不中斷啟動：同步是選配功能，archive.py 會回報清楚原因。
    _mnt="$(printf '%s' "$MEETING_DRIVE_BASE" | cut -d/ -f3)"   # /mnt/h/... -> h
    if [ -n "$_mnt" ] && [ ! -d "/mnt/$_mnt" ]; then
        _letter="$(printf '%s' "$_mnt" | tr '[:lower:]' '[:upper:]')"
        if sudo -n true 2>/dev/null; then
            sudo -n mkdir -p "/mnt/$_mnt" 2>/dev/null \
              && sudo -n mount -t drvfs "${_letter}:" "/mnt/$_mnt" 2>/dev/null \
              && echo "已掛載 ${_letter}: -> /mnt/$_mnt（Google Drive 同步可用）" \
              || echo "警告：掛載 ${_letter}: 失敗，Drive 同步將停用（本地產出不受影響）" >&2
        else
            echo "警告：/mnt/$_mnt 未掛載且 sudo 需要密碼，Drive 同步將停用。" >&2
            echo "  手動掛載：sudo mkdir -p /mnt/$_mnt && sudo mount -t drvfs ${_letter}: /mnt/$_mnt" >&2
            echo "  永久生效：把上行加進 /etc/fstab 或設定 sudoers NOPASSWD" >&2
        fi
    fi
fi

export PYTHONIOENCODING=utf-8
export PYTHONUNBUFFERED=1

cd "$HERE" || exit 1
setsid nohup "$VENV" app.py > "$LOG" 2>&1 < /dev/null &
disown

# 輪詢等待，不用固定 sleep
for _ in $(seq 1 30); do
    sleep 0.5
    if (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; then
        exec 3<&- 2>/dev/null
        echo "啟動成功 -> http://127.0.0.1:$PORT"
        exit 0
    fi
done

echo "15 秒內沒有偵測到 $PORT 在監聽。log：" >&2
tail -20 "$LOG" >&2
exit 1
