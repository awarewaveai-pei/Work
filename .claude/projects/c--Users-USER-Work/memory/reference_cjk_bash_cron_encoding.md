---
name: reference-cjk-bash-cron-encoding
description: "CJK in bash scripts run via SG cron/ssh mojibakes; fix = base64 template + file + curl text@file; verify via python ON the server, never via ssh→PowerShell display"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 67b8f6a1-fe4a-4954-97e7-d8f65319ee72
---

Sending **bilingual/CJK Telegram (or any UTF-8 output) from a bash script on the SG VPS** (cron/non-interactive ssh) corrupts the Chinese into mojibake while English stays fine. Root cause: bash's multibyte handling is locked to the locale at **startup**, and the inherited cron/ssh locale is not reliably UTF-8 (`en_US.UTF-8` was NOT applied; only `C.UTF-8` exists and even invocation-prefix was flaky). An in-script `export LC_ALL=...` is **too late** (lexer already tokenised). String ops (param expansion, echo) on multibyte then produce invalid bytes.

**Bulletproof fix (used in `scripts/routine-output-watchdog.sh`)**: keep the script source **pure ASCII** — embed the CJK message as a **base64 string**; at runtime `base64 -d` into a **file**, splice ASCII dynamic parts with `LC_ALL=C awk` (byte mode, copies CJK verbatim), and `curl --data-urlencode "text@<file>"`. bash never touches the CJK bytes → locale-independent.

**Verification trap (cost me ~30 tool calls)**: viewing the output via `ssh → PowerShell → base64 decode` shows **false mojibake** — that display path mangles it, NOT the real data. ALWAYS verify on the server itself: `... | python3 -c "import sys; sys.stdin.buffer.read().decode('utf-8'); print('OK')"` or `od -An -tx1` (e2 9a a0=⚠️, e6 8e 92=排). The real Telegram is the only ground truth — ask the user.

Regenerate base64 templates: write UTF-8 file → `base64 -w0` → replace `WARN_B64=`/`REC_B64=`. See [[project-routine-watchdog-system]].
