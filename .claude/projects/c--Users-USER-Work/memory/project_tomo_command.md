---
name: project-tomo-command
description: "/tomo and /tomo! command — carry-over handoff packet feature. Trigger, file locations, consumed flow, cross-machine sync path."
metadata: 
  node_type: memory
  type: project
  originSessionId: 6983769d-da81-4407-8cdd-432044bf24a1
---

`/tomo <hint>` — 一句話 trigger 把未完成工作打包成 handoff packet，隔天 AO-RESUME 第 7 段自動 inline 展開。

**Why**: 操作者每次告一段落都要手動說「明天提醒我做 X 並寫入 task」；/tomo 把這個動作自動化。

**Deployed**: 2026-05-25，commit cad1f43 + d392ff8

**檔案位置**:
- Command spec: `.claude/commands/tomo.md` (7-step flow)
- Packet格式 SSOT: `agency-os/handoffs/SCHEMA.md`
- Packets 存放: `agency-os/handoffs/YYYY-MM-DD-HHmm-<slug>.md`
- TASKS.md 分類: `#### 待釐清 / 明日提醒` (在 `### 未完成` 最前面)

**Trigger variants**:
- `/tomo <hint>` — propose-before-write (預覽 → user 回 go/補:/重抓/取消)
- `/tomo! <hint>` — 直接寫，跳過 propose

**Pending/consumed 判斷**:
- `- [ ] … → handoffs/<file>` = pending (AO-RESUME 第 7 段 inline)
- `- [x] … → handoffs/<file>` = consumed (AO-RESUME 跳過)
- SSOT 是 TASKS.md row 狀態，packet frontmatter **無** consumed 欄位（C1 fix, 2026-05-25）

**AO-RESUME 展開邏輯** (ao-resume.md 第 7 段):
- 0 packets → 不顯示
- 1-3 packets → 逐一 inline 全文
- 4+ packets → 最新 3 份 inline，其餘列 pointer + 「展開 packet <slug>」提示

**跨機同步**: `agency-os/handoffs/` 在 repo 內，git pull 天然同步兩台機器。

**Prune**: AO-RESUME Step 3 自動刪除 > 90 天的 packets（SCHEMA.md / README.md 不刪）

**Secret gate**: hint 掃描前先寫 `$env:TEMP\tomo-hint-scan.txt` (`@(hint, "")` 確保 2 行)，用 `scan-local-config-for-secrets.ps1 -WorkRoot "$env:TEMP" -Path "tomo-hint-scan.txt"` 掃描，exit ≥ 1 → ABORT

**How to apply**: 每次操作者說想把今天工作帶到明天繼續，就用 /tomo。
