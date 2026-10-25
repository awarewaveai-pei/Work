#!/bin/bash
# 影片孤兒對帳（cron.d/awarewave-schedules：台北 06:00、18:00）：補「生成中關頁 / 容器重啟」未記錄的影片進畫廊。idempotent。
# 2026-10-24 從每 15 分改成每天兩次：影片很少生成，每 15 分只是讓「部署那幾秒剛好打到」變成每天的假警報。
# 同一輪內失敗會重試（RETRIES 次、間隔 RETRY_SLEEP 秒），部署換容器的空檔撐得過去；全部失敗才算 broken。
# broken 時 exit 1，cron-run.sh 記錄下來，/ops/schedules 顯示「執行失敗」。
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
# 通知走 notify.sh（Telegram＋#ops-incidents，設定讀 .env；2026-10-25 起取代原本讀 /etc/default 的 Telegram 直送）。
STATE_DIR=/root/lobster-phase1/.state
STATE_FILE="${STATE_DIR}/reconcile-videos-last-alert"
LOG_FILE=/var/log/reconcile-videos.log
# 同一個狀態最多每 24h 提醒一次；狀態改變（數字變動 / 恢復正常）則立即提醒。
# 狀態檔的時間 = 上次「通知」的時間，不是上次執行（2026-10-24 前每輪都覆寫它，24h 重提醒從未觸發過）。
# 23h, not 24h: with runs 12h apart, 24h exactly is missed whenever this run started a second earlier.
REALERT_SECONDS=82800
RETRIES="${RECONCILE_RETRIES:-3}"
RETRY_SLEEP="${RECONCILE_RETRY_SLEEP:-60}"

# 原版沒有 set -e，缺 .env / 缺密鑰時只會靜靜地用空值 curl。加上 set -euo pipefail 之後，同樣的
# 情況會讓腳本**當場死掉且不留任何訊息** —— 告警腳本自己無聲消失是最糟的失敗模式。所以這兩個
# 前置條件要明確檢查、明確記錄，而不是交給 shell 的預設行為。
NOW_ISO="$(date -u +%FT%TZ)"
# Taken at the start, not after the retries: runs 12h apart must compare start to start.
NOW_EPOCH="$(date -u +%s)"
mkdir -p "${STATE_DIR}"
if [[ ! -r "${ENV_FILE}" ]]; then
  echo "[${NOW_ISO}] ABORT: ${ENV_FILE} 不存在或不可讀 — 本輪對帳與告警完全沒有執行" >> "${LOG_FILE}"
  exit 1
fi
set -a; . "${ENV_FILE}"; set +a
if [[ -z "${OPS_PROXY_SHARED_SECRET:-}" ]]; then
  echo "[${NOW_ISO}] ABORT: OPS_PROXY_SHARED_SECRET 未設定 — 本輪對帳與告警完全沒有執行" >> "${LOG_FILE}"
  exit 1
fi

_ok() { printf '%s' "$1" | grep -o '"ok"[[:space:]]*:[[:space:]]*\(true\|false\)' | head -1 | grep -o '\(true\|false\)$' || true; }
for attempt in $(seq 1 "${RETRIES}"); do
  # 空回應（連線被重設、容器剛起來）與 curl 失敗同樣算失敗；2026-10-23 兩次 broken 都是空回應。
  OUT="$(curl -s -m 120 -X POST -H "x-ops-sync-key: ${OPS_PROXY_SHARED_SECRET}" \
    http://127.0.0.1:3002/api/internal/video/reconcile || true)"
  [[ -n "${OUT}" ]] || OUT='{"ok":false,"error":"curl_failed"}'
  echo "[${NOW_ISO}] attempt ${attempt}/${RETRIES}: ${OUT}" >> "${LOG_FILE}"
  [[ "$(_ok "${OUT}")" == "true" ]] && break
  if (( attempt < RETRIES )); then sleep "${RETRY_SLEEP}"; fi
done

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
OK="$(_ok "${OUT}")"

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

SHOULD_NOTIFY=0
if [[ "${STATE}" != "${PREV_STATE}" ]]; then
  # 狀態改變一律通知 —— 包含「恢復正常」，否則操作者不知道問題已解決。
  # 但首次執行時若本來就正常，不需要為了報平安而發一則。
  [[ -n "${PREV_STATE}" || "${STATE}" != "ok" ]] && SHOULD_NOTIFY=1
elif [[ "${STATE}" != "ok" ]] && (( NOW_EPOCH - PREV_AT >= REALERT_SECONDS )); then
  SHOULD_NOTIFY=1   # 同一個問題持續存在 → 每天提醒一次
fi
# 只有通知了（或狀態變了）才更新時間；否則保留上次通知的時間，24h 重提醒才算得出來。
STAMP="${PREV_AT}"
[[ "${SHOULD_NOTIFY}" -eq 1 || "${STATE}" != "${PREV_STATE}" ]] && STAMP="${NOW_EPOCH}"
printf '%s|%s\n' "${STATE}" "${STAMP}" > "${STATE_FILE}"

if [[ "${SHOULD_NOTIFY}" -eq 1 ]]; then
  # 沒有任何通道或有通道失敗 → 寫進 log，不靜默吞掉。
  if NOTIFY_OUT="$(printf '%s' "${MSG}" | "$(dirname "$0")/notify.sh" 2>&1)"; then
    echo "[${NOW_ISO}] NOTIFIED state=${STATE} $(echo ${NOTIFY_OUT})" >> "${LOG_FILE}"
  else
    echo "[${NOW_ISO}] NOTIFY_INCOMPLETE state=${STATE} $(echo ${NOTIFY_OUT})" >> "${LOG_FILE}"
  fi
fi

# 對帳本身失敗 = 這一輪沒有完成工作（exit 1）；孤兒是對帳成功找到的事實，由上面的 Telegram 負責（exit 0）。
if [[ "${STATE}" == "broken" ]]; then exit 1; fi
exit 0
