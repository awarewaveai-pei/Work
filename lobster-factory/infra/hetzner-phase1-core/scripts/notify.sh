#!/usr/bin/env bash
# notify.sh [--slack VAR]... < message -- the one way a host script tells the operator (handoffs/2026-10-25-schedules-off-
# trigger C4.1). Always: Telegram (OPS_INBOX_TELEGRAM_CHAT_IDS, when OPS_INBOX_TELEGRAM_NOTIFY_ENABLED is on) and Slack
# #ops-incidents (OPS_INBOX_SLACK_INCIDENTS_WEBHOOK) -- the settings and channels next-admin's ops inbox uses, so host and
# app alerts land in the same places. --slack VAR also posts to the webhook named VAR (a script's own channel).
# Settings come from /root/lobster-phase1/.env by plain read, never `source`. Bot token and webhook URLs reach curl in a
# config on stdin, never argv (`ps` shows argv to every local user). Prints "<channel>=<http code>" per channel to
# stdout. Exit 1 when a configured channel failed, a requested --slack VAR is unset, or nothing is configured at all.
# Tests of any caller must set NOTIFY_ENV_FILE (or NOTIFY_SH): the default is the production .env and really pages.
set -uo pipefail

ENV_FILE="${NOTIFY_ENV_FILE:-/root/lobster-phase1/.env}"
TG_API="${NOTIFY_TELEGRAM_API:-https://api.telegram.org}"
usage() { echo "usage: notify.sh [--slack VAR]... < message" >&2; exit 64; }

extra=()
while [[ $# -gt 0 ]]; do
  [[ "$1" == --slack && "${2:-}" =~ ^[A-Z0-9_]+$ ]] || usage
  extra+=("$2"); shift 2
done

tmp="$(mktemp -d)" || { echo "notify: mktemp failed" >&2; exit 1; }
trap 'rm -f "$tmp/text" "$tmp/tg" "$tmp/slack.json"; rmdir "$tmp"' EXIT
cat > "$tmp/text"
[[ -s "$tmp/text" ]] || { echo "notify: empty message" >&2; exit 64; }
# Any bytes in (command output can be anything) -> valid UTF-8 out; Telegram refuses > 4096 chars, so its copy is clipped.
python3 - "$tmp/text" "$tmp/tg" "$tmp/slack.json" <<'PY' || { echo "notify: cannot prepare the message" >&2; exit 1; }
import json, sys
t = open(sys.argv[1], "rb").read().decode("utf-8", "replace")
open(sys.argv[2], "w", encoding="utf-8").write(t if len(t) <= 4000 else t[:3980] + "\n…（全文在 Slack）")
open(sys.argv[3], "w", encoding="utf-8").write(json.dumps({"text": t}))
PY

get() { [[ -r "$ENV_FILE" ]] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | tr -d '\r"'"'"; }

sent=0; failed=0
# post <label> <secret url> <curl args...>
post() {
  local label="$1" url="$2" code; shift 2
  code="$(printf 'url = "%s"\n' "$url" | curl -s -m 15 -o /dev/null -w '%{http_code}' -K - "$@" || true)"
  echo "$label=${code:-000}"
  if [[ "$code" =~ ^2 ]]; then sent=$((sent + 1)); else failed=$((failed + 1)); fi
}
missing() { echo "$1=not_configured"; failed=$((failed + 1)); }

if [[ "$(get OPS_INBOX_TELEGRAM_NOTIFY_ENABLED | tr '[:upper:]' '[:lower:]')" =~ ^(true|1|yes|on)$ ]]; then
  bot="$(get TELEGRAM_BOT_TOKEN)"; chats="$(get OPS_INBOX_TELEGRAM_CHAT_IDS)"
  chats="${chats:-$(get TELEGRAM_ALLOWED_CHAT_IDS)}" # same fallback as next-admin (ops-inbox/notify/telegram.ts)
  if [[ -n "$bot" && -n "$chats" ]]; then
    for chat in ${chats//,/ }; do
      post "telegram:$chat" "$TG_API/bot$bot/sendMessage" \
        --data-urlencode "chat_id=$chat" --data-urlencode "text@$tmp/tg" --data-urlencode "disable_web_page_preview=true"
    done
  else
    missing telegram # switched on but no token or chat: the channel is broken, not off
  fi
fi

for var in OPS_INBOX_SLACK_INCIDENTS_WEBHOOK "${extra[@]}"; do
  hook="$(get "$var")"
  if [[ -n "$hook" ]]; then
    post "slack:$var" "$hook" -H 'Content-Type: application/json' --data-binary "@$tmp/slack.json"
  elif [[ "$var" != OPS_INBOX_SLACK_INCIDENTS_WEBHOOK ]]; then
    missing "slack:$var" # a script asked for its channel by name: unset is a fault
  fi
done

(( sent + failed > 0 )) || { echo "notify: no channel configured in $ENV_FILE" >&2; exit 1; }
(( failed == 0 ))
