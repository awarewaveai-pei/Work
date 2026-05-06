Follow the AO-RESUME protocol (AGENTS.md §快速續接關鍵字).

The hook has already run `scripts/ao-resume.ps1 -FullMainlineParity` and written results to `agency-os/.agency-state/ao-resume-hook-last.json`. Check the `finished_utc` timestamp — if within 120 seconds, skip re-running the script.

Read these files in order:
1. `agency-os/.agency-state/ao-resume-hook-last.json` (log_tail + auto_checkpoint fields)
2. `agency-os/.agency-state/open-tasks-snapshot.md`
3. `agency-os/TASKS.md`
4. `agency-os/WORKLOG.md` (last 30 lines)
5. `agency-os/memory/CONVERSATION_MEMORY.md`

Then output the **AO-RESUME 五段式** response:

1. **已完成** — what was done last session (from WORKLOG + CONVERSATION_MEMORY)
2. **目前進度** — Git status / audit result (exit code, ahead/behind, AUDIT RESULT: PASS?), today's DoD, blocking risks
3. **未完成待辦（TASKS）** — every open `- [ ]` item, listed individually — do NOT summarize or skip any
4. **阻塞/風險** — specific risks with evidence; do NOT write just「無」
5. **下一步** — concrete first action

Do NOT ask the user to manually pull or run any command if the script already ran successfully.
