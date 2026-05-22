Follow the AO-RESUME protocol (AGENTS.md §快速續接關鍵字).

## Step 0 — Hook state check (MANDATORY before reading anything)

Read `agency-os/.agency-state/ao-resume-hook-last.json`.

**Case A — File exists AND `finished_utc` is within 5 minutes of now:**
Hook ran successfully. Proceed to Step 1 reading files below.

**Case B — File missing OR `finished_utc` is more than 5 minutes old OR file has errors:**
Hook did NOT run (or ran too long ago). Claude MUST actively run these two scripts now via Bash and capture their output for Sections 1 and 2:

```powershell
# Run in D:\Work
powershell -ExecutionPolicy Bypass -File scripts\import-cross-machine-memory.ps1
powershell -ExecutionPolicy Bypass -File scripts\fetch-external-signals.ps1
```

Do NOT skip this step. Do NOT silently assume both passed. Report the actual stdout of each script in Sections 1 and 2 respectively. If either script fails (non-zero exit, exception), report the error verbatim.

## Step 1 — Read files in order:
1. `agency-os/.agency-state/ao-resume-hook-last.json` (log_tail + auto_checkpoint fields; may be absent in Case B)
2. `agency-os/.agency-state/external-signals-digest.json` (Telegram + Slack digest)
3. `agency-os/.agency-state/open-tasks-snapshot.md`
4. `agency-os/TASKS.md`
5. `agency-os/WORKLOG.md` (last 30 lines)
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

Telegram @awarewave_ops_bot: 未讀數量 + 可操作項條列（無則寫「本輪無未讀」）
Slack #ops-incidents / #infra-alerts: 未讀數量 + 最新一筆
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
Concrete first action. If a 需決策 item is blocking, state it first.

---

Do NOT ask the user to manually pull or run any command if the script already ran successfully.

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

### Self-check

If you forgot Step 3, the user is allowed to re-prompt with「你忘了寫 archive」—
acknowledge the lapse and write the file immediately.
