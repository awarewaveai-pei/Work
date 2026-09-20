---
name: tomo
description: Write a cross-session carry-over handoff packet. Writes immediately with no preview and no confirmation step.
argument-hint: [hint]
---

Follow the `/tomo` carry-over protocol.

## Overview

`/tomo <hint>` — write a detailed handoff note into TASKS.md so tomorrow's AI can pick up immediately. No preview, no confirmation, no push.

---

## Step 1 — Context extraction

Gather in parallel:

| Source | What to extract |
|--------|----------------|
| `git status` + `git diff HEAD --stat` | Modified / staged files (names only) |
| `git log --oneline -5` | Recent commit trail |
| Conversation (this session) | Files touched; key decisions; what was tried; what failed |
| Hint text | User's explicit carry-over intent |
| TASKS.md open `- [ ]` rows | Any related open tasks (avoid duplicating) |

---

## Step 2 — Write TASKS.md entry

**Target section**: `#### I. 📥 收件匣（`/tomo` 落地區，待分類）` under `### 未完成`.

> Renamed 2026-08-26 (was `#### 待釐清 / 明日提醒`). TASKS.md is now sorted by **who is blocking**
> (A ⏰ deadline / B 🔒 you / C 🔒 external / D-G ▶️ actionable / H 🧊 wont-do), and a fresh /tomo
> packet does not yet know its blocker. Section I is the deliberate landing zone; triage into A-H
> happens at the next AO-RESUME or board cleanup. Do NOT invent a new section.

If the section doesn't exist, create it as the LAST `####` under `### 未完成` (after `#### H.`):

```markdown
#### I. 📥 收件匣（`/tomo` 落地區，待分類）
> `/tomo` 自動寫入此分類

```

**Entry format** — write as a single `- [ ]` bullet. The goal is that a fresh AI reading this knows EXACTLY what to do without reading chat history:

```
- [ ] **<一行任務標題>**：<背景一句> 根因/卡點：<確切 file:line 或 error>。已試：<只寫避免重工的事實，沒有就省略>。**下一步**：① <確切指令/路徑> ② <下一步> ...（夠 AI 直接動手）。
```

**Writing principles**:
- 下一步 is the most important part — numbered, concrete, immediately executable
- Include exact file paths, line numbers, error messages, command strings
- Context/background: 1-2 sentences max, skip anything derivable from code
- No prose, no "why we designed it this way", no repetition of hint

**Append** the new `- [ ]` line after the last existing entry in that section (or after the `>` note if section is empty).

---

## Step 3 — Local commit

```powershell
scripts/commit-checkpoint.ps1 -Message "feat(tomo): <slug>" -Paths @("agency-os/TASKS.md")
```

Where `<slug>` = first 3 ASCII words from hint, kebab-case. All-CJK hint → `tomo-HHmmss`.

---

## Step 4 — Confirm

Print:

```
✅ /tomo saved to TASKS.md #### I. 📥 收件匣
   AO-RESUME 下次 §8 下一步會顯示此條目。
```
