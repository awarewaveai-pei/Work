---
name: User Devices
description: 使用者有個人筆電 + 公司桌機，非兩台桌機
type: user
---
使用者有兩台工作機：
- **個人筆電**（通常是目前執行 Claude Code 的機器）
- **公司桌機**（另一台，需要 git pull + sync 對齊）

**How to apply:**
- 路徑一律用 `$env:USERPROFILE`，不寫死使用者名稱（兩台帳號可能不同）
- 「另一台」= 公司桌機（桌機，不是筆電）
- 兩台皆需執行 `sync-claude-userlevel.ps1 -Mode merge` 才能對齊 Claude Code 行為
