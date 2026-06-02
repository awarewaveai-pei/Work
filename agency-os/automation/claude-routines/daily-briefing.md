# AgencyOS-DailyBriefing

## Metadata

| Field | Value |
|---|---|
| **Name** | `AgencyOS-DailyBriefing` |
| **Routine ID** | `trig_01XoSCqJQu6DDKVJw6Lvobpd` |
| **Cron (TPE)** | Every day at 08:00 (TPE = UTC+8) |
| **Model** | `claude-sonnet-4-6` |
| **Environment** | PEI |
| **Repo** | `https://github.com/awarewaveai-pei/Work` |
| **Env vars** | None |
| **Output** | `agency-os/memory/daily/YYYY-MM-DD.md` (scaffold only; AO-CLOSE fills content) |
| **Backfill date** | 2026-06-02 (prompt source recovered from web UI and added to repo SSOT) |

## Purpose

Runs every morning at 08:00 TPE. Creates the daily note scaffold for today with:
- Blank sections for AO-CLOSE to fill in (Done today / Current state / Next steps)
- Auto-generated list of all open `- [ ]` tasks from TASKS.md
- 1-2 sentences of yesterday's context from the last WORKLOG entry

**Idempotent**: if the file already has non-empty Done today / Current state / Next steps content, exits without overwriting. Safe to re-run.

## Routine prompt (verbatim)

```text
You are the AgencyOS daily briefing agent. Create today's daily note scaffold with open tasks.

STEPS:
1. Run: git pull origin main
2. Get today's date: run `date +%Y-%m-%d` → use as YYYY-MM-DD.
3. Check if `agency-os/memory/daily/YYYY-MM-DD.md` already exists AND has non-scaffold content (Done today / Current state sections are filled in). If yes, exit without overwriting.
4. Read:
   - `agency-os/TASKS.md` (open `- [ ]` items only)
   - `agency-os/WORKLOG.md` (last 20 lines — yesterday closeout context)
5. Write `agency-os/memory/daily/YYYY-MM-DD.md`:
# Daily Note - YYYY-MM-DD

## Done today
(fill in at AO-CLOSE)

## Current state
(fill in at AO-CLOSE)

## Next steps
(fill in at AO-CLOSE)

## Open tasks (auto-generated at 08:00 TPE)
(list every - [ ] item from TASKS.md, one per line, with full title)

## Yesterday context
(1-2 sentences from last WORKLOG entry)

6. git add agency-os/memory/daily/YYYY-MM-DD.md
7. git commit -m "[claude] auto: daily scaffold YYYY-MM-DD"
8. git push origin main

RULES:
- NEVER overwrite a daily note that already has non-empty Done today / Current state / Next steps content
- NEVER modify TASKS.md, WORKLOG.md, or CONVERSATION_MEMORY.md
- Commit prefix must be [claude]
- If push fails, still commit locally and report why
- If nothing changed (file already existed), exit silently with no commit
```

## Watchdog

`agency-os/memory/daily/` 的最新檔案應為今日或昨日。若 AO-RESUME 時發現最新 daily note 超過 2 天前，代表 routine 停火。

目前無自動 watchdog gate（待補入 `system-health-check.ps1`）。

## Rollback

| Scenario | Action |
|---|---|
| Disable | `claude.ai/code/routines` → toggle off |
| Bad scaffold committed | `git revert <sha>` |
| Routine overwrote filled note | Restore from git history: `git checkout <prev-sha> -- agency-os/memory/daily/YYYY-MM-DD.md` |
