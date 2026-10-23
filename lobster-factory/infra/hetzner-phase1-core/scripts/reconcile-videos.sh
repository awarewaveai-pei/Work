#!/bin/bash
# 影片孤兒對帳（*/15 cron）：補「生成中關頁 / 容器重啟」未記錄的影片進畫廊。idempotent。
#
# 2026-08-26 收進 git（原本只存在於 /root/lobster-phase1/scripts/，是 drift）。sg-deploy 的
# 「sync deploy scripts」步驟會把本目錄 rsync 到 /root/lobster-phase1/scripts/，所以改這裡即可。
#
# 為何要加告警：對帳結果原本只寫進 /var/log/reconcile-videos.log，沒有任何東西讀它。
# 「檔案在 R2 但使用者永遠看不到」這件事因此可以無限期存在而不被發現 —— 偵測器存在但沒有出口，
# 等於沒有偵測器。
#
# 告警綁的是 orphanUnattributable：**唯一需要人介入的數字**（在 R2、不在 media_assets、
# 且擁有者無法判定）。刻意不綁 alreadyRecorded / recorded / checked —— 那些是正常運作的證據。
# 2026-08-26 之前的 skippedLegacy 不能拿來告警：它把「已在畫廊的舊影片」也算進去，
# 在 EU prod 永遠是 2，接上去就是一個永遠在叫的警報器。
set -euo pipefail

ENV_FILE=/root/lobster-phase1/.env
# Telegram 通道的 SSOT **不在** .env，而在這裡（endpoint-alert 的 systemd unit 也讀同一份，
# 見 /etc/systemd/system/awarewave-endpoint-alert.service 的 EnvironmentFile 行）。
# 2026-08-26 實測：.env 裡的 TELEGRAM_* 只存在於 .env.bak* 舊備份，現行值在 /etc/default。
# 只讀 .env 的新告警會靜靜地永遠不發訊息 —— 這是加新告警最容易踩的第一個坑。
TELEGRAM_ENV_FILE=/etc/default/awarewave-endpoint-alert.telegram
STATE_DIR=/root/lobster-phase1/.state
STATE_FILE="${STATE_DIR}/reconcile-videos-last-alert"
LOG_FILE=/var/log/reconcile-videos.log
# 同一個狀態最多每 24h 提醒一次；狀態改變（數字變動 / 恢復正常）則立即提醒。
# 沒有這層去重就是每 15 分一則 = 每天 96 則 = 保證被靜音。
REALERT_SECONDS=86400

# 原版沒有 set -e，缺 .env / 缺密鑰時只會靜靜地用空值 curl。加上 set -euo pipefail 之後，同樣的
# 情況會讓腳本**當場死掉且不留任何訊息** —— 告警腳本自己無聲消失是最糟的失敗模式。所以這兩個
# 前置條件要明確檢查、明確記錄，而不是交給 shell 的預設行為。
NOW_ISO="$(date -u +%FT%TZ)"
mkdir -p "${STATE_DIR}"
if [[ ! -r "${ENV_FILE}" ]]; then
  echo "[${NOW_ISO}] ABORT: ${ENV_FILE} 不存在或不可讀 — 本輪對帳與告警完全沒有執行" >> "${LOG_FILE}"
  exit 1
fi
set -a; . "${ENV_FILE}"; set +a
# 選用：不存在就走下面的 NOTIFY_SKIPPED 分支（會寫 log，不靜默）。
[[ -r "${TELEGRAM_ENV_FILE}" ]] && { set -a; . "${TELEGRAM_ENV_FILE}"; set +a; }
if [[ -z "${OPS_PROXY_SHARED_SECRET:-}" ]]; then
  echo "[${NOW_ISO}] ABORT: OPS_PROXY_SHARED_SECRET 未設定 — 本輪對帳與告警完全沒有執行" >> "${LOG_FILE}"
  exit 1
fi

OUT="$(curl -s -m 120 -X POST -H "x-ops-sync-key: ${OPS_PROXY_SHARED_SECRET}" \
  http://127.0.0.1:3002/api/internal/video/reconcile || echo '{"ok":false,"error":"curl_failed"}')"
echo "[${NOW_ISO}] ${OUT}" >> "${LOG_FILE}"

# 從 JSON 取整數欄位。缺欄位一律當 -1（= 「沒量到」），**不當 0** —— 把「不知道」寫成
# 「沒問題」正是本次要根除的形狀。
# 冒號後允許空白：今天 NextResponse.json() 走 JSON.stringify 不會產生空白，但把告警的正確性
# 押在「輸出永遠緊湊」上，等於哪天有人 pretty-print 就變成永久假警報。
_num() {
  local v
  # `|| true` 不可省：set -euo pipefail 下，欄位不存在時 grep 回非零會讓整支腳本當場死掉 ——
  # 告警腳本自己靜默消失，比沒有告警更糟（看起來一切正常）。
  v="$(printf '%s' "${OUT}" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*[0-9]\+" | head -1 | grep -o '[0-9]\+$' || true)"
  [[ -n "${v}" ]] && printf '%s' "${v}" || printf '%s' "-1"
}
ORPHANS="$(_num orphanUnattributable)"
OK="$(printf '%s' "${OUT}" | grep -o '"ok"[[:space:]]*:[[:space:]]*\(true\|false\)' | head -1 | grep -o '\(true\|false\)$' || true)"

# 三種狀態：ok（無事）／orphans=N（有孤兒）／broken（對帳自己失敗或欄位讀不到）
if [[ "${OK}" != "true" ]]; then
  STATE="broken"
  MSG="🔴 影片對帳失敗
時間：${NOW_ISO}
回應：$(printf '%s' "${OUT}" | head -c 400)"
elif [[ "${ORPHANS}" -lt 0 ]]; then
  STATE="broken"
  MSG="🔴 影片對帳回應缺少 orphanUnattributable 欄位（版本不符？）
時間：${NOW_ISO}
回應：$(printf '%s' "${OUT}" | head -c 400)"
elif [[ "${ORPHANS}" -gt 0 ]]; then
  STATE="orphans=${ORPHANS}"
  MSG="🟡 影片孤兒：${ORPHANS} 支在 R2 但不在畫廊，且無法判定擁有者
時間：${NOW_ISO}
處理：確認歸屬後補記 media_assets 或刪除物件；歸零前這個數字會一直在。
明細：$(printf '%s' "${OUT}" | head -c 400)"
else
  STATE="ok"
  MSG="🟢 影片孤兒已歸零（${NOW_ISO}）"
fi

PREV_STATE=""; PREV_AT=0
if [[ -f "${STATE_FILE}" ]]; then
  PREV_STATE="$(cut -d'|' -f1 "${STATE_FILE}" 2>/dev/null || true)"
  PREV_AT="$(cut -d'|' -f2 "${STATE_FILE}" 2>/dev/null || echo 0)"
  case "${PREV_AT}" in ''|*[!0-9]*) PREV_AT=0 ;; esac
fi
NOW_EPOCH="$(date -u +%s)"

SHOULD_NOTIFY=0
if [[ "${STATE}" != "${PREV_STATE}" ]]; then
  # 狀態改變一律通知 —— 包含「恢復正常」，否則操作者不知道問題已解決。
  # 但首次執行時若本來就正常，不需要為了報平安而發一則。
  [[ -n "${PREV_STATE}" || "${STATE}" != "ok" ]] && SHOULD_NOTIFY=1
elif [[ "${STATE}" != "ok" ]] && (( NOW_EPOCH - PREV_AT >= REALERT_SECONDS )); then
  SHOULD_NOTIFY=1   # 同一個問題持續存在 → 每天提醒一次
fi
printf '%s|%s\n' "${STATE}" "${NOW_EPOCH}" > "${STATE_FILE}"

if [[ "${SHOULD_NOTIFY}" -eq 1 ]]; then
  enabled="$(printf '%s' "${TELEGRAM_NOTIFY_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${enabled}" == "true" && -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_ALLOWED_CHAT_IDS:-}" ]]; then
    for chat_id in ${TELEGRAM_ALLOWED_CHAT_IDS//,/ }; do
      curl -s -m 15 -X POST \
        -d "chat_id=${chat_id}" \
        --data-urlencode "text=${MSG}" \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" >/dev/null 2>&1 || true
    done
    echo "[${NOW_ISO}] NOTIFIED state=${STATE}" >> "${LOG_FILE}"
  else
    # 通道沒設定＝告警實際上不存在。寫進 log 讓它至少留下痕跡，而不是靜默吞掉。
    echo "[${NOW_ISO}] NOTIFY_SKIPPED (telegram not configured) state=${STATE}" >> "${LOG_FILE}"
  fi
fi
