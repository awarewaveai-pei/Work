@agency-os/AGENTS.md
@mcp/README.md
@agency-os/docs/operations/mcp-add-server-quickstart.md

# Claude Code Project Instructions

## Shared MCP Governance

- Treat `mcp/registry.template.json` and `scripts/sync-mcp-config.ps1` as the only shared source of truth for MCP server definitions in this repo.
- Project-scoped Claude MCP config lives at repo-root `.mcp.json`.
- Do not treat `~/.claude/mcp.json` as the shared project config. Claude Code project instructions and project MCP are repo-owned; user/local scope belongs in `~/.claude.json` or other machine-local settings.
- When comparing against user-level Cursor or Claude MCP files, use them only as discovery inputs. Merge useful structure back into the shared registry and docs without copying live secrets into git.
- When changing MCP setup, update these repo files first:
  1. `mcp/registry.template.json`
  2. `mcp/user-env.template.ps1` when new environment variable names are needed
  3. `mcp/README.md`
  4. `agency-os/docs/operations/mcp-add-server-quickstart.md`
- After MCP changes, run `powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1` from the monorepo root.
- Expected generated outputs are:
  - `.mcp.json`
  - `%USERPROFILE%\.codex\config.toml`
  - `%USERPROFILE%\.copilot\mcp-config.json`
  - `%USERPROFILE%\.gemini\settings.json`
- Never commit live tokens, JWTs, passwords, PATs, or machine-specific secrets from user-level MCP files.
- `.mcp.json` uses `${env:MONOREPO_ROOT}` for script paths. Ensure `MONOREPO_ROOT=C:\Users\USER\Work` is set as a Windows user environment variable on each machine.

## Commit Prefix (強制)

每個 `git commit` 第一行必須以下列三者擇一開頭（全小寫、半形方括號，後接一個半形空白）：

- `[claude]` — 本次主要在 Claude Code 脈絡完成
- `[cursor]` — 主要在 Cursor（含 Agent）脈絡完成
- `[codex]` — 主要在 Codex 脈絡完成

全面切換至 Claude Code 後，預設使用 `[claude]`。  
範例：`[claude] fix: sync-mcp-config ClaudeProjectPlaceholder path`

## Risk-Tiered Confirmation（操作風險分級）

| 等級 | 說明 | 處置 |
|------|------|------|
| **Low** | doc、小修、非破壞新檔 | 可做，說明假設 |
| **Medium** | 核心邏輯、新依賴、auth | 先簡述計畫，同意再做 |
| **High — STOP** | prod deploy、破壞性 migration、大量刪、金流、身分權限/RLS、憑證、無法乾淨回滾 | **停止**，說明風險，要求明示 go ahead |

**一律拒絕**：跳錯處、硬編密鑰、直衝 prod、一次蓋整個系統。

## Claude Code Hook：AO-RESUME

`.claude/settings.json` 已設定 `UserPromptSubmit` hook → `.claude/hooks/ao-resume-on-prompt.ps1`。  
行為與 `.cursor/hooks.json` 的 `beforeSubmitPrompt` 等效：偵測 `^AO-RESUME` 即自動執行 `ao-resume.ps1 -FullMainlineParity`，結果寫入 `agency-os/.agency-state/ao-resume-hook-last.json`。


