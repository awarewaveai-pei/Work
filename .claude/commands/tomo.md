Follow the `/tomo` carry-over protocol.

## Overview

`/tomo <hint>` — capture unfinished work as a handoff packet so tomorrow's AO-RESUME
picks it up without re-deriving context from chat history.

`/tomo! <hint>` — same, but skip the propose step (write directly).

Packet format SSOT: `agency-os/handoffs/SCHEMA.md`

---

## Step 1 — Secret check (MANDATORY before any write)

Write the hint text to a temp file, then scan using `-WorkRoot + -Path` (avoids Join-Path absolute-path bug on PS5):

```powershell
Set-Content -Path "$env:TEMP\tomo-hint-scan.txt" -Value @("<hint>", "") -Encoding UTF8
powershell -ExecutionPolicy Bypass -File scripts\scan-local-config-for-secrets.ps1 -WorkRoot "$env:TEMP" -Path "tomo-hint-scan.txt"
```

- **Exit 0**: proceed.
- **Exit ≥ 1**: ABORT. Print:
  ```
  ⛔ /tomo ABORT — hint 含疑似 secret（<pattern name>）。請改寫 hint 後重試。
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

Fill all 6 segments per `agency-os/handoffs/SCHEMA.md`:

1. **任務目標** — outcome being worked toward
2. **為什麼做** — motivation, urgency, who asked
3. **已試過** — commands run, approaches tried this session (`尚未開始` if nothing)
4. **卡在哪** — exact blocker or stopping point (`file:line` / error / missing info / decision awaited)
5. **下一步指令** — numbered, concrete, executable steps for the AI picking this up
6. **相關資源** — files (`$WORK_ROOT/` prefix for repo paths), commits (SHA + one-line), VPS paths, known landmines

**Path rule**: all repo paths must use `$WORK_ROOT/...` placeholder. No machine-specific absolute paths.

---

## Step 4 — Propose (skip if `!`)

If `/tomo` (no bang): show full packet preview and ask:

```
📋 /tomo Packet Preview — <slug>

[packet markdown here]

---
回覆：
  go        — 確認，直接寫入
  補:<text>  — 加到第 5 段（下一步）後再寫
  重抓       — 重新抽取脈絡
  取消       — 放棄
```

Wait for user response. Apply `補:` additions to Step 5 of the packet before writing.
If `/tomo!` (bang): skip this step entirely.

---

## Step 5 — Write files

**Compute slug**: lowercase hint, first 3-4 meaningful words, kebab-case.
Example: `tomo 實作 /tomo feature` → slug `tomo-feature`

**Compute filename**: `YYYY-MM-DD-HHmm-<slug>.md` (local time at invocation)

### File 1: Packet

Write `agency-os/handoffs/<filename>` with frontmatter + 6-segment body per SCHEMA.md.

Frontmatter:
```yaml
---
slug: <slug>
created_utc: <ISO 8601 UTC>
hint: "<hint text>"
source_session_summary: "<one sentence: what the session was doing>"
consumed: false
---
```

### File 2: TASKS.md

Find the `#### 待釐清 / 明日提醒` section inside `## Next — 未完成（目前正式隊列）` → `### 未完成`.
Append one line:

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

In today's entry (date header `## YYYY-MM-DD`), append under the last line:

```
- TOMORROW_CAPTURED: <slug> → handoffs/<filename>
```

If no today entry exists, append at end of file:

```markdown
## <YYYY-MM-DD>
- TOMORROW_CAPTURED: <slug> → handoffs/<filename>
```

---

## Step 6 — Checkpoint + push

```powershell
# Stage the three changed files and commit
scripts\commit-checkpoint.ps1 -Message "feat(tomo): capture handoff packet <slug>" -Paths @("agency-os/handoffs/<filename>", "agency-os/TASKS.md", "agency-os/WORKLOG.md")

# commit-checkpoint.ps1 does NOT push — push separately
git push origin main
```

---

## Step 7 — Confirm

Print:

```
✅ /tomo packet saved: agency-os/handoffs/<filename>
   TASKS.md #### 待釐清 / 明日提醒 已新增
   AO-RESUME 明天第 7 段會自動展開此 packet。
```
