# Handoff Packet Schema

> SSOT for `/tomo` write-side and `ao-resume.md` read-side.
> Both files reference this schema — do NOT define the format in either file independently.

## Frontmatter (required)

Every packet at `agency-os/handoffs/YYYY-MM-DD-HHmm-<slug>.md` must include:

```yaml
---
slug: <kebab-case identifier, derived from hint, first 3-4 words>
created_utc: <ISO 8601, UTC, e.g. 2026-05-24T16:30:00Z>
hint: "<user's original /tomo hint — redacted of any secrets>"
source_session_summary: "<one sentence: what the session was doing>"
---
```

Pending/consumed state is determined by the TASKS.md `- [ ]` / `- [x]` row (the only SSOT). See `agency-os/handoffs/README.md`.

## 續接語（required，body 第一行）

`**續接語**：「<開場句>」` — 開場句格式見 `agency-os/AGENTS.md` §5 Session 切換（`續做 <任務名>：讀 <SSOT 路徑>，從 <第一個具體動作> 開始；完成 = <條件>。建議模型：<模型>`）。`/clear` 提醒直接印這一行，操作者貼進新 session 即開工。

## 6-Segment Body

### 1. 任務目標
What this task is trying to accomplish. One paragraph, outcome-oriented.

### 2. 為什麼做
Motivation, urgency, who asked for it, what breaks if not done.

### 3. 已試過
Anything attempted this session: commands run, approaches rejected, dead ends.
If nothing tried yet, write `尚未開始`.

### 4. 卡在哪
The exact blocker or stopping point — what the AI needs to pick up from.
Be concrete: `file:line`, error message, missing permission, decision awaited.

### 5. 下一步指令
Actionable numbered steps for the AI picking this up.
Include exact commands, file paths, tool calls. No abstract verbs ("investigate", "check").

### 6. 相關資源
- **Files**: list paths using `$WORK_ROOT/...` for repo paths
- **Commits**: recent relevant SHAs + one-line descriptions
- **VPS / external**: absolute paths for server-side resources
- **Known landmines**: things that will break if the AI doesn't know

## Path Placeholder Rule

Use `$WORK_ROOT` as a placeholder for the monorepo root in all repo-relative paths.

| ✅ Correct | ❌ Wrong |
|-----------|---------|
| `$WORK_ROOT/agency-os/TASKS.md` | `C:\Users\USER\Work\agency-os\TASKS.md` |
| `/root/lobster-phase1/` (VPS) | — VPS absolute paths are fine |

`ao-resume.md` Step 7 replaces `$WORK_ROOT` with `cwd` at read time.

## Secret Redact Rule

`/tomo` scans the hint via `scripts/scan-local-config-for-secrets.ps1` before writing.
If a pattern matches → **ABORT** + warn user to rewrite hint without secrets.

Patterns checked: see `scripts/scan-local-config-for-secrets.ps1 §$patterns` (12 patterns, canonical list — do not duplicate here).
