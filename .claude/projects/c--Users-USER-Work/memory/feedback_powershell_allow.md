---
name: feedback-powershell-allow
description: User frustrated by repeated PowerShell approval prompts — root cause and permanent fix applied
metadata: 
  node_type: memory
  type: feedback
  originSessionId: efd2135c-035b-48df-885a-b94428653c13
---

PowerShell 萬用字元已加入 allow list，未來不要再讓使用者按 allow powershell。

**Why:** 雖然 `defaultMode: bypassPermissions` 已設定，但每次 PowerShell 命令出現新的參數變體就會觸發 prompt，使用者已經設置好幾次都沒解決。

**Root cause:** `bypassPermissions` 有時對 project-level settings 不生效（因 `.claude` 是 junction），加上 allow list 是用精確字串匹配，新變體就會被擋。

**Fix applied (2026-05-29):** 在 `~/.claude/settings.json` + `mcp/claude-userlevel/settings.template.json` 的 allow 陣列最前面加了三條萬用字元：
- `Bash(powershell *)` 
- `Bash(powershell.exe *)`
- `Bash(pwsh *)`

**How to apply:** 凡是遇到使用者抱怨 PowerShell 一直要 approve，確認這三條 wildcard 在 allow list 裡；下次如果又出現相似問題，直接加萬用字元而非一條一條加具體命令。
