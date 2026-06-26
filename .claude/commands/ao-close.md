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

> **⚠️ 自修 = 重新診斷，禁止照抄症狀標籤（2026-06-08 根因）。**
> 每個 health gate fail **必須當場用工具實測確認真因**，再修——**不得**複製上次 AO-CLOSE 報告的措辭當結論。
> 真實教訓：6/5→6/6 把「sync drift = hooks object→array」原話照抄，但徹查證明該標籤從 6/2 就錯（真因是 `~/.claude/mcp.json` 被 runtime 重填，object↔array 早在 5/14 已由 `verify-settings-governed-keys.mjs` 中和）。照抄讓錯誤診斷與「已解決」假象一路傳遞，根因永不被修。
> 規則：① fail 訊息來自哪個 gate script → 讀那支 script 的 exit 條件；② 跑該 gate 看**實際輸出**（如 `sync-claude-userlevel.ps1 -Mode verify` 印出 drifted key）；③ 修完**重跑該 gate 確認 exit 0**；④ 連動檢查段寫**這次實測到的真因**，不是上次的標籤。
> 註：`ao-close.ps1` 已內建 Claude Code sync 自癒（verify→偵測 drift 才 merge），多數 sync drift 不再需要手動處理。

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

> **Token gotcha (codified 2026-06-12 after 2nd recurrence)**: the matcher only
> reads the FIRST ~30 chars of an *un-bolded* bullet. A bullet that LEADS with
> parenthetical/decoration prefix — `（主線）…`, `（次要）…`, `【明日優先】…` — yields a
> useless prefix token and FAILS the lift gate even when the task IS on TASKS.md
> (false negative, not a real silent-drop). **Rule: whenever a bullet leads with
> such decoration, wrap the exact identifier that appears in the TASKS.md `- [ ]`
> line in `**bold**`** so the bold-token path matches regardless of prefix —
> e.g. `- （主線）app.aware-wave **Stage 1 接通入口**（本日未動）。`. The same
> `Stage 1 接通入口` bullet defeated the gate in BOTH the 0333 and 1820 archives
> on 2026-06-11 before this was codified.
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

### Step 2.6 — Trust ao-close.ps1 internal verify chain (Phase Z7, 2026-05-30)

**禁止** 在 `ao-close.ps1` 返回 PASS 後重跑下列任一腳本：
- `scripts/verify-build-gates.ps1`
- `scripts/system-health-check.ps1`
- `scripts/verify-archive-tasks-lift.ps1`
- `scripts/ensure-claude-junction.ps1`（例外：`agency-os/.agency-state/junction-last.json` verdict ≠ `ok` 時允許單獨跑修補）

**理由**：`ao-close.ps1` 內部已含完整 verify chain（system-health-check → verify-build-gates → archive-lift gate 12c → verify-closeout-completeness）。重複跑只會：
1. 浪費 30-60s wall-clock
2. 觸發多餘的 ALLOW prompt（每跑一次 PowerShell 就一次 prompt，違反「1 ALLOW per AO-CLOSE」SOP 目標）
3. 不增加正確性（chain 是 deterministic，輸入無變不會改變結果）

**配套機械閘**：`ao-close.ps1` preflight 已自動偵測 ahead commits 是否全為 `^\[claude\] (checkpoint:|chore: AO-CLOSE)` 並自動 bypass `-AllowAheadCommits`（Phase Z7-A，line 163-184）；operator 無須手動加 flag、agent 無須額外驗證。

**例外的例外**：若 `ao-close.ps1` 因 behind remote 中止 → 跑 `git pull --ff-only origin main` 後重跑 `ao-close.ps1`（本檔開頭 [預授權] 段已授權，無須額外批准）；**不要** 在此情境下手動跑 verify-build-gates 「先確認」。

## Final Step — Archive the report (MANDATORY after the four sections)

**`ao-close.ps1` now machine-writes a skeleton report** at the END of a successful close
(2026-06-10), at the **exact path it prints** — look for:

```
AO-CLOSE: report skeleton written -> agency-os/reports/ao-close/YYYY-MM-DD-HHmm.md
AO-CLOSE: OVERWRITE that file with the full four-section report ...
```

That `YYYY-MM-DD-HHmm` is bound to the commit minute (NOT a wall-clock you pick), so a
report **always exists** and the filename always matches the AO-CLOSE sync commit. Your job:
**`Write` the exact same four-section markdown you printed to chat OVER that exact file**
(do not pick your own timestamp; do not leave the `AUTO-SKELETON` stub). A new machine gate
(`prior-close archive report guard`) blocks the NEXT close if that file is missing, so this
is no longer discretionary.

> If the script printed `report already present -> ...` instead, the file existed (e.g. you
> pre-wrote it) — still overwrite it with the final four-section content.

### Prune old reports (>90 days)

After writing today's file, list `agency-os/reports/ao-close/*.md` (Glob),
parse the date prefix of each filename, and delete any whose date is more than
90 days before today. **Never delete the most-recent report** (the one the gate keys off,
i.e. the latest AO-CLOSE sync commit's file), even if a >90-day session gap would otherwise
make it prunable. Skip `README.md`. Use the `Bash` tool with `rm` — git
will track the deletions on the next commit.

If the archive folder doesn't exist yet, create it first.

### Self-check

If you forgot the archive step, the user is allowed to re-prompt with「你忘了寫 archive」—
acknowledge the lapse and write the file immediately.
