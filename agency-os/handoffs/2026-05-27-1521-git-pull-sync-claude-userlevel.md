---
slug: git-pull-sync-claude-userlevel
created_utc: 2026-05-27T07:21:00Z
hint: "第二台機器：git pull && .\\scripts\\sync-claude-userlevel.ps1 -Mode merge"
source_session_summary: "升級 git-log-injector + auto-repair-guard 從 exit-0（靜默無效）到 exit-2 BLOCK，20/20 smoke tests pass，已 push"
---

### 1. 任務目標

在第二台機器（筆電）同步今日 hook 升級，使 exit-2 BLOCK 版本的
`git-log-injector.js` + `auto-repair-guard.js` 在筆電的 `~/.claude/hooks/` 生效。

### 2. 為什麼做

桌機今日完成 exit-2 hook 升級並 push（commits 4d1c3e8, 6f55b89, 7f3a78e）。
架構根因：Claude Code 的 exit-0 stderr 完全不可見，兩個 advisory hooks 實質無效。
筆電不同步 → 筆電上 git-log-injector / auto-repair-guard 仍是舊版靜默 hook，規則無強制效果。

### 3. 已試過

桌機已完成全部工作：syntax OK、critic Deep review 0C/2M fixed、20/20 smoke tests、
real exec test（Write tool block + re-issue pass）、AGENTS.md 機械閘標籤更新、已 push。
第二台機器尚未執行任何動作。

### 4. 卡在哪

需要在**第二台機器**手動執行兩個指令（無法遠端執行，需在筆電操作）。

### 5. 下一步指令

1. `git pull origin main`
2. `.\scripts\sync-claude-userlevel.ps1 -Mode merge`
3. 確認輸出含 `~ git-log-injector.js` + `~ auto-repair-guard.js`（update 狀態）
4. sync 腳本 exit 1 是正常的（ao-close.md 被 IDE 鎖定），只要 "hooks synced" 出現即成功

### 6. 相關資源

- **Files**: `$WORK_ROOT/mcp/claude-userlevel/hooks/git-log-injector.js`
- **Files**: `$WORK_ROOT/mcp/claude-userlevel/hooks/auto-repair-guard.js`
- **Commits**: `7f3a78e` — exit-2 hook 升級 + AGENTS.md + WORKLOG（auto-checkpoint）
- **Commits**: `4d1c3e8` — 原始 hook 建立（M1-M4+P1）
- **Known landmines**: sync 腳本 exit 1 ≠ 失敗；ao-close.md 始終被 IDE 鎖定，屬正常
- **架構筆記**: Claude Code 只把 exit-2 stderr 轉給 Claude；exit-0 永遠靜默
