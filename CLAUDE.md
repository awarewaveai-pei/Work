@agency-os/AGENTS.md

<!-- Codex / 任何不認得 @import 的 agent：請額外讀 agency-os/AGENTS.md（規則本體）；細節與精簡前全文在 agency-os/docs/operations/AGENTS_APPENDIX.md -->

# Claude Code Project Instructions

> 本檔 = repo／機器層機制；agent 行為規則與硬事實（主機、憑證、部署、模型路由）全在 `agency-os/AGENTS.md`，不在此重複。兩檔每輪注入 prompt：只留規則本體，理由與案例進 `agency-os/docs/operations/AGENTS_APPENDIX.md`。

## R1：多機設定同步

| 項目 | SSOT | 同步 |
|------|------|------|
| commands／agents／skills／scripts／docs／runbooks | `repo/.claude/` + `agency-os/` + `scripts/` | `git pull`（`.claude` junction → `~/.claude/`） |
| hooks／settings.json／mcp.json（user-level） | `mcp/claude-userlevel/` | `git pull` + `scripts/sync-claude-userlevel.ps1 -Mode merge` |
| memory `~/.claude/projects/*/memory/` | 無 | 手動複製，不進 git |

- `.claude` junction 只存在 main checkout（`.git` 為目錄）；在 linked worktree（`.git` 為檔案）裡 hooks／`ensure-claude-junction.ps1`／`sync-claude-userlevel.ps1` 一律 no-op。
- **禁止**在 `~/.claude/` 建不在 repo 的副本。新機一鍵 `scripts/bootstrap-mcp-machine.ps1`。
- 現況單機（AGENTS.md §0）；跨機機制休眠，勿刪。

## R2：任務完成強制

1. `git commit` message 含根因 + 驗證（= 30 秒故障手冊）。
2. `agency-os/WORKLOG.md` 寫根因／步驟／驗證／避免再發生，含 AGENTS.md §1 的四行機械證據。
3. 新 pattern → 更新 runbook／template，不得只留 WORKLOG。

## MCP 治理

SSOT `mcp/registry.template.json`，改後跑 `scripts/sync-mcp-config.ps1`。`~/.claude/mcp.json` 強制 `{}`；shared MCP 走 repo `.mcp.json`。禁止 commit secrets。

## Git 分支、AO 開工／收工

規則本體在 AGENTS.md §8（`main` 直推、禁自建 branch；AO-RESUME／AO-CLOSE 觸發語與預授權）。

## 遠端 session 機械閘自裝（Claude Code web）

- session 開始若無 `.claude/settings.local.json` → 立刻 `bash scripts/wire-remote-hooks.sh`（本 session 不生效，同 container 後續 session 生效；宜設為環境 setup script）。
- container 無 `pwsh`（AO-CLOSE／verify 腳本需要）：`curl -sSO https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb && dpkg -i packages-microsoft-prod.deb && apt-get update -qq && apt-get install -y -qq powershell`（約 1 分鐘；同樣宜進 setup script）。

## VPS drop-in 並行

改 `/etc/default/*.local` 後 > 5 分鐘再用：`stat -c "mtime=%y" <file>` 確認未被另一 session 覆蓋。

## 緊急 Runbooks

`runbooks/`：502／OOM、加密挖礦入侵、安全事件、Cloudflare WAF、Codex 設定錯誤。症狀→runbook 路由表在 `agency-os/docs/operations/TOOL_TRIGGER_MAP.md`。

## 目錄分工

| 路徑 | 內容 |
|---|---|
| `agency-os/` | AO 治理（TASKS／WORKLOG／memory／docs／runbooks） |
| `lobster-factory/` | clients／infra／packages／workflows |
| `scripts/` | 全域腳本 |
| `mcp/` | MCP registry + user-level SSOT |
| `agency-os/tenants/<slug>/core/ENVIRONMENT_REGISTRY.md` | 各客戶 Staging URL SSOT |

## 換機

- Secrets vault 各機獨立：`scripts/secrets-vault.ps1 -Action import-mcp`。
- 本地 WP 棧：`scripts/bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`（`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md §1.5.1`）。
- 雙 IDE 架構：`agency-os/docs/operations/dual-ide-coexistence-strategy.md`（Cursor 已退場，同一組腳本不重建第二套規則）。
