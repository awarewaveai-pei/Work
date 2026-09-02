@agency-os/AGENTS.md

<!-- Codex / 任何不認得 @import 的 agent：請額外讀 agency-os/AGENTS.md（R0 架構師模式 + R4 聲稱即驗證為強制規則；[驗證計畫] 須含實測 / Review / 抓蟲 / WORKLOG 四動作）。本檔與 agency-os/AGENTS.md 為雙工具（Claude Code + Codex）共讀 SSOT。 -->

# Claude Code Project Instructions

## 核心規範（每次適用）

### R1：多機設定同步

> **現況（2026-08-12 起）：單機運作** —— 操作者已離職，公司桌機退場，僅剩個人筆電（`LAPTOP-R7I86OR5`）。下表機制**保留但休眠**：跨機 import 每次都會回報「無其他機器較新匯出」屬正常，不是錯誤。將來新增機器時原樣可用，勿刪。
> ⚠️ 桌機退場的**憑證善後**（該機曾同步 `user-env.ps1` 明文 tokens + 三把 SSH 私鑰）見 `agency-os/TASKS.md`。


| 項目                                            | SSOT                                        | 同步方式                                                 |
| --------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| commands / agents / skills / scripts / docs / runbooks | `repo/.claude/` + `agency-os/` + `scripts/` | `git pull` 自動 ✓（透過 `.claude` junction → `~/.claude/`） |
| hooks / settings.json / mcp.json (user-level) | `mcp/claude-userlevel/`                     | `git pull` + `sync-claude-userlevel.ps1 -Mode merge` |
| memory `~/.claude/projects/*/memory/`         | 無                                           | ❌ 手動複製（不進 git）                                       |


**禁止**：在 `~/.claude/` 建立不在 repo 的副本。新機一鍵：`bootstrap-mcp-machine.ps1`（自動建 `.claude` junction，commands/agents/skills 即 git-tracked）。

### R2：任務完成強制

1. `git commit` — message 含根因 + 驗證 = 30 秒故障手冊
2. `WORKLOG.md` — 根因 / 步驟 / 驗證 / 避免再發生
3. 新 pattern → 更新 runbook/template（不得只留 WORKLOG）


## MCP 治理

SSOT：`mcp/registry.template.json`。改動後跑 `scripts/sync-mcp-config.ps1`。  
`~/.claude/mcp.json` 強制為 `{}`；shared MCP 走 repo `.mcp.json`。禁止 commit secrets。

## 操作風險分級（強制）

> SSOT：`agency-os/AGENTS.md §操作風險分級`（三級表 Low/Medium/High 定義在此，不重複）

## Git 分支（強制）

直接在 `main` commit/push。禁止建立新 branch（`settings.json` deny 已硬擋）。

## AO 生命週期

**開工**：對話第一句是問候 / 短句無明確目標（< 15 字）→ 直接執行 AO-RESUME，輸出 AO-RESUME 報告（§0–§8）摘要。Hook 已自動跑 `ao-resume.ps1 -FullMainlineParity`（300 秒去重）；Claude 讀狀態檔即可。  
**收工**：任何關機/結束表達（「收工」「晚安」「bye」「done」「先這樣」「走了」等）→ 直接觸發完整 AO-CLOSE 流程（**預授權**：WORKLOG / memory / daily / reports 寫入及 ao-close.ps1 執行均直接進行，R0 逐項批准在此流程內不適用；gate 失敗時自修後重跑，禁止逐步請使用者同意）。

## 遠端 session 機械閘自裝（Claude Code web，強制）

遠端 container session 開始時：若 `.claude/settings.local.json` 不存在 → **立即跑 `bash scripts/wire-remote-hooks.sh`**（治理 hooks 接線；本 session 不生效，同 container 的後續 session 生效）。一勞永逸做法：把該指令設為 Claude web 環境的 setup script。背景：2026-07-02 稽核發現遠端 session 原本零機械閘。

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

**現況（2026-08-31 起）**：SG + EU 已全數整併到單機 **`ks-aw-01`（`145.239.195.47`，SSH `-p 58122`）**。前任 `149.202.64.114` 已在 OVH Manager 顯示 Terminated；更早的 `5.223.93.113`（SG）/ `204.168.175.41`（EU）也已刪除退租。**任何部署/操作都只能 SSH 至 `145.239.195.47`**，不存在回退到前任主機的路徑。容器細節見 AGENTS.md §AwareWave Stack、拓樸橫幅見 [`AWAREWAVE_STACK_QUICKREF.md`](agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)。
ClickHouse 版本鎖定：`25.7.x`，**禁升 latest / 24.x**。

詳細操作規則（Routing 三件套 / 自動化安全預設 / Auto-Repair 紅線 / Trigger.dev 憑證 / 其他 SSOT）見 AGENTS.md §Lobster Factory 操作規則 及 §Auto-Repair 紅線。
