Run the Repair Center Phase 4 weekly check immediately AND re-register the Friday 14:00 recurring cron (resets the 7-day expiry clock).

## Step 1 — Run the check now

Execute `scripts/phase4-weekly-check.ps1` via Bash:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase4-weekly-check.ps1 -WorkRoot (Get-Location).Path
```

Capture and display the full output. If the script is missing, report the error and stop.

## Step 2 — Re-register the Friday 14:00 cron

After the check completes (success or warning), use CronCreate to re-register the recurring job:
- cron: `0 14 * * 5`
- recurring: true
- durable: true
- prompt: the full Phase 4 check prompt (same as in this command — run `scripts/phase4-weekly-check.ps1` + send Telegram)

Report the new job ID so the user can track it.

## Step 3 — Report

Show a one-paragraph summary: check results + cron re-registered until (today + 7 days).
