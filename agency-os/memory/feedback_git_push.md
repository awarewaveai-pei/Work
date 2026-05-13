---
name: Primary Agent / Closer Role (git / closeout)
description: Claude Code 是主要代理（primary closer），有完整 ao-close.ps1、WORKLOG/memory 更新、push 權限；Codex/ChatGPT 等才是協作代理
type: feedback
---
Claude Code 的角色已升為「**主要代理（primary closer / 收關者）**」。使用者已從 Cursor 全面切換為 Claude Code。規則正本：`agency-os/docs/operations/collaborator-ai-agent-rules.md`

**Claude Code 有權做（primary closer）：**
- 定稿並更新 WORKLOG.md 當日區塊
- 更新 memory/CONVERSATION_MEMORY.md、memory/daily/ 當日檔
- 更新 TASKS.md 勾選（AUTO_TASK_DONE）
- 執行 `scripts/ao-close.ps1`（AO-CLOSE 關鍵字觸發）
- `git push origin main`（非主線 force push 仍禁止）

**AO-CLOSE 流程（代理主導）：**
1. 先依當輪對話 + TASKS 補齊 WORKLOG 當日 `- AUTO_TASK_DONE: …`
2. 更新 memory/CONVERSATION_MEMORY.md
3. 執行 `.\scripts\ao-close.ps1`（腳本處理 commit + push）

**AO-RESUME 流程（hook 自動）：**
- 已安裝 UserPromptSubmit hook：`~/.claude/hooks/ao-resume-on-prompt.ps1`
- 偵測到 `AO-RESUME` 關鍵字時自動執行 `ao-resume.ps1 -FullMainlineParity`
- 狀態寫入 `agency-os/.agency-state/ao-resume-hook-last.json`（120 秒去重）

**仍禁止：**
- `git push --force` / `git push -f` 任何分支
- `gh pr merge`（merge 決定權屬使用者）
- 在任何檔案或對話中寫入 token、私鑰、明文密鑰

**Commit prefix 規則：**
- Claude Code commits 必須以 `[claude]` 開頭

**Why:** 使用者已全面從 Cursor 切換到 Claude Code（2026-05-06）。

**How to apply:** AO-CLOSE 時直接更新 WORKLOG/memory 再跑 ao-close.ps1。確認 MONOREPO_ROOT 環境變數存在再執行腳本。
