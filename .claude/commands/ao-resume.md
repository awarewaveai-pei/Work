> **[預授權]** AO-RESUME 為完整預授權操作。`reports/ao-resume/*.md` 存檔寫入及 handoff packet 修剪**直接執行**，R0 逐項批准不適用。

Follow the AO-RESUME protocol (AGENTS.md §快速續接關鍵字).

## Step 0 — Hook state check (MANDATORY before reading anything)

Read `agency-os/.agency-state/ao-resume-hook-last.json`.

**Case A — File exists AND `finished_utc` is within 5 minutes of now AND `exit_code` is 0:**
Hook ran successfully. Proceed to Step 1 reading files below.

**Case B — File missing OR `finished_utc` is more than 5 minutes old OR file has errors OR `exit_code` is non-zero:**

**First: derive WORK_ROOT** — read `"work_root"` field from `ao-resume-hook-last.json`. If the file is missing, run `git rev-parse --show-toplevel` to get WORK_ROOT. All git and script commands below use `<WORK_ROOT>`.

**Then determine sub-type:**

---

### Case B1 — `finished_utc` is within 5 minutes AND `exit_code` is non-zero

`ao-resume.ps1` just ran this session but health gates failed. Since 2026-06-01 `ao-resume.ps1` generates ALL state files even when health gates fail (soft-exit design), state files are fresh.

→ **Proceed directly to Step 1.** Read state files normally.
→ In Section 1, the ⚠️ banner is MANDATORY (per Step 0a). Report specific health gate failures from `log_tail`.
→ Do NOT re-run any scripts. No Step 0b needed.

---

### Case B2 — `finished_utc` is more than 5 minutes old OR file missing

`ao-resume.ps1` either did not run this session, or exited at git-align (L404, before state file generation). State files may be stale.

### Step 0b — Git alignment recovery (Case B2 only)

Read `log_tail` from `ao-resume-hook-last.json`. If it contains `"non-fast-forward"` OR `"git push failed"`:

1. **Check behind count** (run via Bash):
   ```bash
   git -C "<WORK_ROOT>" rev-list --count HEAD..origin/main
   ```
2. **If behind > 0** → run immediately:
   ```bash
   git -C "<WORK_ROOT>" pull --rebase origin main
   ```
3. **If rebase conflict** → check which files:
   - Conflict in `*-LATEST.md` / `*-LATEST.json` / `*-LATEST.txt` only → auto-resolve each with local version:
     ```bash
     git -C "<WORK_ROOT>" checkout --theirs -- <file>
     git -C "<WORK_ROOT>" add -- <file>
     ```
     Then: `git -C "<WORK_ROOT>" rebase --continue`
   - Conflict in ANY other file → `git -C "<WORK_ROOT>" rebase --abort` → list conflicts → stop and ask user
4. **After successful pull --rebase** → `git -C "<WORK_ROOT>" push origin main`
5. **Only after git state is clean**, proceed to Step 0c.

**Why Step 0b exists**: The hook creates an auto-checkpoint commit (ahead=1) when dirty files exist at startup. If the remote is also ahead (cross-machine work pushed while this machine was idle), push is rejected (non-fast-forward). Without `git pull --rebase`, `ao-resume.ps1` exits at git-align and no state files are generated.

### Step 0c — Regenerate all state files (Case B2, after Step 0b)

```powershell
powershell -ExecutionPolicy Bypass -File <WORK_ROOT>\scripts\ao-resume.ps1 -FullMainlineParity
```

- **exit=0**: All state files are fresh. Proceed to Step 1 (same as Case A).
- **exit≠0 AND `ao-resume-hook-last.json` `finished_utc` is now within 5 minutes**: Health gates failed but state files were generated (soft-exit). → This is now Case B1. Proceed to Step 1 with ⚠️ banner.
- **exit≠0 AND log shows git-align failure**: git alignment still failing (auth/network). Report error to user; do not proceed to Step 1 until git is clean.

---

### Step 0a — Hook-failure prominence rule (Phase C2/C3 of plan Z, 2026-05-28)

If `exit_code` is non-zero OR `agency-os/.agency-state/git-fetch-last.json` shows `success: false`:

**The very first line of section 1 MUST be a ⚠️ banner.** Format:

```
⚠️ HOOK FAILED (exit=N) — <one-line root cause from log_tail / steps_summary> — DO NOT TRUST "no new commits" or "Gap 期間" conclusions until git fetch succeeds.
```

Then list remediation steps right after (e.g., `nslookup github.com`, then `git fetch origin --prune`).

**Forbidden in section 3 (已完成) when hook failed**: writing `Gap 期間: repo 看起來無新 commit` or any analogous statement that treats "absence of evidence" as "evidence of absence". That conflation caused 4 days of desktop work to be invisible on 2026-05-28. Always qualify with `(local view only; remote state UNKNOWN due to fetch failure — see Step 0a banner)`.

Also read `agency-os/.agency-state/junction-last.json` if present:
- `verdict=ok` → silent.
- `verdict=repaired` → mention briefly in section 1 ("ℹ️ .claude junction was self-healed this run").
- `verdict=repaired-with-warning` or `verdict=error` → escalate to a banner in section 1 like `⚠️ .claude junction repair needs content review at $env:TEMP\claude-junction-autoheal-*\`.

## Step 1 — Read files in order:
1. `agency-os/.agency-state/ao-resume-hook-last.json` (log_tail + auto_checkpoint fields; may be absent in Case B)
2. `agency-os/.agency-state/external-signals-digest.json` (Telegram + Slack digest)
3. `agency-os/.agency-state/open-tasks-snapshot.md`
4. `agency-os/TASKS.md`
5. `agency-os/.agency-state/worklog-excerpt.md` (WORKLOG since last AO-CLOSE; generated by ao-resume.ps1 hook)
   Fallback: if the excerpt file is missing, read `agency-os/WORKLOG.md` last 30 lines
6. `agency-os/memory/CONVERSATION_MEMORY.md`

Then output the **AO-RESUME 七段式** response:

---

**1. 系統快照**
One-line status: SG/EU 服務狀態 (UP/DOWN) | deploy drift commits | Git ahead/behind/dirty
Source: ao-resume-hook-last.json log_tail + health check output.

Cross-machine import result (從 ao-resume-hook-last.json log_tail 或手動跑 import 的輸出讀取):
List every file checked, with one of these statuses:
- ✅ 覆蓋（updated）— vault 版本與本機不同，已寫入
- ✔ 未變動（unchanged）— SHA256 相同，未覆蓋
- 📋 本機領先（local-ahead）— 同機 vault，本機在上次 ao-close 後有修改，屬正常（下次 ao-close 會 export）
- ⚠ 衝突保留（local-modified/CONFLICT）— 跨機衝突，本機有改動與 vault 不同，保留本機版本
- — 來源不存在（skipped）— vault 檔案不在指定路徑
- ✔ 其他機器匯出較舊（skipped，屬正常）— 筆電 AO-SYNC 存在但日期早於桌機，跳過以保護本機較新資料；本機 MEMORY.md 是最新版。**這不是錯誤。** 下次從筆電 AO-CLOSE 後再切回桌機，才會觸發 import。
- — 同機工作流（skipped）— 只有單機在用，無跨機 AO-SYNC 資料夾

Files to report: `MEMORY.md`、`user-env.ps1`、`.ssh/hetzner_trigger`、`.ssh/id_ed25519`、`.ssh/hostinger_soulful`、`.ssh/config`、`AWARE_WAVE_CREDENTIALS.md`
If import did not run (hook missing / E:\ not mounted / G:\ not accessible), write「import 未執行 — [原因]」and list what needs to be fixed.

**2. 外部信號**
Read `agency-os/.agency-state/external-signals-digest.json`.

**First, output a single header line** showing the exact gap window and its reliability:
```
區間：[gap_window.start_utc → gap_window.end_utc, both converted to CST]（source: [gap_window.source]）
```
Then classify the digest before reporting any messages:

- **`gap_window.is_fresh = true`** AND **`fetch_status = "ok"`**：
  All signals below are from this session's gap (last AO-CLOSE → this AO-RESUME) and are by definition unprocessed. No ambiguity.

- **`gap_window.is_fresh = false`** (source is `ao-resume-last.txt` or `fallback-24h`）：
  ⚠️ **UNRELIABLE WINDOW** — the gap start anchor was missing (ao-close-last.txt not found). Signals may overlap with the previous session. Do NOT report as definitively unprocessed. Offer to re-run: `scripts/fetch-external-signals.ps1`.

- **`fetch_status = "partial"` or `"failed"`**：
  ⚠️ **FETCH FAILED** — one or both APIs returned errors. Show which channels failed and their status strings. Do not guess at content; write「無法讀取 — [channel]: [status]」.

- **Digest is stale** (hook `finished_utc` from ao-resume-hook-last.json is >10 min newer than digest `generated_utc`)：
  ⚠️ **STALE DIGEST** — fetch-signals ran during AO-RESUME but did not refresh the file (API failure or credential issue). Report what the stale digest contains but label every item `[from stale digest — may be already-seen]`. Offer to manually re-run.

ops_inbox_commands（使用者 Bot 指令）：區段訊息數 + 可操作項條列；**0 訊息 = 「操作者本輪無下指令」，正常；不代表無告警**
deploy_events（VPS 部署事件，source=deploy from ops_inbox）：區段筆數 + FAILED/SUCCESS 條列；無則寫「本輪無部署事件」；`endpoint_pending` = 新端點尚未部署，屬正常
Slack #ops-incidents / #infra-alerts: 區段訊息數（不過濾已讀）+ 最新一筆
Cloudflare security: report result from `agency-os/reports/status/cf-security-LATEST.md` (bot=ON/OFF, rules=N) — skip if file missing.
Only include actionable items; skip routine noise.

**3. 已完成**
What was delivered last session (from WORKLOG + CONVERSATION_MEMORY).
If nothing definitive, state that clearly and point to WORKLOG for reference.

**4. 目前進度**
- Lobster Factory Milestone (M1~M5) + 今日 DoD
- Git/Audit: exit code | AUDIT RESULT: PASS? | ahead=N behind=N
- 阻塞/風險: list specific blockers with evidence; do NOT write just「無」— if none found, write「本次盤點：未見需立即處理之阻塞」and state the basis.
  **Source rules**: derive blockers ONLY from (a) open `- [ ]` tasks in TASKS.md, (b) `is_fresh=true` external signals, (c) health check failures in ao-resume-hook log. **Never derive from `- [x]` items** (even if they appear in `### 未完成`); `[x]` = already resolved, not a blocker.

**5. 未完成待辦（TASKS）**
Group tasks by their `####` category header from TASKS.md. Output every open `- [ ]` item — do NOT summarize, skip, or flatten into a single list. **Skip all `- [x]` items**, including any that appear in `### 未完成` (they are completed; `### 未完成` is being cleaned up).

Format:
#### 雙機環境 / 日常開工
- [ ] …

#### 客戶試點 — Soulful Expression
- [ ] …

#### 龍蝦工廠（lobster-factory）
- [ ] …

（以此類推，依 TASKS.md 中的 #### 順序輸出所有分類，空分類省略）

Task count must match `open-tasks-snapshot.md` Total open. If it doesn't, explain why.

**6. 需決策**（選填 — 整節只在有內容時輸出）
Items that cannot proceed without a human choice or action. Each entry must include:
- 類型：[資源 / 策略 / 權限 / 外部]
- 說明：what decision is needed
- 影響：what is blocked until resolved

**7. 下一步**

**Pending handoff packets (check before first action)**:

1. Scan TASKS.md open `- [ ]` rows inside `#### 待釐清 / 明日提醒` for lines containing `→ handoffs/`
2. For each pointer found, read `agency-os/handoffs/<filename>`
3. Display by count:
   - **0 packets**: skip this sub-section entirely
   - **1–3 packets**: inline full packet markdown for each, separated by `---`
   - **4+ packets**: inline the 3 most recent (by `YYYY-MM-DD-HHmm` filename prefix) in full; for the rest list: `- <slug> (handoffs/<filename>, created <date>)` and add: 「回覆「展開 packet <slug>」可查看完整內容」
4. **Missing packet file**: if pointer exists but file not found, print:
   `⚠️ packet 不見 (handoffs/<filename>) — 請確認 git pull 已完成`
   Do NOT fail AO-RESUME for a missing packet.
5. **Path expansion**: replace `$WORK_ROOT` in packet content with the current working directory before displaying.

Then: Concrete first action. If a 需決策 item is blocking, state it first.

---

Do NOT ask the user to manually pull or run any command if the script already ran successfully.

> ⚠️ **七段式輸出完成後立即執行 Step 3（Archive）— 不得跳過。**

## Step 3 — Archive the report (MANDATORY after Step 1 output)

After printing the 七段式 to chat, write the **exact same markdown** to:

```
agency-os/reports/ao-resume/YYYY-MM-DD-HHmm.md
```

Where `YYYY-MM-DD-HHmm` is the local time you began Step 1. Use the `Write` tool.
This is the only way the user can browse past AO-RESUME reports — skipping it
silently breaks the workflow.

### Prune old reports (>30 days)

After writing today's file, list `agency-os/reports/ao-resume/*.md` (Glob),
parse the date prefix of each filename, and delete any whose date is more than
30 days before today. Skip `README.md`. Use the `Bash` tool with `rm` — git
will track the deletions on the next commit.

If the archive folder doesn't exist yet, create it first.

### Prune old handoff packets (>90 days)

Also list `agency-os/handoffs/*.md` (Glob), parse the `YYYY-MM-DD` prefix of each filename,
and delete any whose date is more than 90 days before today.
Skip `SCHEMA.md` and `README.md`. Use the `Bash` tool with `rm`.

### Self-check

If you forgot Step 3, the user is allowed to re-prompt with「你忘了寫 archive」—
acknowledge the lapse and write the file immediately.
