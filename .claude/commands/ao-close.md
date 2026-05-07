Follow the AO-CLOSE protocol (AGENTS.md §快速續接關鍵字 + `.cursor/rules/40-shutdown-closeout.mdc`).

Before running `ao-close.ps1`, do the following:

1. Review this conversation and `agency-os/TASKS.md` open items
2. Write `AUTO_TASK_DONE` entries into `agency-os/WORKLOG.md` for everything completed this session
3. Update `agency-os/memory/CONVERSATION_MEMORY.md` with a condensed session summary (蒸餾)
4. Update `agency-os/memory/daily/YYYY-MM-DD.md` — fill in **Done today** and **Current state** sections (create the file with today's date if it doesn't exist)

Then run the closeout script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1
```

If `system-health-check` is not 100%, fix issues before committing (or ask the user to confirm `-CompletenessGate warn` if they need to close urgently).

Output the four sections:
- **今日完成**
- **今日未完成**
- **連動檢查**（doc-sync, health gate result）
- **明日優先**
