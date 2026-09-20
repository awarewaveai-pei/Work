---
name: ao-close
description: Run the full pre-authorized AO-CLOSE end-of-day shutdown: WORKLOG evidence lines, memory and daily notes, health gate, archive, commit and push. Trigger on 收工, 晚安, bye, done, 先這樣, 走了.
---

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

**每一條 bullet 必須明確宣告它住在哪裡，二選一，沒有第三種寫法**（2026-08-24 改版：
舊版靠 bold token / 滑動視窗 / 前綴猜測，同日一次噴出 4 條假失敗，猜測引擎已刪除。
同一原則見 `AGENTS.md`「只信任明確宣告，資料不夠明確就修資料，不要教程式碼用巧合猜測」）：

1. **在任務板上** → 加 `<!-- tasks-ref: <substring> -->`

   ```
   - **<title>** — <description> <!-- tasks-ref: <TASKS.md 該條 - [ ] 行裡的一段字> -->
   ```

   **解析不變量：ref 必須命中「恰好一條」open `- [ ]` 行。**
   - 命中 0 條 → FAIL（東西不在板上，正是這道閘要抓的靜默漏接）
   - 命中 ≥2 條 → **FAIL**（閘無法證明是哪一條，等於什麼都沒證明）。訊息會列出所有
     候選，把 ref 加長到唯一為止即可
   - 比對針對**整行**，不截斷 —— 真實任務行動輒數千字元，識別用的參照（尤其 handoff
     連結）常在敘述深處。防「短 ref 撞到無關敘述」靠的是上面的唯一性規則，不是截斷

   **動作順序**：先確認 TASKS.md 真的有那條（沒有就先新增 `- [ ]` 並在本次 AO-CLOSE
   一起 commit），再寫 ref。

   > **handoff bullet 也走這條路**。舊版有個「文字裡帶 `handoffs/<slug>` 就自動算數」
   > 的捷徑，2026-08-24 移除：實測 `2026-06-27-customer-service-u6-chatwoot-handoff`
   > 這個 slug **同時出現在 3 條不同的 open 任務裡**，slug 根本不是唯一識別碼，那條
   > 捷徑建立在一個假前提上。handoff slug 仍然是很好的 `tasks-ref` 值，只是要像其他
   > 東西一樣被宣告並證明唯一。

2. **刻意不進任務板** → 加 `<!-- archive-only: <理由> -->`

   ```
   - **<title>** — <description> <!-- archive-only: <一句話理由> -->
   ```

   用於真正短暫的項目（session gap 中已自行解決）、或已由其他機制追蹤（例如
   `spawn_task` 背景任務）。**禁止**拿它來消音「其實有在 TASKS.md 追蹤」的項目 ——
   那是寫假 metadata，該用 path 1。

   **`<理由>` 必填、不可空白**（閘會擋 `<!-- archive-only: -->`）。長度不限 ——
   「已解決」這種 3 字理由完全合格；閘只驗「你有沒有寫」，寫得好不好是人看的。

沒有任何標註的 bullet 一律 FAIL，閘不會替你猜 —— 因為「這到底是不是任務」是個
必須被回答的問題，用猜的回答正是這道閘存在的理由。

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

**Then commit + push that overwrite yourself** (2026-09-03 — critic finding M-C on the
`ao-close.ps1` scoped-add fix, TASKS.md 544). `ao-close.ps1` commits and pushes the
**skeleton** at write time, but your `Write` of the real four-section content happens
*after* that — under the old `git add -A` the next close's blind stage-everything swept
it in for you; under the new scoped add nothing does that automatically, so without this
step your real report never reaches origin and only the `AUTO-SKELETON` stub does (which
the file's own text defines as *"seeing this stub committed means the agent forgot to fill
it"* — exactly backwards). Right after the `Write` above:

```bash
git add -- agency-os/reports/ao-close/YYYY-MM-DD-HHmm.md
git commit -m "$(cat <<'EOF'
[claude] docs: AO-CLOSE report — YYYY-MM-DD HHmm

Fills in the AUTO-SKELETON stub ao-close.ps1 committed at close time with the
real four-section report.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

(substitute the real `YYYY-MM-DD-HHmm` stamp). This is a single named-path `git add`, so
`git-add-scope-tracker.js` / `git-commit-scope-guard.js` pass it through normally — no ACK
needed.

### Prune old reports

**Nothing to do by hand.** `ao-close.ps1` runs `scripts/prune-reports.ps1` before staging,
which enforces `agency-os/reports/retention.json` across every report directory — not just
this one. The 90-day horizon for `reports/ao-close/` is preserved there verbatim, along with
the rule that the most-recent report is never deleted even past the horizon.

This used to be prose executed by the agent with Glob + `rm`, covering `reports/ao-close/`
only. On 2026-08-26 that was the sole retention rule in a tree of 24 report directories
holding 5,000+ files, so it moved into a mechanism that covers all of them and reports any
directory that declares no retention at all.

If the archive folder doesn't exist yet, create it first.

### Self-check

If you forgot the archive step, the user is allowed to re-prompt with「你忘了寫 archive」—
acknowledge the lapse and write the file immediately (then commit + push it per the step
above — writing alone no longer reaches origin).
