# AgencyOS-MonthlyReview

## Metadata

| Field | Value |
|---|---|
| **Name** | `AgencyOS-MonthlyReview` |
| **Routine ID** | `trig_01GWG3NQSPm7SbRdJAN25QdM` |
| **Cron (TPE)** | Day 1 of every month at 01:00 AM (TPE = UTC+8) |
| **Model** | `claude-sonnet-4-6` |
| **Environment** | PEI |
| **Repo** | `https://github.com/awarewaveai-pei/Work` |
| **Env vars** | None |
| **Output** | `agency-os/reports/monthly/monthly-review-YYYY-MM.md` + `monthly-review-LATEST.md` + `agency-os/reports/governance/drift-YYYY-MM.md` |
| **Backfill date** | 2026-06-02 (prompt source recovered from web UI and added to repo SSOT) |

## Purpose

Runs on the 1st of every month at 01:00 AM TPE. Generates a comprehensive monthly review covering:
- Accomplishments (AUTO_TASK_DONE entries this month)
- In-progress work
- System health trends
- Governance docs drift check (runs `scripts/check-governance-docs-drift.ps1`)
- Knowledge & memory highlights
- Next month priorities (top 5)
- Comparison with last month

## Routine prompt (verbatim)

```text
You are the AgencyOS monthly review agent. Generate a comprehensive monthly review and commit it.

STEPS:
1. Run: git pull origin main
2. Get today's date. Determine YYYY-MM (current month) and YYYY-MM-DD (today).
3. Read ALL of these files (skip silently if missing):
   - agency-os/TASKS.md (full file)
   - agency-os/WORKLOG.md (full file)
   - agency-os/memory/CONVERSATION_MEMORY.md
   - agency-os/reports/status/integrated-status-LATEST.md
   - agency-os/reports/weekly/weekly-automation-LATEST.md
   - agency-os/memory/daily/ (all files from current month YYYY-MM-*.md)
   - agency-os/reports/monthly/monthly-review-LATEST.md (previous month, for comparison)
   - agency-os/reports/governance/drift-{previous-month YYYY-MM}.md (if exists, for trend comparison)
3.5. Run the long-term governance docs drift check:
   - bash: pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-governance-docs-drift.ps1
   - This generates agency-os/reports/governance/drift-YYYY-MM.md (current month)
   - Read the generated drift report so you can summarize it in the monthly review (## System Health > Governance docs drift subsection)
   - If pwsh is unavailable, fall back to powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-governance-docs-drift.ps1; if neither exists, skip this step and note 'governance drift check skipped (no PowerShell available)' in the monthly review.
4. Write a monthly review to: agency-os/reports/monthly/monthly-review-YYYY-MM.md
   Format:
   # Monthly Review YYYY-MM
   Generated: YYYY-MM-DD
   ## Accomplishments
   (tasks completed this month per WORKLOG AUTO_TASK_DONE entries; milestones reached)
   ## In Progress
   (all ongoing work and current state from TASKS.md open items)
   ## System Health
   (trends from integrated-status; any ALERT_REQUIRED patterns; build gate history)
   ### Governance docs drift (long-term 4-doc check)
   (Summary from agency-os/reports/governance/drift-YYYY-MM.md: Overall status, status by check table, key findings, mtime drift span. Compare with previous month if drift-{YYYY-MM-1}.md exists. Flag any check that moved from PASS to WARN or WARN to FAIL since last month.)
   ## Knowledge & Memory
   (important decisions, lessons learned, context shifts from CONVERSATION_MEMORY and daily notes)
   ## Next Month Priorities
   (top 5 open tasks from TASKS.md ranked by apparent urgency)
   ## Comparison with Last Month
   (if previous monthly report exists: what improved, what stalled)
5. Also overwrite: agency-os/reports/monthly/monthly-review-LATEST.md with same content
6. In agency-os/WORKLOG.md: find or create heading '## YYYY-MM-DD'. Append:
   - HH:MM : remote-monthly-agent: monthly review YYYY-MM generated -> reports/monthly/monthly-review-YYYY-MM.md (governance drift overall: <PASS|WARN|FAIL>)
7. git add agency-os/reports/monthly/ agency-os/reports/governance/ agency-os/WORKLOG.md
8. git commit -m '[claude] auto: monthly review YYYY-MM + governance drift check'
9. git push origin main

RULES:
- NEVER modify TASKS.md, memory/CONVERSATION_MEMORY.md, or memory/daily/ files
- Only write to reports/monthly/, reports/governance/ (via the script), and append to WORKLOG.md
- Commit prefix must be [claude]
- If push fails, still complete the commit and report why
- Be thorough and analytical; this report is the long-term record of the month
- The governance drift report (step 3.5) is informational, not a gate. Do NOT abort the monthly review if drift check returns WARN or FAIL — just summarize it in the monthly report.
```

## Note on governance drift check

Step 3.5 runs `scripts/check-governance-docs-drift.ps1` which requires PowerShell (pwsh). The routine's cloud sandbox may not have PowerShell available — the prompt includes a fallback (`powershell` binary) and a graceful skip if neither exists. The drift report output path is `agency-os/reports/governance/drift-YYYY-MM.md`.

## Watchdog

`agency-os/reports/monthly/monthly-review-LATEST.md` の mtime 應不超過 35 天。
目前無自動 health-check gate（待補入 `system-health-check.ps1`）。

## Rollback

| Scenario | Action |
|---|---|
| Disable | `claude.ai/code/routines` → toggle off |
| Revert bad commit | `git revert <sha>` then disable until prompt fixed |
| Governance drift report bad | `git revert <sha>` (only touches reports/governance/ and WORKLOG) |
