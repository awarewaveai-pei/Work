# AgencyOS-WeeklyReview

## Metadata

| Field | Value |
|---|---|
| **Name** | `AgencyOS-WeeklyReview` |
| **Routine ID** | `trig_01WanBfvAZvx5TR8xAXjxKVp` |
| **Cron (TPE)** | Every Monday at 09:00 (TPE = UTC+8) |
| **Model** | `claude-sonnet-4-6` |
| **Environment** | PEI |
| **Repo** | `https://github.com/awarewaveai-pei/Work` |
| **Env vars** | None |
| **Output** | `agency-os/reports/weekly/weekly-summary-YYYY-MM-DD.md` + `weekly-automation-LATEST.md` |
| **Backfill date** | 2026-06-02 (prompt source recovered from web UI and added to repo SSOT) |

## Purpose

Runs every Monday at 09:00 TPE. Generates a weekly status report covering:
- Completed items (AUTO_TASK_DONE entries from WORKLOG)
- All open tasks from TASKS.md grouped by area
- System health snapshot
- Risks & blockers
- Memory highlights (key decisions worth noting)

## Incident history

**2026-05-25**: Auto-disabled (`auto_disabled_repo_access`) after repo went PRIVATE on 2026-05-22. API re-enable on 2026-05-30; but 2026-06-01 fire also failed (same cause). **2026-06-02**: Resolved by operator re-authorizing GitHub OAuth via `claude.ai/code/routines` Edit → reconnect repository. Next scheduled fire: 2026-06-08 09:00 TPE.

**Root cause**: Repo visibility change PUBLIC→PRIVATE broke GitHub OAuth for infrequently-firing routines. Daily routine survived (token kept active by daily fires); weekly routine's 7-day silence caused auth expiry.

**Lesson**: After any repo visibility change, verify all routines within 24h via `claude.ai/code/routines`.

## Routine prompt (verbatim)

```text
You are the AgencyOS weekly review agent. Generate a weekly status report and commit it.

STEPS:
1. Run: git pull origin main
2. Get today's date (run: date +%Y-%m-%d). Use it as YYYY-MM-DD throughout.
3. Read ALL of these files (skip silently if missing):
   - agency-os/TASKS.md
   - agency-os/WORKLOG.md
   - agency-os/memory/CONVERSATION_MEMORY.md
   - agency-os/reports/status/integrated-status-LATEST.md
   - agency-os/reports/weekly/weekly-automation-LATEST.md
   - agency-os/memory/daily/ (last 7 days)
4. Write a weekly summary report to: agency-os/reports/weekly/weekly-summary-YYYY-MM-DD.md
   Format:
   # Weekly Summary YYYY-MM-DD
   ## Completed this week
   (list AUTO_TASK_DONE entries and done items from WORKLOG)
   ## Open tasks
   (all - [ ] items from TASKS.md, grouped by area)
   ## System health
   (based on latest integrated-status report)
   ## Risks & blockers
   (from TASKS/WORKLOG)
   ## Memory highlights
   (key decisions or context worth noting)
5. Also overwrite: agency-os/reports/weekly/weekly-automation-LATEST.md with same content
6. In agency-os/WORKLOG.md: if a heading '## YYYY-MM-DD' exists, append under it; if not, add it at end. Append:
   - HH:MM : remote-weekly-agent: weekly summary generated -> reports/weekly/weekly-summary-YYYY-MM-DD.md
7. git add agency-os/reports/weekly/ agency-os/WORKLOG.md
8. git commit -m '[claude] auto: weekly summary YYYY-MM-DD'
9. git push origin main

RULES:
- NEVER modify TASKS.md, memory/CONVERSATION_MEMORY.md, or memory/daily/ files
- Only write to reports/weekly/ and append to WORKLOG.md
- Commit prefix must be [claude]
- If push fails, still complete the commit and report why push failed
- Be factual and concise; base everything on what is actually in the files
```

## Watchdog

`agency-os/reports/weekly/weekly-automation-LATEST.md` 的 mtime 應不超過 8 天。
目前無自動 health-check gate（待補入 `system-health-check.ps1`）。

## Rollback

| Scenario | Action |
|---|---|
| Disable | `claude.ai/code/routines` → toggle off |
| Re-enable after auto-disable | `claude.ai/code/routines` → Edit → reconnect `awarewaveai-pei/Work` → Save → Enable |
| Revert bad commit | `git revert <sha>` then disable until prompt fixed |
