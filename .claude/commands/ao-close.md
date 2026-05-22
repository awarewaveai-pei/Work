Follow the AO-CLOSE protocol (AGENTS.md §快速續接關鍵字 + `.cursor/rules/40-shutdown-closeout.mdc`).

**Session window = 上次 AO-RESUME → 本次 AO-CLOSE**

Before writing anything, determine the session window:
- Read `agency-os/.agency-state/ao-resume-last.txt` for the last AO-RESUME timestamp.
- Run `git log --since="<ao-resume-last timestamp>" --oneline` to see ALL commits in this session window.
- This window may span multiple calendar days — do NOT limit to today's date only.

Before running `ao-close.ps1`, do the following:

1. Review ALL git commits since last AO-RESUME (use `git log --since` above) + `agency-os/TASKS.md` open items
2. Write `AUTO_TASK_DONE` entries into `agency-os/WORKLOG.md` for everything completed since last AO-RESUME (not just today)
3. Update `agency-os/memory/CONVERSATION_MEMORY.md` with a condensed summary covering the full session window (上次 AO-RESUME → 本次 AO-CLOSE)
4. Update `agency-os/memory/daily/YYYY-MM-DD.md` — use today's date for the file, but **Done today** section must cover the full session window (all dates since last AO-RESUME)

Then run the closeout script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1
```

If `system-health-check` is not 100%, fix issues before committing (or ask the user to confirm `-CompletenessGate warn` if they need to close urgently).

Output the four sections (all covering 上次 AO-RESUME → 本次 AO-CLOSE):
- **本輪完成**（上次 AO-RESUME 至今）
- **未完成**
- **連動檢查**（doc-sync, health gate result）
- **明日優先**

## Final Step — Archive the report (MANDATORY after the four sections)

After printing the four-section output to chat, write the **exact same markdown** to:

```
agency-os/reports/ao-close/YYYY-MM-DD-HHmm.md
```

Where `YYYY-MM-DD-HHmm` is the local time you ran `ao-close.ps1`. Use the `Write` tool.
This is the only way the user can browse past AO-CLOSE reports — skipping it
silently breaks the workflow.

### Prune old reports (>30 days)

After writing today's file, list `agency-os/reports/ao-close/*.md` (Glob),
parse the date prefix of each filename, and delete any whose date is more than
30 days before today. Skip `README.md`. Use the `Bash` tool with `rm` — git
will track the deletions on the next commit.

If the archive folder doesn't exist yet, create it first.

### Self-check

If you forgot the archive step, the user is allowed to re-prompt with「你忘了寫 archive」—
acknowledge the lapse and write the file immediately.
