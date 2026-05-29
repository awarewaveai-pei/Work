---
slug: sync-userlevel-allow
created_utc: 2026-05-29T03:39:00Z
hint: "筆電同步：切換到筆電後需要跑 .\scripts\sync-claude-userlevel.ps1 -Mode merge 讓 template 的更動生效（allow list 是 preserveKey，需要手動把三條也加進去，或 copy settings.json）。"
source_session_summary: "修復桌機反覆要求 approve powershell 的問題，在 settings.json + settings.template.json 加了三條 PowerShell 萬用字元 allow"
---

### 1. 任務目標

筆電的 `~/.claude/settings.json` 同步三條 PowerShell 萬用字元 allow，讓筆電也不再反覆要求 approve powershell。

### 2. 為什麼做

桌機今日已修（2026-05-29），但 `permissions.allow` 是 `preserveKeys`，`sync-claude-userlevel.ps1 -Mode merge` 不會自動補入 template 新增的 allow 條目，需手動處理。

### 3. 已試過

- 桌機：`.claude/settings.json` allow[0..2] 加了三條萬用字元 ✅
- `mcp/claude-userlevel/settings.template.json` 加了 allow 陣列 ✅（供未來 install mode 使用）

### 4. 卡在哪

等切換到筆電執行；preserveKey 機制無法自動傳播，需人工介入。

### 5. 下一步指令

1. 切換到筆電，進入 monorepo：`cd $WORK_ROOT`
2. 拉最新代碼：`git pull origin main`
3. 確認桌機的萬用字元已進 repo：`Get-Content .claude\settings.json | Select-Object -First 10`
   - 應看到 `"Bash(powershell *)"`, `"Bash(powershell.exe *)"`, `"Bash(pwsh *)"` 在前三條
4. 執行 sync（hooks 等 overwriteKeys 會更新，allow 會被 preserve）：
   ```powershell
   .\scripts\sync-claude-userlevel.ps1 -Mode merge
   ```
5. 手動將三條萬用字元插入筆電的 allow list 最前面：
   ```powershell
   # 確認目前 allow[0..3]
   (Get-Content ~/.claude/settings.json | ConvertFrom-Json).permissions.allow[0..3]
   ```
   如果前三條不是萬用字元，用 VS Code 或直接 Edit 工具在 `~/.claude/settings.json` 的 `"allow"` 陣列最前面插入：
   ```json
   "Bash(powershell *)",
   "Bash(powershell.exe *)",
   "Bash(pwsh *)",
   ```
6. 驗收：`(Get-Content ~/.claude/settings.json | ConvertFrom-Json).permissions.allow[0..2]` 應輸出三條萬用字元

### 6. 相關資源

- **Files**:
  - `$WORK_ROOT/.claude/settings.json` — 桌機已修，前三條是萬用字元
  - `$WORK_ROOT/mcp/claude-userlevel/settings.template.json` — SSOT，現有 allow 陣列
  - `$WORK_ROOT/mcp/claude-userlevel/manifest.json` — `permissions.allow` 列為 `preserveKeys`（說明為何 merge 不自動帶入）
  - `$WORK_ROOT/scripts/sync-claude-userlevel.ps1` — sync 腳本
- **Known landmines**:
  - `preserveKeys: ["permissions.allow"]` 意味著 merge mode 只保留筆電現有的 allow list，不補入 template 新條目 → 必須手動插入
  - 筆電的 `~/.claude` 是否也是 junction？若是，路徑 = `$WORK_ROOT/.claude/settings.json`（同一個檔案）
