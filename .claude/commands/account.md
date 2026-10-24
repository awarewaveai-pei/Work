---
name: account
description: Show or switch which Claude subscription background workers use (me = own plan, wda = the unit's Wda Gov seat). Trigger on /account, 換帳號, 切到 wda.
---

Run `python scripts/claude-account.py` with `$ARGUMENTS`:

| `$ARGUMENTS` | run | then |
|---|---|---|
| empty | `show` | report which account workers use and which are logged in |
| `wda` / `me` | `use <account>` | report the switch; then print the takeover line for THIS conversation: `python scripts/claude-account.py resume-cmd <this session's id>` and give it to the operator as one PowerShell block to paste in a terminal (this window cannot change its own account) |
| `init` | `init-wda` | give the operator the printed login steps; they log in by hand (never enter credentials for them) |

Background Claude work on the chosen account: `python scripts/claude-account.py run "<task>"` (Bash `run_in_background: true`; same card-sized rule as `/codex-do` Step 0). Exit 3 = that account hit its limit: tell the operator to type `/account <other>`; never switch by yourself. `cc.py` (API key) stays the last fallback, unchanged.
