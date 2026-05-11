@agency-os/AGENTS.md
@scripts/README.md

# Claude Code Project Instructions

## 核心規範（每次適用）

### Commit Prefix（強制）
每個 commit 第一行：`[claude]`、`[cursor]`、`[codex]` 其中一個（全小寫、半形方括號 + 半形空白）。預設 `[claude]`。

### R1：雙機設定同步
| 項目 | SSOT | 同步方式 |
|------|------|---------|
| commands / agents / scripts / docs / runbooks | `repo/.claude/` + `agency-os/` + `scripts/` | `git pull` 自動 ✓ |
| hooks / settings.json / `~/.claude/commands/` | `mcp/claude-userlevel/` | `git pull` + `sync-claude-userlevel.ps1 -Mode merge` |
| memory `~/.claude/projects/*/memory/` | 無 | ❌ 手動複製（不進 git） |

**禁止**：在 `~/.claude/` 建立不在 repo 的副本。新機一鍵：`bootstrap-mcp-machine.ps1`。

### R2：任務完成強制
1. `git commit` — message 含根因 + 驗證 = 30 秒故障手冊
2. `WORKLOG.md` — 根因 / 步驟 / 驗證 / 避免再發生
3. 新 pattern → 更新 runbook/template（不得只留 WORKLOG）

### R3：30 年品質（操作前問）
(a) 已有 SSOT？先讀，不重建。　(b) 破壞單一 Owner 原則？　(c) 30 秒能找到並理解？

### R4：修改即驗證（強制，每次寫檔）
**寫入前**：每個路徑 / 腳本名 / 引用 → Glob 確認存在，不存在不寫。  
**寫入後**：grep **你剛修的確切字串**（非全域掃描），範圍限 `.claude/ runbooks/ scripts/ agency-os/docs/ mcp/`，命中的一起修，同一 commit。  
**原則**：改了什麼 → grep 那個字串；不做無目標全域掃描（浪費 token）。

## MCP 治理
SSOT：`mcp/registry.template.json`。改動後跑 `scripts/sync-mcp-config.ps1`。  
`~/.claude/mcp.json` 強制為 `{}`；shared MCP 走 repo `.mcp.json`。禁止 commit secrets。

## 操作風險分級（強制）
| 等級 | 說明 | 處置 |
|------|------|------|
| Low | doc、小修、非破壞新檔 | 直接做，說明假設 |
| Medium | 核心邏輯、新依賴、auth | 先說計畫，同意再做 |
| **High — STOP** | prod deploy、破壞性 migration、金流、身分/RLS、憑證、無法回滾 | 停止，說風險，等明示 go ahead |

禁止：跳錯處、硬編密鑰、直衝 prod、一次蓋整個系統。

## Git 分支（強制）
直接在 `main` commit/push。禁止建立新 branch（`settings.json` deny 已硬擋）。

## 自動開工（AO-RESUME）
對話第一句是**問候 / 不知從哪開始 / 短句無明確目標（< 15 字）** → 直接執行 AO-RESUME，輸出五段式摘要，不等使用者打指令。  
Hook 已自動跑 `ao-resume.ps1 -FullMainlineParity`（120 秒去重）；Claude 讀狀態檔即可。

## 自動收工（AO-CLOSE）
任何關機/結束表達（「收工」「晚安」「bye」「done」「先這樣」「走了」等）→ 直接觸發完整 AO-CLOSE 流程。

## VPS 並行衝突（drop-in 檔案）
修改 `/etc/default/*.local` 後 > 5 分鐘才再使用：`stat -c "mtime=%y" <file>` 確認 mtime 未被另一 session 覆蓋。

## 緊急 Runbooks
`runbooks/`：502/OOM、加密挖礦入侵、安全事件、Cloudflare WAF、Codex 設定錯誤。

## Slash Commands（`.claude/commands/`，git 追蹤）
| 指令 | 用途 |
|------|------|
| `/ao-resume` | 手動 AO-RESUME |
| `/ao-close` | 手動 AO-CLOSE |
| `/checkpoint` | Mid-session git checkpoint |
| `/recap` | 今日完成摘要 |
| `/tasks` | 列所有未完成任務 |
| `/health` | system-health-check.ps1 |
| `/doc-sync` | doc-sync-automation.ps1 -AutoDetect |
| `/verify` | verify-build-gates.ps1 |
| `/smoke-test` | 核心服務煙霧測試 |
| `/sg-deploy` | SG VPS sg-deploy.sh |
| `/sg-reboot` | SG VPS 安全重啟（pre/post-flight） |
| `/check-drift` | SG prod vs origin/main drift |
| `/client-onboarding` | 新客戶 onboarding（Supabase + SSH + MainWP） |
| `/vault-sync` | vault → Windows env |
| `/vault-status` | vault key 清單 |
| `/client-status` | 客戶健康 + WP 更新狀態 |
| `/build-tenant` | 新客戶租戶佈建 |
| `/wp-maintenance` | WordPress 維護入口 |
| `/decide` | 18 階段多代理決策評審 |
| `/strategy-review` | 多角度策略決策審查 |

## Project Subagents（`.claude/agents/`，git 追蹤）
| Agent | 觸發時機 |
|-------|---------|
| `repair-agent` | 健康檢查失敗 / 腳本報錯 / MCP 斷線 / 文件交叉引用斷掉 |
| `site-builder` | 新客戶租戶佈建（GitHub / Sentry / PostHog / Supabase / n8n） |
| `trigger-deploy-agent` | Trigger.dev EU 部署（需 `tr_pat_*` PAT） |
| `client-onboarding` | 新客戶 onboarding（Supabase seed + SSH + MainWP） |
| `wordpress-maintenance-agent` | WP 客戶維護（備份 gate / 更新計畫 / safe update） |
| `decision-intelligence` | 18 階段決策評審（`/decide` 觸發） |

## 雙機換機
Secrets vault 各機獨立：`secrets-vault.ps1 -Action import-mcp`。  
本地 WP 棧（若需要）：`bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`（詳：`REMOTE_WORKSTATION_STARTUP.md §1.5.1`）。

## 雙 IDE / Cursor Fallback
雙 IDE 架構：`dual-ide-coexistence-strategy.md`。停 Cursor 時用同一組腳本（ao-resume / ao-close / verify），不重建第二套規則。

## 系統架構速查（Claude 必讀）

### 目錄分工
`agency-os/` — AO 治理（TASKS/WORKLOG/memory/docs/runbooks）；`lobster-factory/` — 龍蝦工廠（clients/infra/packages/workflows）；`scripts/` — 全域腳本；`mcp/` — MCP registry + user-level SSOT；`agency-os/tenants/` — 每客戶設定（`<slug>/core/ENVIRONMENT_REGISTRY.md` = Staging URL SSOT）。

### 伺服器邊界（**不可混用**）
| 代號 | IP | 服務 |
|------|-----|------|
| **SG** | 5.223.93.113 | phase1-core Docker（nginx / next-admin / node-api / wordpress / redis） |
| **EU** | 204.168.175.41 | Trigger.dev **v4** + ClickHouse **25.7.x**（禁升 latest / 24.x）+ Supabase + n8n + MainWP + Uptime Kuma + registry:5000 |

### 龍蝦 Routing 三件套（同一 PR 必須同步）
`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` + `lobster-factory/workflow-risk-matrix.json` + `lobster-factory/docs/ROUTING_MATRIX.md` — 任一改動必須三份同步，否則 routing drift。

### 龍蝦自動化安全預設
Supabase 寫入**預設 OFF**（需 `-EnableWrites`）；Manifest 執行**預設 OFF**（需 `-ExecuteManifest`）。

### Trigger.dev 憑證（不可互換）
`tr_pat_*` = CLI deploy（vault key: `TRIGGER_DEPLOY_PAT`）；`tr_prod_*` = SDK runtime（vault key: `TRIGGER_ACCESS_TOKEN`）。

### 其他 SSOT
- Cursor rules 正本：`agency-os/.cursor/rules/`（repo 根 `.cursor/rules/` 是 mirror，不改正本）
- 監控端點：用 `/api/ops/summary`（非 `/`，root 有 auth_basic 保護）
- nginx 監控 drop-in：`/etc/default/awarewave-endpoint-alert.local`（SG VPS 本地，sync 不覆蓋）
