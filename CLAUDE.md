@agency-os/AGENTS.md

# Claude Code Project Instructions

## 核心規範（每次適用）

### R1：雙機設定同步


| 項目                                            | SSOT                                        | 同步方式                                                 |
| --------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| commands / agents / scripts / docs / runbooks | `repo/.claude/` + `agency-os/` + `scripts/` | `git pull` 自動 ✓                                      |
| hooks / settings.json / `~/.claude/commands/` | `mcp/claude-userlevel/`                     | `git pull` + `sync-claude-userlevel.ps1 -Mode merge` |
| memory `~/.claude/projects/*/memory/`         | 無                                           | ❌ 手動複製（不進 git）                                       |


**禁止**：在 `~/.claude/` 建立不在 repo 的副本。新機一鍵：`bootstrap-mcp-machine.ps1`。

### R2：任務完成強制

1. `git commit` — message 含根因 + 驗證 = 30 秒故障手冊
2. `WORKLOG.md` — 根因 / 步驟 / 驗證 / 避免再發生
3. 新 pattern → 更新 runbook/template（不得只留 WORKLOG）


## MCP 治理

SSOT：`mcp/registry.template.json`。改動後跑 `scripts/sync-mcp-config.ps1`。  
`~/.claude/mcp.json` 強制為 `{}`；shared MCP 走 repo `.mcp.json`。禁止 commit secrets。

## 操作風險分級（強制）


| 等級              | 說明                                          | 處置                  |
| --------------- | ------------------------------------------- | ------------------- |
| Low             | doc、小修、非破壞新檔                                | 直接做，說明假設            |
| Medium          | 核心邏輯、新依賴、auth                               | 先說計畫，同意再做           |
| **High — STOP** | prod deploy、破壞性 migration、金流、身分/RLS、憑證、無法回滾 | 停止，說風險，等明示 go ahead |


禁止：跳錯處、硬編密鑰、直衝 prod、一次蓋整個系統。

## Git 分支（強制）

直接在 `main` commit/push。禁止建立新 branch（`settings.json` deny 已硬擋）。

## AO 生命週期

**開工**：對話第一句是問候 / 短句無明確目標（< 15 字）→ 直接執行 AO-RESUME，輸出七段式摘要。Hook 已自動跑 `ao-resume.ps1 -FullMainlineParity`（120 秒去重）；Claude 讀狀態檔即可。  
**收工**：任何關機/結束表達（「收工」「晚安」「bye」「done」「先這樣」「走了」等）→ 直接觸發完整 AO-CLOSE 流程。

## VPS 並行衝突（drop-in 檔案）

修改 `/etc/default/*.local` 後 > 5 分鐘才再使用：`stat -c "mtime=%y" <file>` 確認 mtime 未被另一 session 覆蓋。

## 緊急 Runbooks

`runbooks/`：502/OOM（含 base64 SSH pattern）、加密挖礦入侵、安全事件、Cloudflare WAF、Codex 設定錯誤。

## 多機多 IDE

**換機**：Secrets vault 各機獨立：`secrets-vault.ps1 -Action import-mcp`。本地 WP 棧（若需要）：`bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`（詳：`REMOTE_WORKSTATION_STARTUP.md §1.5.1`）。  
**雙 IDE**：架構詳見 `dual-ide-coexistence-strategy.md`。停 Cursor 時用同一組腳本（ao-resume / ao-close / verify），不重建第二套規則。

## 系統架構速查（Claude 必讀）

### 目錄分工

`agency-os/` — AO 治理（TASKS/WORKLOG/memory/docs/runbooks）；`lobster-factory/` — 龍蝦工廠（clients/infra/packages/workflows）；`scripts/` — 全域腳本；`mcp/` — MCP registry + user-level SSOT；`agency-os/tenants/` — 每客戶設定（`<slug>/core/ENVIRONMENT_REGISTRY.md` = Staging URL SSOT）。

### 伺服器邊界（**不可混用**）

SG `5.223.93.113` / EU `204.168.175.41` — 容器細節見 AGENTS.md §AwareWave Stack。  
ClickHouse 版本鎖定：`25.7.x`，**禁升 latest / 24.x**。

詳細操作規則（Routing 三件套 / 自動化安全預設 / Auto-Repair 紅線 / Trigger.dev 憑證 / 其他 SSOT）見 AGENTS.md §Lobster Factory 操作規則 及 §Auto-Repair 紅線。

