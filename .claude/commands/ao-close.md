> **[預授權]** AO-CLOSE 為完整預授權操作。R0 逐項批准在此命令中**不適用**。WORKLOG / memory / daily / archive 寫入直接執行，不得要求使用者批准。若 `verify-closeout-completeness` 失敗，立即自行補寫缺漏的證據行後重跑 `ao-close.ps1`。若腳本因 behind remote 中止，自行 `git pull --ff-only origin main` 後重跑。唯一允許問一題：`git push` 被拒需人類介入，或 health 自修後仍 < 100%（列具體失敗項，**禁止**提議 `-AllowNonPerfectHealth`）。

Follow the AO-CLOSE protocol (AGENTS.md §快速續接關鍵字 + `.cursor/rules/40-shutdown-closeout.mdc`).

**Session window = 上次 AO-RESUME → 本次 AO-CLOSE**

Before writing anything, determine the session window:
- Read `agency-os/.agency-state/ao-resume-last.txt` for the last AO-RESUME timestamp.
- Run `git log --since="<ao-resume-last timestamp>" --oneline` to see ALL commits in this session window.
- This window may span multiple calendar days — do NOT limit to today's date only.

Before running `ao-close.ps1`, do the following:

1. Review ALL git commits since last AO-RESUME (use `git log --since` above) + `agency-os/TASKS.md` open items

1a. **[TASKS sync]** Read every `- [ ]` line under `### 未完成` in `agency-os/TASKS.md`.
    For each open item completed this session, write into today's WORKLOG section:
    ```
    - AUTO_TASK_DONE: <substring>
    ```
    where `<substring>` is a string copied verbatim from that `- [ ]` line that:
    - appears in **exactly one** `- [ ]` line in TASKS.md (multi-match = fatal error in the script)
    - is long enough to be unambiguous (≥ 10 chars, avoid generic words)
    Skip items not completed this session. Skip items already `- [x]`.
    `apply-closeout-task-checkmarks.ps1` does exact substring match — it cannot infer intent.

2. Write `AUTO_TASK_DONE` entries into `agency-os/WORKLOG.md` for everything completed since last AO-RESUME (not just today)
3. Update `agency-os/memory/CONVERSATION_MEMORY.md` with a condensed summary covering the full session window (上次 AO-RESUME → 本次 AO-CLOSE)
4. Update `agency-os/memory/daily/YYYY-MM-DD.md` — use today's date for the file, but **Done today** section must cover the full session window (all dates since last AO-RESUME)

Then run the closeout script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1
```

If `system-health-check` is not 100%, attempt to self-repair. If repair succeeds, proceed. If repair fails, report the specific failing checks and halt — do NOT offer `-AllowNonPerfectHealth` or reduce the threshold.

Output the four sections (all covering 上次 AO-RESUME → 本次 AO-CLOSE):
- **本輪完成**（上次 AO-RESUME 至今）
- **未完成**
- **連動檢查**（doc-sync, health gate result）
- **明日優先**

### Step 2.5 — Lift rule for 未完成 / 明日優先 bullets (Phase Z6, 2026-05-28)

**Hard rule (cross-machine 30-year discipline)**: every `- ` bullet you plan to
write under `## 未完成` or `## 明日優先` MUST also exist as a `- [ ]` line in
`agency-os/TASKS.md` BEFORE the archive write. Reason: archive-only items are
invisible to the next AO-RESUME on a different machine, where the operator's
memory is not available. This caused the 5/28 18:46 "SG deploy 落後 3 commits"
silent drop.

For each bullet planned:
1. Identify a distinctive token (typically the **bold-text title** like `**Batch 3**`).
2. Grep `agency-os/TASKS.md` for `^- \[ \]` lines containing the token.
3. If no match: add a new `- [ ]` entry to TASKS.md under the appropriate
   `####` section, commit it as part of this AO-CLOSE.
4. If the item is genuinely transient (e.g. already resolved during the
   session-close gap, like an auto-deployed drift), annotate the archive bullet:

   ```
   - **<title>** — <description> <!-- archive-only: <one-sentence reason> -->
   ```

   The HTML comment escape hatch skips the lift check while documenting why.

**Mechanical gate**: `scripts/verify-archive-tasks-lift.ps1` runs from
`scripts/system-health-check.ps1` and Add-CriticalFailure on any unlifted bullet.
On next AO-CLOSE / health-check, missing lifts will fail the 100% gate. Read
`agency-os/.agency-state/archive-lift-last.json` for current state.

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
