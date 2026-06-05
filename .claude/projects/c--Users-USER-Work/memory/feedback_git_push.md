---
name: Primary Agent / Closer Role (git / closeout)
description: Claude Code 是主要代理（primary closer），有完整 ao-close.ps1、WORKLOG/memory 更新、push 權限；Codex/ChatGPT 等才是協作代理
type: feedback
originSessionId: 0006ed4b-388a-4cbc-8280-ecabd84bc83d
updatedSessionId: c84f985f-86d2-4e5b-8d42-dd290a33ad71
---
Claude Code 的角色已升為「**主要代理（primary closer / 收關者）**」。使用者已從 Cursor 全面切換為 Claude Code。規則正本：`agency-os/docs/operations/collaborator-ai-agent-rules.md`

**Claude Code 有權做（primary closer）：**
- 定稿並更新 WORKLOG.md 當日區塊
- 更新 memory/CONVERSATION_MEMORY.md、memory/daily/ 當日檔
- 更新 TASKS.md 勾選（AUTO_TASK_DONE）
- 執行 `scripts/ao-close.ps1`（AO-CLOSE 關鍵字觸發）
- `git push origin <branch>`（非主線 force push 仍禁止）

**AO-CLOSE 流程（代理主導）：**
1. 先依當輪對話 + TASKS 補齊 WORKLOG 當日 `- AUTO_TASK_DONE: …`
2. 更新 memory/CONVERSATION_MEMORY.md
3. 執行 `.\scripts\ao-close.ps1`（腳本處理 commit + push）

**AO-RESUME 流程（hook 自動）：**
- 已安裝 UserPromptSubmit hook：`.claude/hooks/ao-resume-on-prompt.ps1`
- 偵測到 `AO-RESUME` 關鍵字時自動執行 `ao-resume.ps1 -FullMainlineParity`
- 狀態寫入 `agency-os/.agency-state/ao-resume-hook-last.json`

**仍禁止：**
- `git push --force` / `git push -f` 任何分支
- `git push origin main` / `git push origin master`（直接推主線）
- `gh pr merge`（merge 決定權屬使用者）
- 在任何檔案或對話中寫入 token、私鑰、明文密鑰

**Commit prefix 規則：**
- Claude Code commits 必須以 `[claude]` 開頭
- 例：`[claude] fix(mcp): update path to use MONOREPO_ROOT`

**Collaborating agents（Codex/ChatGPT 等）規則：**
- 仍只寫 closeout-inbox.md，不 push、不跑 ao-close.ps1
- inbox 路徑：`agency-os/.agency-state/closeout-inbox.md`

**Why:** 使用者已全面從 Cursor 切換到 Claude Code（2026-05-06）。MCP paths 已從 `${workspaceFolder}` 改為 `${env:MONOREPO_ROOT}`，MONOREPO_ROOT=C:\Users\USER\Work 已設為 Windows 使用者環境變數。

**How to apply:** AO-CLOSE 時直接更新 WORKLOG/memory 再跑 ao-close.ps1。不需要再寫 closeout-inbox.md（那是給其他協作代理用的）。確認 MONOREPO_ROOT 環境變數存在再執行腳本。
