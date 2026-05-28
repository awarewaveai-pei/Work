Follow the `/tomo` carry-over protocol.

## Overview

`/tomo <hint>` — capture unfinished work as a handoff packet so tomorrow's AO-RESUME
picks it up without re-deriving context from chat history. Always writes directly — no preview, no confirmation prompt.

Packet format SSOT: `agency-os/handoffs/SCHEMA.md`

---

## Step 1 — Secret check (MANDATORY before any write)

Use the **Write tool** to write the hint to a temp file (avoids PowerShell quote-injection):

1. Write tool → file `$env:TEMP\tomo-hint-scan.txt` — content: hint text on line 1, one empty line 2.
   - If Write tool returns "File has not been read yet": Read `$env:TEMP\tomo-hint-scan.txt` first, then retry Write.
2. Then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/scan-local-config-for-secrets.ps1 -WorkRoot "$env:TEMP" -Path "tomo-hint-scan.txt"
```

- **Exit 0**: proceed.
- **Exit ≥ 1**: ABORT. Print:
  ```
  ⛔ /tomo ABORT — hint 含疑似 secret（<pattern name>）。
  若 hint 是討論 secret 相關的 bug（非包含真實憑證），請用 <TOKEN> 替代後重試。
  例："修 JWT decode bug，token=<TOKEN>"
  ```
  Do NOT write any file.

---

## Step 2 — Context extraction

Gather from these sources in parallel:

| Source | What to extract |
|--------|----------------|
| `git status` + `git diff HEAD --stat` | Modified / staged files |
| `git log --oneline -5` | Recent commit trail |
| Conversation (this session) | Files Read/Edit/Write; key decisions; what was tried |
| Hint text | User's explicit carry-over intent |
| TASKS.md open `- [ ]` rows | Any related open tasks |

---

## Step 3 — Generate packet (SCHEMA.md format)

**寫作原則：讓陌生 Claude 打開就能馬上動手。**
- 段 5（下一步指令）是唯一必須詳細的段落 — 寫成可直接執行的編號步驟。
- 其他段落：**1-2 行為上限**；沒有阻塞意義的背景一律省略。
- 不要寫散文、不要重複 hint 內容、不要展開「為什麼這樣設計」。

Fill all 6 segments per `agency-os/handoffs/SCHEMA.md`:

1. **任務目標** — 一行：要達成什麼結果
2. **為什麼做** — 一行：只寫 blocking reason；純提醒型直接寫 `定時驗收`
3. **已試過** — 只列有助於避免重工的事實；空白時寫 `尚未開始`
4. **卡在哪** — 一行：確切阻礙（`file:line` / error / 等待什麼）；純等待時寫 `等 <時間>`
5. **下一步指令** — 編號步驟，每步含確切指令或路徑；這是全包最重要的段落
6. **相關資源** — 只列執行 Step 5 實際需要的檔案；known landmines 只寫會讓 Claude 出錯的陷阱

**Path rule**: all repo paths must use `$WORK_ROOT/...` placeholder. No machine-specific absolute paths.

---

## Step 4 — Write files

**Compute slug**: extract first 3 ASCII words from hint (skip CJK/non-ASCII tokens), lowercase kebab-case.
- ≥ 2 ASCII tokens found: join first 3 with `-`. Example: `修 ops-inbox CLEAR bug` → `ops-inbox-clear`
- < 2 ASCII tokens (all-CJK hint): use `tomo-HHmmss`. Example: `明天繼續` → `tomo-143052`

**Compute filename**: `YYYY-MM-DD-HHmm-<slug>.md` (local time at invocation)

**Write order and failure recovery**:
1. Write File 1 (packet) first.
2. Write File 2 (TASKS.md) second — if this fails, delete File 1 and ABORT.
3. Write File 3 (WORKLOG) third — if this fails, leave File 1 + File 2 in place (packet discoverable via TASKS pointer); print `⚠️ WORKLOG write failed — packet + TASKS pointer saved, run checkpoint manually`.
4. Proceed to Step 6 only if all 3 files written (or only WORKLOG failed and user accepts).

### File 1: Packet

**Collision check**: before writing, check if `agency-os/handoffs/<filename>` already exists.
If it does, append `-2` to the slug and recompute filename; repeat until unique.

Write `agency-os/handoffs/<filename>` with frontmatter + 6-segment body per SCHEMA.md.

Frontmatter:
```yaml
---
slug: <slug>
created_utc: <ISO 8601 UTC>
hint: "<hint text>"
source_session_summary: "<one sentence: what the session was doing>"
---
```

### File 2: TASKS.md

Grep TASKS.md for the literal string `#### 待釐清 / 明日提醒` (unique in file — verified).
Append one line immediately after the last existing `- [ ]` row in that section (or after the `>` note line if section is empty):

```
- [ ] <hint one-liner> → handoffs/<filename>
```

If the section does not exist yet, create it as the **first sub-section** inside `### 未完成`
(before `#### 雙機環境 / 日常開工`):

```markdown
#### 待釐清 / 明日提醒
> `/tomo` 自動寫入此分類；handoff packet 路徑見 `agency-os/handoffs/`

- [ ] <hint one-liner> → handoffs/<filename>
```

### File 3: WORKLOG.md

Find (or create) a `### Tomorrow captured (/tomo)` subsection under today's `## YYYY-MM-DD` heading.
Insert it **before** any existing `### <topic>` subsections (immediately after the `## YYYY-MM-DD` line).
Append one bullet inside it:

```
- TOMORROW_CAPTURED: <slug> → handoffs/<filename>
```

If the subsection already exists today, append the bullet at the end of it.

If no today entry exists, append at end of file:

```markdown
## <YYYY-MM-DD>

### Tomorrow captured (/tomo)
- TOMORROW_CAPTURED: <slug> → handoffs/<filename>
```

---

## Step 5 — Checkpoint + push

```powershell
# Stage the three changed files and commit
scripts/commit-checkpoint.ps1 -Message "feat(tomo): capture handoff packet <slug>" -Paths @("agency-os/handoffs/<filename>", "agency-os/TASKS.md", "agency-os/WORKLOG.md")

# commit-checkpoint.ps1 does NOT push — push separately
git push origin main
# If push fails (branch behind remote): ⚠️ print "push failed — run `git pull --rebase && git push origin main` manually"
```

---

## Step 6 — Confirm

Print:

```
✅ /tomo packet saved: agency-os/handoffs/<filename>
   TASKS.md #### 待釐清 / 明日提醒 已新增
   AO-RESUME 下次第 7 段會顯示此 packet（≤3 件全文展開；多於 3 件以摘要列出）。
```
