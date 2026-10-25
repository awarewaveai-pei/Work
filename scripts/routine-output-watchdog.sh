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

# Bilingual (中/EN) message templates are stored base64-encoded so the source stays pure
# ASCII end-to-end. Raw CJK literals in this .sh got mojibake'd through the Windows-authored
# -> git -> non-UTF-8 cron/bash chain (2026-06-06); base64 -d emits exact UTF-8 bytes
# regardless of locale, so the Chinese half always renders correctly in Telegram.
# Regenerate via: print template to a UTF-8 file, then `base64 -w0`. {{AFFECTED}} is filled
# at runtime with an ASCII-only routine list.
WARN_B64="4pqg77iPIOaOkueoi+WBpeW6t+itpuWgsSAvIFJvdXRpbmUgaGVhbHRoIGFsZXJ0CgrkuK3mlofvvJrmnInoh6rli5XmjpLnqIvmspLlnKjmm7TmlrDlroPnmoTloLHlkYrvvIjlj6/og73ljp/lm6DvvJrmjIflkJHpjK/oqqTnmoTlgInluqvvvI/mjojmrIrpgY7mnJ/vvI/ooqvlgZznlKjvvInvvIzku6PooajpgJnpoIXoh6rli5XljJblj6/og73pu5jpu5jlgZzmk7rkuobjgIIKRU46IEEgc2NoZWR1bGVkIGF1dG9tYXRpb24gc3RvcHBlZCB1cGRhdGluZyBpdHMgcmVwb3J0ICh3cm9uZyByZXBvIC8gZXhwaXJlZCBhdXRoIC8gZGlzYWJsZWQpLiBJdCBtYXkgaGF2ZSBzaWxlbnRseSBzdG9wcGVkLgoK5Y+X5b2x6Z+/IC8gQWZmZWN0ZWTvvIhQaGFzZTRXZWVrbHk9UGhhc2UgNCDlgaXmqqLvvIxXZWVrbHlSZXZpZXc96YCx5aCx77yMTW9udGhseVJldmlldz3mnIjloLHvvIk6Cnt7QUZGRUNURUR9fQrmgI7purzomZXnkIYgLyBXaGF0IHRvIGRvOgoxLiDplovllZ8gLyBPcGVuOiBodHRwczovL2NsYXVkZS5haS9jb2RlL3JvdXRpbmVzCjIuIOeiuuiqjeipsuaOkueoi+W3suWVn+eUqOOAgeS+hua6kOWAieW6q+eCuiBhd2FyZXdhdmVhaS1wZWkvV29yayAvIFZlcmlmeSBpdCBpcyBlbmFibGVkIGFuZCBpdHMgc291cmNlIHJlcG8gaXMgYXdhcmV3YXZlYWktcGVpL1dvcmsKMy4g5L+u5aW95b6M5LiL5qyh6Ieq5YuV6LeR5pyD5YaN5YKz5LiA5bCB44CM5bey5oGi5b6p44CNLyBPbmNlIGZpeGVkIHlvdSdsbCBnZXQgYSAicmVjb3ZlcmVkIiBtZXNzYWdlIG9uIHRoZSBuZXh0IHJ1bgoKKFNHIOawuOmBoOWcqOe3miB3YXRjaGRvZ++8jOavj+WkqSAwNzoxNyBVVEMg5qqi5p+l77yM5LiN6YeN6KSH5rSX54mIIC8gYWx3YXlzLW9uLCBkYWlseSwgZGUtZHVwbGljYXRlZCk="
REC_B64="4pyFIOaOkueoi+W3suaBouW+qSAvIFJvdXRpbmVzIHJlY292ZXJlZAoK5Lit5paH77ya5YWI5YmN55Ww5bi455qE6Ieq5YuV5o6S56iL5bey5oGi5b6p77yM5aCx5ZGK5Y+I5q2j5bi45pu05paw5YiwIGF3YXJld2F2ZWFpLXBlaS9Xb3JrIOS6huOAggpFTjogVGhlIHByZXZpb3VzbHktZmFpbGluZyByb3V0aW5lKHMpIHJlY292ZXJlZCDigJQgcmVwb3J0cyBhcmUgbGFuZGluZyBpbiBhd2FyZXdhdmVhaS1wZWkvV29yayBhZ2Fpbi4="

REPO=/root/Work
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
# ASCII-only routine names — the 中/EN legend lives in the base64 template, so this dynamic
# list stays pure ASCII and is locale-safe to build/substitute in bash.
declare -A rname=( [phase4]=Phase4Weekly [weekly]=WeeklyReview [monthly]=MonthlyReview )

stale_lines=""
stale_set=""
for k in "${keys[@]}"; do
  ts=$(git log -1 --format=%ct origin/main -- "${rpath[$k]}" 2>/dev/null)
  if [ -z "$ts" ]; then
    stale_lines+="- ${rname[$k]}: report never produced"$'\n'
    stale_set+="${k}:missing "
  else
    age=$(( (now - ts) / 86400 ))
    if [ "$age" -gt "${maxage[$k]}" ]; then
      stale_lines+="- ${rname[$k]}: ${age}d stale (max ${maxage[$k]}d)"$'\n'
      stale_set+="${k}:stale "
    fi
  fi
done

prev=$(cat "$STATE" 2>/dev/null || echo "")
if [ "$stale_set" = "$prev" ]; then
  echo "watchdog: no state change (set='${stale_set}') — silent"
  exit 0
fi

# Build the message in a FILE — bash string ops corrupt multibyte UTF-8 under this host's
# non-UTF-8 cron locale, so the CJK never passes through a bash variable. base64 -d emits
# exact UTF-8 bytes; LC_ALL=C awk copies the CJK lines verbatim (byte mode) and splices in
# the ASCII affected list; curl reads the file directly. 100% locale-independent.
MSGFILE=$(mktemp "${TMPDIR:-/tmp}/wd_msg.XXXXXX")
trap 'rm -f "$MSGFILE"' EXIT
if [ -z "$stale_set" ]; then
  printf '%s' "$REC_B64" | base64 -d > "$MSGFILE"
else
  printf '%s' "$WARN_B64" | base64 -d | LC_ALL=C awk -v aff="$stale_lines" \
    'index($0,"{{AFFECTED}}"){printf "%s", aff; next} {print}' > "$MSGFILE"
fi

if [ "$DRYRUN" = "--dry-run" ]; then
  echo "[DRY-RUN] state would change: '${prev}' -> '${stale_set}'"
  echo "[DRY-RUN] message file ${MSGFILE}:"
  cat "$MSGFILE"
  exit 0
fi

# One sender for every host alert (notify.sh, synced from lobster-factory/infra/hetzner-phase1-core/scripts):
# Telegram + #ops-incidents, settings from the host .env. It prints one line per channel.
sent_ok=0
"${NOTIFY_SH:-/root/lobster-phase1/scripts/notify.sh}" < "$MSGFILE" && sent_ok=1

# Only advance state if the alert actually went out — otherwise retry next run.
if [ "$sent_ok" = "1" ]; then
  echo "$stale_set" > "$STATE"
  echo "watchdog: sent + state advanced (set='${stale_set}')"
else
  echo "watchdog: send failed — state NOT advanced, will retry next run"
  exit 1
fi
