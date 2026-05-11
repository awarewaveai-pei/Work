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

## 常設規範（3 條強制，每次都適用）

### R1：雙機 Claude 設定自動同步清單

| 項目 | 路徑（SSOT） | 同步方式 |
|------|------------|---------|
| slash commands / skills | `repo/.claude/commands/` | `git pull` 自動 ✓ |
| subagents | `repo/.claude/agents/` | `git pull` 自動 ✓ |
| runbooks / scripts / docs | `agency-os/`, `scripts/`, `lobster-factory/docs/` | `git pull` 自動 ✓ |
| hooks / settings.json | `mcp/claude-userlevel/` SSOT | `git pull` + `sync-claude-userlevel.ps1 -Mode merge` |
| ~/.claude/commands/ | 從 `repo/.claude/commands/` mirror | 同上（manifest.json 治理） |
| memory | `~/.claude/projects/*/memory/` | ❌ 手動複製（不進 git） |

**禁止**：在任一機器的 `~/.claude/commands/` 或 `~/.claude/agents/` 建立不在 repo 裡的副本。

### R2：每任務完成後強制 commit + 文件

1. **`git commit`**：message 寫根因 + 驗證結果 = 30 秒故障手冊
2. **`WORKLOG.md`**：根因 / 步驟 / 驗證證據 / 「避免再發生」規則
3. 若引入新 pattern → 更新對應 runbook/template（不得只留在 WORKLOG 不更新原始 doc）

### R3：30 年品質基準（操作前問 3 題）

- (a) 是否已有 SSOT？先讀，不重建。
- (b) 是否破壞「單一 Owner」或「不重複」原則？
- (c) 未來的人能在 30 秒找到並理解嗎？

---

## 並行 session 編輯衝突偵測（Cursor + Claude 同時跑）

修改 SG/EU 上的 drop-in 檔案（`/etc/default/*.local`、systemd unit override 等）後，**若回頭使用該檔超過 5 分鐘**（例如等待 reboot、等下個 cron tick），動作前先重看一次：

```bash
ssh hetzner-sg 'stat -c "mtime=%y" /etc/default/awarewave-endpoint-alert.local; grep "^HEARTBEAT_URL" /etc/default/awarewave-endpoint-alert.local'
```

若 mtime 比你最後一次寫的時間更新，懷疑並行 session 蓋掉了。`journalctl --since '<mtime - 2m>' --until '<mtime + 2m>' | grep -E "(crontab|REPLACE|sshd.*Accepted)"` 找肇事 session。
歷史案例：2026-05-08 我 08:29 uncomment 的 HEARTBEAT_URL 在 08:38 被另一個 cursor session 重新 commented，導致 reboot 後 Kuma 8 分鐘無 heartbeat。memory: `reference_recurring_ops_recipes.md §3`。

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

## Cursor 停訂閱時的作業模式（Claude Only Fallback）

若未來停止 Cursor 訂閱，專案仍可完整運作；請採以下模式：

1. **主控 IDE 改為 Claude Code**（`CLAUDE.md` + `AGENTS.md` + `CLAUDE_EXECUTION_BLUEPRINT_30Y.md`）。
2. **流程不變**：開工與收工仍使用同一組 repo 腳本：
   - 開工：`scripts/ao-resume.ps1 -FullMainlineParity`
   - 收工：`scripts/ao-close.ps1`
3. **驗證不變**：持續使用 `verify-build-gates`、`system-health-check`、功能 smoke（例如 `ops-console-smoke.ps1`）。
4. **MCP 不變**：共享 SSOT 仍是 `mcp/registry.template.json` + `scripts/sync-mcp-config.ps1` + repo `.mcp.json`。
5. **不要重建第二套規則**：維持單一真相，避免為「無 Cursor」再複製一份平行 runbook。

## Slash Commands（`/command-name`）

專案級 slash commands 存放於 `.claude/commands/`（已進 git）。在對話輸入框打 `/` 即可呼叫：

| 指令 | 用途 |
|------|------|
| `/ao-resume` | 手動觸發 AO-RESUME 五段式摘要（hook 已失效時備用） |
| `/ao-close` | 手動觸發 AO-CLOSE 完整收工流程 |
| `/checkpoint` | Mid-session git checkpoint（不 push） |
| `/recap` | 顯示今日完成摘要（關機前回顧用） |
| `/tasks` | 列出所有未完成 `- [ ]` 任務 |
| `/health` | 執行 `system-health-check.ps1` 並報告結果 |
| `/doc-sync` | 執行 `doc-sync-automation.ps1 -AutoDetect` |
| `/verify` | 執行 `verify-build-gates.ps1` |
| `/build-tenant` | 引導新客戶租戶佈建（Lobster Factory） |
| `/smoke-test` | 執行 n8n MCP + 核心服務煙霧測試 |
| `/decide` | 18 階段多代理決策評審（工具選型 / 架構審查 / 商業策略）產出完整決策文件含可觀測性計畫 |
| `/strategy-review` | 多角度策略決策審查（4 角色協作 / 紅藍辯論 / Pre-Mortem） |
| `/sg-deploy` | SSH 上 SG VPS 跑 `sg-deploy.sh`（git → staging rsync → build → up → 寫 `.deployed-commit`） |
| `/check-drift` | 跑 `check-deploy-drift.ps1`，回報 SG production vs `origin/main` 落後幾個 commit |
| `/vault-sync` | 同步 vault → Windows user env，列出仍缺的 key |
| `/vault-status` | 顯示 vault 所有 key 名稱 + `.cursor/mcp.json` 缺漏清單 |
| `/client-status` | 查詢所有客戶（或單一）健康 + WP 更新狀態（呼叫 `/api/ops/clients` + Telegram `/client_status` 同源） |
| `/wp-maintenance` | WordPress 維護入口：MainWP/WPvivid 備份狀態、更新計畫、backup-gated safe update routine |

## Project Subagents

專案級 subagents 存放於 `.claude/agents/`（已進 git）。Claude Code 在需要時自動選用：

| Agent | 觸發時機 |
|-------|---------|
| `repair-agent` | 健康檢查失敗、腳本報錯、MCP 連不上、文件交叉引用斷掉、vault/env 對齊問題 |
| `site-builder` | 新客戶租戶佈建（GitHub / Sentry / PostHog / Supabase / n8n） |
| `trigger-deploy-agent` | Trigger.dev EU 工作流部署（需提供 `tr_pat_*` Personal Access Token） |
| `client-onboarding` | 新客戶 onboarding（Supabase SQL seed + SSH 金鑰存放 + Wave 分類 / MainWP 連線）|
| `wordpress-maintenance-agent` | WordPress 客戶維護（MainWP/WPvivid 備份 gate、MainWP sync、plugin wave 更新計畫 / safe update）|
| `decision-intelligence` | 18 階段多代理決策評審（工具選型、架構審查、商業策略）；使用 `ai-decision-intelligence` skill；`/decide` 觸發 |

## 桌機 / 換機設定（**自動化版**，2026-05-07 起）

repo 內所有東西（commands、agents、CLAUDE.md、AGENTS.md、scripts）`git pull` 自動同步。  
**user-level 內容（hooks、settings.json、mcp.json）也已治理化** — `mcp/claude-userlevel/` 是 SSOT，由 `scripts/sync-claude-userlevel.ps1` 同步到 `~/.claude/`，不再手動複製。

### 換機 / 新機（一鍵）

```powershell
git clone <repo> Work
cd Work
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```

`bootstrap-mcp-machine.ps1` 會自動：
1. 載入機器本地 env（`mcp/user-env.ps1`）
2. 跑 `sync-mcp-config.ps1` 同步 MCP 設定
3. 跑 `sync-claude-userlevel.ps1 -Mode install` 對齊 `~/.claude/hooks/`、`~/.claude/settings.json`、`~/.claude/mcp.json`

### 日常同步（git pull 帶下 hooks/template 更新時）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode merge
```

`merge` 模式會：
- mirror 整個 `hooks/` 目錄
- 強制覆蓋 settings.json 的 `hooks` 段、`permissions.deny`、`permissions.additionalDirectories`、`theme`、`autoUpdatesChannel`
- **保留** `permissions.allow`（每機自己累積，不互相覆蓋）
- 把 `~/.claude/mcp.json` 規範化為 `{"mcpServers":{}}`（per CLAUDE.md，shared MCP 走 repo `.mcp.json`）

### 巡檢

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode verify
```

exit 0 = 對齊；exit 1 = drift。完整 SSOT 與擴充方法見 `mcp/claude-userlevel/README.md`。

### 仍需各機獨立操作

- **Secrets vault（DPAPI）無法跨機複製**：DPAPI 金鑰綁定本機帳號，必須在每台機器執行：
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action import-mcp
  ```
- **memory（`~/.claude/projects/<repo>/memory/`）**：跨機 session 記憶，git 不追蹤；目前仍需手動複製（候補加入治理範圍）。

複製後在新機器 monorepo 根執行一次：
```powershell
# 設定 Windows 使用者環境變數（必須）
[System.Environment]::SetEnvironmentVariable('MONOREPO_ROOT','C:\Users\<筆電帳號>\Work','User')
# 完整 MCP + 環境初始化
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```

### 筆電 Windows 本機 WordPress 棧（龍蝦 staging 需要）

若 TASKS「雙機環境對齊」尚未勾選，或 memory 載明筆電須補 WP 層，**遵守以下正本**（不重複步驟）：

- 操作步驟：`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md` §1.5.1
- 詳細說明：`lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md`
- 一鍵腳本：`scripts/bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`

完整桌機快速啟動：`agency-os/docs/operations/dual-ide-coexistence-strategy.md` §新機器快速啟動
