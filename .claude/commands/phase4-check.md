---
name: phase4-check
description: Manually trigger the Repair Center Phase 4 weekly check. Fallback path -- the scheduled routine is primary.
---

Manually trigger the Repair Center Phase 4 weekly check. This is the **fallback** path — the primary path is the Claude routine `AgencyOS-RepairCenterPhase4Weekly` which runs every Friday 14:00 TPE in Anthropic cloud.

## When to use this command

- Routine is down / Anthropic platform outage
- Want fresh data outside the weekly cadence
- Investigating a stale-watchdog WARN

If routine is healthy, **do not use this command** — let the routine do it. Running this command writes to the same files the routine writes to, which can cause merge conflicts if both fire in the same minute.

## Step 1 — Verify the routine isn't currently running

```bash
/schedule list | grep RepairCenterPhase4Weekly
```

If status shows a run in progress, **stop** — wait for it to finish. Otherwise continue.

## Step 2 — Run the fallback script

The script is saved with UTF-8 BOM so it parses correctly under any Windows codepage:

```powershell
chcp 65001 ; powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase4-weekly-check.ps1 -WorkRoot (Get-Location).Path
```

Add `-SkipTelegram` if you do **not** want to notify the channel (e.g., investigating, not scheduled).

If the script errors with a parse / encoding issue, the BOM has been stripped — re-add it:

```powershell
$p='scripts\phase4-weekly-check.ps1'; $c=[IO.File]::ReadAllText($p,[Text.UTF8Encoding]::new($false)); [IO.File]::WriteAllText($p,$c,[Text.UTF8Encoding]::new($true))
```

## Step 3 — Verify watchdog clear

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\system-health-check.ps1 | Select-String "Phase 4 weekly report"
```

Should show `<N>d old` (not `WARN`).

## Step 4 — Report

Show:
- Overall result (PASS / WARNING)
- Per-check status
- Reminder: this was a manual fallback run — the routine will fire on its next scheduled cron

## Related

- Routine SSOT: `agency-os/automation/claude-routines/phase4-weekly.md`
- Watchdog: `scripts/system-health-check.ps1` §11
- Forensic context: `agency-os/WORKLOG.md` 2026-05-22 entry
