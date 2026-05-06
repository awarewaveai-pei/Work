@agency-os/AGENTS.md
@agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md
@mcp/README.md
@agency-os/docs/operations/mcp-add-server-quickstart.md
@scripts/README.md

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

## Git 分支原則（強制）

**預設直接在 `main` 上 commit／push。禁止建立新 branch**，除非使用者在同一則訊息中明確要求。

- 不得執行 `git checkout -b`、`git switch -c`、`git switch --create`、`git branch <newbranch>`
- `.claude/settings.json` deny 規則已硬性擋住上述指令
- 理由：避免多代理切換後歷史混亂、減少 merge 衝突、保持 `git pull` 簡單

## Runbooks（緊急應變）

事故、入侵、伺服器 OOM、WAF 設定問題時，查 `runbooks/`：
- `HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` — 伺服器 502/OOM
- `HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md` — 加密挖礦入侵
- `SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md` — 一般安全事件
- `CLOUDFLARE-WAF-SETUP.md` — Cloudflare WAF
- `CODEX-CONFIG-ERRORS-FIXES.md` — Codex 設定錯誤

## 自動開工偵測（不需要記關鍵字）

**對話開頭如果使用者的第一句話是下列任一情況，直接執行 AO-RESUME 流程，再回應他的問題：**

- 問候語：「嗨」「hi」「早」「你好」「hey」「在嗎」「我來了」「開工了」「繼續」「回來了」「好了我來了」「掉線了」「我又來了」
- 不知道從哪裡開始：「然後呢」「接著做什麼」「現在做什麼」「繼續哪裡」「然後」「接下來」「現在哪裡」
- 短句且沒有指定具體任務（< 15 字，沒有明確目標）

不需要使用者打 `AO-RESUME`。判斷到上述情況，直接做：跑 `ao-resume.ps1`、讀狀態檔、輸出五段式摘要。

## 自動收工偵測（不需要記關鍵字）

**以下任何表達都等同 `AO-CLOSE`，直接觸發完整收工流程：**

「收工」「關機」「要睡了」「晚安」「掰掰」「bye」「好了」「今天先這樣」「先這樣」「今天到這」「可以了」「done」「ok done」「結束了」「不做了」「走了」「要出門了」「先關」「關掉」「ok today」「that's it」「夠了」「差不多了」「關閉」

不需要使用者打 `AO-CLOSE`。

## Claude Code Hook：AO-RESUME

`~/.claude/settings.json` 的 `UserPromptSubmit` hook → `~/.claude/hooks/ao-resume-on-prompt.ps1`（user-level，不進 git）。  
行為與 `.cursor/hooks.json` 的 `beforeSubmitPrompt` 完全等效：偵測 `^AO-RESUME` 即自動執行 `ao-resume.ps1 -FullMainlineParity`，結果寫入 `agency-os/.agency-state/ao-resume-hook-last.json`（120 秒去重，兩 IDE 共用同一狀態檔）。

## 雙 IDE 並存（Cursor + Claude Code）

本 repo 同時支援兩套 IDE，隨時可切換，不需遷移。完整架構見：  
`agency-os/docs/operations/dual-ide-coexistence-strategy.md`

## Slash Commands（`/command-name`）

專案級 slash commands 存放於 `.claude/commands/`（已進 git）。在對話輸入框打 `/` 即可呼叫：

| 指令 | 用途 |
|------|------|
| `/ao-resume` | 手動觸發 AO-RESUME 五段式摘要（hook 已失效時備用） |
| `/ao-close` | 手動觸發 AO-CLOSE 完整收工流程 |
| `/health` | 執行 `system-health-check.ps1` 並報告結果 |
| `/doc-sync` | 執行 `doc-sync-automation.ps1 -AutoDetect` |
| `/verify` | 執行 `verify-build-gates.ps1` |
| `/build-tenant` | 引導新客戶租戶佈建（Lobster Factory） |
| `/smoke-test` | 執行 n8n MCP + 核心服務煙霧測試 |

## Project Subagents

專案級 subagents 存放於 `.claude/agents/`（已進 git）。Claude Code 在需要時自動選用：

| Agent | 觸發時機 |
|-------|---------|
| `repair-agent` | 健康檢查失敗、腳本報錯、MCP 連不上、文件交叉引用斷掉 |
| `site-builder` | 新客戶租戶佈建（GitHub / Sentry / PostHog / Supabase / n8n） |

## 桌機 / 換機設定（user-level 3 個檔案）

repo 內所有東西（commands、agents、CLAUDE.md、AGENTS.md、scripts）`git pull` 自動同步。  
**只有下列 3 個 user-level 檔案需要手動複製到新機器**（路徑換成新機的帳號）：

```
~\.claude\settings.json            # UserPromptSubmit hook 設定
~\.claude\hooks\ao-resume-on-prompt.ps1   # AO-RESUME hook 腳本
~\.claude\hooks\branch-protection.js      # 分支保護 hook
```

複製後在新機器 monorepo 根執行一次：
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```

完整桌機快速啟動：`agency-os/docs/operations/dual-ide-coexistence-strategy.md` §新機器快速啟動

