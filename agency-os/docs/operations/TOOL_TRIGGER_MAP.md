# Tool Trigger Map

> 所有工具的觸發情形一覽。每次新增工具時同步更新本文件。
> Last updated: 2026-06-03

## 圖例

| 符號 | 意義 | 可靠性 |
|-----|------|--------|
| 🔴 Hook | 系統機械強制，我無法繞過 | 100% |
| 🟠 File-path-router | 編輯特定路徑時 hook 自動觸發 | 100% |
| 🟡 AO 生命週期 | Session 開工/收工關鍵字 | 100% |
| 🟢 AGENTS.md 自判 | 我應自行識別情境觸發，靠判斷力 | 中等 |
| ⚪ 需你發動 | 需你明確說或指示，或 High-risk 等 go-ahead | 依你 |

---

## Slash Commands（34 個）

### AO 生命週期

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/ao-resume` | 開工七段式摘要 | 🔴 Hook `ao-resume-on-prompt.ps1` (UserPromptSubmit) + 🟡 開工短句 |
| `/ao-close` | 收工完整流程：WORKLOG + memory + push | 🟡 「收工」「晚安」「bye」「done」等 |
| `/recap` | 今日完成摘要（唯讀）| 🟢 準備收工前 / 「今天做了什麼」|
| `/tasks` | 列出所有 open 待辦 | 🟢 不確定 backlog 狀態 / 「還有什麼」|
| `/tomo` | 跨 session carry-over packet | ⚪ 你輸入 `/tomo <hint>` |
| `/checkpoint` | Mid-session git commit（不 push）| 🟢 每個 R0 任務完成後 [已修改] 輸出後 |
| `/signals` | 抓 Slack + Telegram 訊號 | 🟢 你問告警/incident/外部訊號時 |

### 驗證 / 審查 / 稽核

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/verify-recent` | Code 改動驗證（syntax + critic + exec）| 🔴 Hook `verify-gate-commit.js`（git commit 前 BLOCK）+ `verify-gate-stop.js`（Stop 提醒）|
| `/review` | Critic subagent code review | 🔴 Hook `verify-gate-stop.js` 提醒；🟢 R0 任務完成前強制跑 |
| `/verify` | Build gates + 治理 gate | 🟢 準備 sg-deploy 前自動跑 |
| `/apply-audit` | 套用 audit 報告 patches | 🟢 你說「apply audit」「套用 audit」「把 audit 修一修」|
| `/audit-encoding` | `.ps1` CP950 encoding 稽核 | 🔴 Hook `code-change-tracker.js`（.ps1 修改後提醒）|
| `/audit-cross-machine-bom` | `.md` UTF-8 BOM 跨機稽核 | ⚪ 手動 / 改動跨機 .md 後 |
| `/doc-sync` | 治理文件交叉同步 | 🟢 改動 governance 文件後（AGENTS.md / CLAUDE.md / hooks / cursor rules）|
| `/sync-check` | Claude Code 跨機 sync 驗證 | 🟢 改動 `.claude/commands/` 或 `.claude/agents/` 後；`/health` 回報 sync fail |
| `/health` | 系統 health check | 🟢 你問「系統狀態」「有沒有問題」「healthy 嗎」|
| `/smoke-test` | 每日機械 smoke tests | 🟢 AO-RESUME 後第一個動作（Blueprint §3）|

### 部署 / VPS

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/check-drift` | SG production deploy drift 檢查 | 🟢 準備 deploy 前自動跑（`/verify` 之前）|
| `/sg-deploy` | 部署 SG VPS lobster-phase1 | 🟢 `/check-drift` + `/verify` 都 pass 後提議；⚪ High risk — 等明示 go-ahead |
| `/playwright` | 瀏覽器自動化 QA（smoke/qa/client/screenshot/perf）| 🟢 `sg-deploy` 完成後自動跑 smoke；`wp-maintenance` 完成後跑 client |
| `/sg-reboot` | SG VPS 安全重啟 | ⚪ High risk — 等明示 go-ahead（reboot 訊號 ≥ 16h 後 escalate）|
| `/eu-reboot` | EU VPS 安全重啟 | ⚪ High risk — 等明示 go-ahead |
| `/auto-reboot-status` | VPS auto-reboot 健康診斷 | 🟢 訊息含 reboot 訊號 + VPS 識別字時 |
| `/command-plane-verify` | Telegram bot 沉默診斷 | 🟢 Telegram 沉默 > 30 分鐘 / 指令無回應 |
| `/phase4-check` | Repair Center Phase 4 健康 | 🟢 `/api/ops/repairs/health` 回 503 / `ok: false` |

### 客戶 / WordPress

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/client-status` | 客戶健康 + WP plugin 更新狀態 | 🟢 你提到客戶 / soulful / WP 更新 / 外掛 |
| `/wp-maintenance` | WP 維護（備份 + safe-update）| 🟢 WP update/maintenance 提及；wave 排程到期 |
| `/client-onboarding` | 新客戶上線 Ops Dashboard | ⚪ 明確新客戶指示 |
| `/build-tenant` | Lobster Factory 租戶佈建 | ⚪ 明確佈建指示 |

### Secrets / 工具

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/vault-status` | Vault key 庫存 + 齊缺狀態 | 🟢 MCP tool 回 401/403 / 你提到 secret/密鑰/key |
| `/vault-sync` | Vault → Windows env 同步 | 🟢 `/vault-status` 顯示缺口後自動接著跑 |
| `/decide` | Decision-intelligence 19 階段決策 | 🟢 A vs B / 架構決策 / 技術選型 / 工具比較 |
| `/strategy-review` | 多角度策略審查（紅藍隊 / pre-mortem）| 🟢 「要不要做 X」「值不值得」「策略審查」|
| `/fix-sidebars` | 修 VSCode Claude Code / Codex sidebar | ⚪ 你說 sidebar 壞了 |

---

## Custom Skills（13 個）

### 治理 / 系統 Skills（原有 6 個）

| Skill | 功能 | 觸發 |
|-------|------|------|
| `feature-plan` | 新功能需求拆解 + 技術任務規劃 | 🟢 「新功能」「plan 一下」「我想加一個」|
| `level-check` | 5 Levels of Claude Code 合規稽核 | ⚪ 明確要求 |
| `qa-review` | Dev 環境 QA 測試報告 | 🟢 「跑 QA」「找 bug」「上線前測試」|
| `sdd-update` | SDD 與 code 同步更新 | 🟢 「doc 過時」「設計文件更新」「SDD 跟 code 不一致」|
| `strategy-review` | 非工程策略多角度審查 | 🟢 策略決策 / 紅藍隊 / pre-mortem |
| `ai-decision-intelligence` | 技術決策多 agent 辯論系統 | 🟢 via `/decide` 自動呼叫 |

### 日常 Coding 工作流 Skills（新增 7 個，整合自 mattpocock/skills，2026-06-04）

| Skill | 功能 | 觸發 |
|-------|------|------|
| `grill-me` | 逐一追問計畫直到共識，每題提供推薦答案 | 🟢 「grill me」「問爆我」「逼我想清楚」|
| `grill-with-docs` | 追問 + 同步更新 CONTEXT.md 詞彙表 + ADR | 🟢 「grill with docs」「對齊設計」「確認術語」|
| `tdd` | 紅綠重構 TDD：垂直切片、行為測試、mock 只在邊界 | 🟢 「TDD」「寫測試」「red-green-refactor」|
| `diagnose` | 六段 debug loop（含 R0 WORKLOG 要求） | 🟢 「diagnose」「找不到 bug」「一直報錯」「效能問題」|
| `prototype` | 邏輯原型（終端 app）或 UI 原型（多 variant route） | 🟢 「prototype」「做個原型」「試幾個設計」|
| `improve-codebase-architecture` | 找架構加深機會，生成 HTML 報告 + grilling | 🟢 「架構改善」「重構機會」「很難測試」|
| `/caveman`（command） | token 壓縮 75%，持續生效直到 stop caveman | 🟢 「caveman mode」「less tokens」「be brief」|

---

## Platform Skills（12 個）

| Skill | 功能 | 觸發 |
|-------|------|------|
| `code-review` | Code review（由 `/review` 呼叫）| 🔴 Hook `verify-gate-stop.js` 提醒 |
| `security-review` | 安全深度稽核 | 🟢 critic 回報 Critical 後；⚪ 你要求 |
| `simplify` | 重構簡化 | ⚪ 你要求 |
| `fewer-permission-prompts` | 分析 transcript 加 allowlist | ⚪ 你覺得 permission prompt 太多 |
| `loop` | 週期重複執行 | ⚪ 你說「每 N 分鐘做一次」|
| `schedule` | 排程 remote agent | ⚪ 你要設定排程 |
| `claude-api` | Claude API / Anthropic SDK 開發 | ⚪ 你在寫 Anthropic SDK 程式 |
| `run` | 啟動並驗證 app | ⚪ 你說「跑起來看看」|
| `init` | 新專案初始化 | ⚪ 新 repo / 新專案 |
| `update-config` | 修改 settings.json / hooks | ⚪ 你說「從現在開始每次…」自動化需求 |
| `keybindings-help` | 自訂快捷鍵 | ⚪ 你問快捷鍵 |
| `statusline-setup` | 設定 status line | ⚪ 你要設定 status line |

---

## Agents（25 個）

### DevOps / 維護

| Agent | 功能 | 觸發 |
|-------|------|------|
| `devops-engineer` | SG/EU VPS SSH / Docker / nginx | 🟢 VPS 問題 / container crash / nginx 設定 |
| `incident-responder` | Production 告警 triage | 🟢 讀 VPS log 看到 error / Uptime Kuma DOWN / Sentry 告警 |
| `repair-agent` | 系統健康診斷（唯讀）| 🟢 health check 失敗 / MCP 連線問題 |
| `mainwp-engineer` | MainWP 管理 | 🟢 MainWP 連不上 / child site 斷線 / sync 失敗 |
| `n8n-engineer` | n8n workflow 建立/修復 | 🟠 file-path-router（編輯 `n8n/` 路徑）|
| `trigger-deploy-agent` | Trigger.dev deploy | 🟠 file-path-router（編輯 `trigger/` 路徑）|

### 資料庫 / Supabase

| Agent | 功能 | 觸發 |
|-------|------|------|
| `db-expert` | Schema / migration 安全審查（唯讀）| 🟠 file-path-router（migration/schema 路徑）|
| `supabase-engineer` | Supabase RLS / Edge Function / storage | 🟠 file-path-router（`supabase/functions/migrations/` 路徑）|

### 程式 / 工具

| Agent | 功能 | 觸發 |
|-------|------|------|
| `fullstack-engineer` | P7 全端 feature 實作 | 🟢 跨前後端 feature 需求 |
| `frontend-designer` | UI / 頁面設計 | 🟢 你說要做 landing page / dashboard / UI 改版 |
| `refactor-specialist` | 10+ 檔案大規模重構 | 🟢 重構範圍 ≥ 10 檔案 |
| `migration-engineer` | 框架/套件 major 版本升級 | 🟢 「升級 Next.js」「Vue 2→3」「套件大版本」|
| `onboarder` | 陌生 codebase 快速了解 | 🟢 第一次看這個 repo / 幾個月沒碰 |
| `tool-expert` | 工具選型 / MCP 問題 | ⚪ 工具鏈複雜問題 / MCP 失效 |

### 品質 / 安全

| Agent | 功能 | 觸發 |
|-------|------|------|
| `critic` | Code review + 安全稽核 | 🔴 Hook `verify-gate-stop/commit` 強制提醒；🟢 R0 完成前強制 |
| `debugger` | 系統性 bug 根因分析 | 🟢 讀 code 發現 bug / log 看到異常 / 行為不符預期 |
| `vuln-verifier` | 漏洞 PoC 驗證 | 🟠 file-path-router（auth/RLS 路徑）；🟢 critic 回報 Critical 後 |

### 規劃 / 決策

| Agent | 功能 | 觸發 |
|-------|------|------|
| `planner` | 複雜任務拆解（P9）| 🟢 功能跨 3+ 模組 / 需求模糊需拆解 |
| `decision-intelligence` | 19 階段技術決策辯論 | 🟢 via `/decide`；技術選型 / 架構審查 |

### 客戶 / 佈建

| Agent | 功能 | 觸發 |
|-------|------|------|
| `wordpress-maintenance-agent` | WP 備份 / 更新 / MainWP | 🟢 WP 維護工作 |
| `wordpress-plugin-expert` | WP 外掛 / Kadence / WooCommerce / Fluent | 🟠 file-path-router（wp-content/plugins 路徑）|
| `client-onboarding` | 新客戶上線 Ops Dashboard | ⚪ 明確新客戶指示 |
| `site-builder` | Lobster Factory 租戶佈建 | ⚪ 明確佈建指示 |

### 研究 / 分析

| Agent | 功能 | 觸發 |
|-------|------|------|
| `posthog-analyst` | PostHog 數據 / funnel / feature flag | ⚪ 你問「數據怎樣」「轉換率」「有人用嗎」|
| `web-researcher` | 查 API 規格 / 官方文件 / 版本差異 | 🟢 需要查外部規格或文件，不靠訓練資料猜 |

---

## Runbooks（10 個）

| Runbook | 查閱時機 | 觸發 |
|---------|---------|------|
| `HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` | 502 / site down / OOM / container restart loop | 🟢 看到這類症狀立即讀 |
| `HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md` | 可疑 process / 不明高 CPU / crypto miner | 🟢 看到異常 process 立即讀 |
| `SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md` | 未授權存取 / credentials 外洩 / 安全事件 | 🟢 任何安全事件立即讀 |
| `COMMAND_PLANE_TELEGRAM_SILENCE_RUNBOOK.md` | Telegram bot 沉默 / command plane 無回應 | 🟢 bot 沉默 > 30 分鐘 |
| `UPTIME-KUMA-MONITOR-FIX.md` | Uptime Kuma 誤報 / 監控設定錯誤 | 🟢 Uptime Kuma 行為異常 |
| `TRIGGER-DEPLOY-CLOUDFLARE-BFM.md` | Trigger.dev deploy 失敗 / Cloudflare BFM | 🟢 Trigger.dev deploy 有問題 |
| `CODEX-CONFIG-ERRORS-FIXES.md` | Codex 設定錯誤 / MCP 連不上 | 🟢 Codex / MCP 設定問題 |
| `ADD-PERIODIC-HEALTH-CHECK.md` | 新增週期性健康檢查的 SOP | ⚪ 需要新增健康檢查時 |
| `CLOUDFLARE-WAF-SETUP.md` | WAF 規則 / scanner 攻擊 / DDoS | 🟢 WAF/掃描攻擊事件 |
| `VPS-AUTO-REBOOT-RUNBOOK.md` | VPS reboot 訊號 escalation | 🟢 reboot 訊號 + 距現在 ≥ 16h |

---

## Hooks（25 個）

全部 🔴 機械強制。

### PreToolUse（在工具呼叫前）

| Hook | 攔截對象 | 作用 |
|------|---------|------|
| `git-log-injector.js` | Write\|Edit（首次）| BLOCK：顯示 git log -10，防並行 session 重工 |
| `high-risk-bash-warn.js` | Bash | BLOCK：偵測 `docker compose down/stop`、VPS rsync/scp、DB migrate deploy |
| `branch-protection.js` | Bash | BLOCK：禁止建新 branch / force push main |
| `commit-quality.js` | Bash | BLOCK：git commit 前檢查 debugger statements + secrets |
| `auto-repair-guard.js` | Write\|Edit | BLOCK（首次/分類）：編輯 Auto-Repair 邏輯路徑前強制 4 pre-checks |
| `file-path-router.js` | Write\|Edit | BLOCK（首次/分類）：編輯特定路徑時路由到正確 agent（auth/db/supabase/n8n/nginx/wp/trigger）|
| `config-protection.js` | Write\|Edit | BLOCK：禁止修改 linter/formatter config |
| `suggest-compact.js` | Write\|Edit | WARN：每 ~50 次 tool call 建議 /compact |
| `large-file-warner.js` | Read | WARN 500KB / BLOCK 2MB：保護 context window |
| `mcp-health.js pre` | mcp__.\* | 執行前檢查 MCP server 健康 |
| inline rm -rf | Bash | BLOCK：`rm -rf` |
| inline force push | Bash | BLOCK：`git push -f main/master` |
| inline --no-verify | Bash | BLOCK：`--no-verify` flag |

### PostToolUse（工具呼叫後）

| Hook | 攔截對象 | 作用 |
|------|---------|------|
| `code-change-tracker.js` | Write\|Edit | 記錄修改的 code 檔到 tracker；.ps1 額外提醒跑 audit-encoding |
| `accumulator.js` | Write\|Edit | 累積修改的 JS/TS 檔，供 Stop 時 batch format |
| `design-quality.js` | Write\|Edit | 偵測 generic template-like 前端 UI，發出警告 |
| `test-runner.js` | Write\|Edit | 自動跑相鄰 test 檔（.test.ts 等）並回報失敗 |
| `audit-log.js` | Bash | 記錄所有 bash 指令（自動 redact secrets）|
| `agent-dispatch-log.js` | Agent | 記錄 agent 召喚到 reports/agent-dispatch/ |
| `log-error.sh` | .\* | 記錄所有 tool 錯誤到 ~/.claude/error-log.md |
| `mcp-health.js failure` | mcp__.\* | 追蹤 MCP 失敗，exponential backoff |

### Stop（Claude 完成一次回應後）

| Hook | 作用 |
|------|------|
| `verify-gate-stop.js` | 顯示本 session 未驗證的 code 檔清單 + 提醒跑 /verify-recent |
| `batch-format.js` | Prettier format + tsc --noEmit 跑所有累積的 JS/TS 改動 |
| `check-console.js` | 偵測修改檔案中的 stray console.log |
| `cost-tracker.js` | 記錄 token 使用量與估算成本 |
| `session-summary.js` | 寫 session summary 到 ~/.claude/sessions/ |

### UserPromptSubmit / SessionStart

| Hook | 作用 |
|------|------|
| `ao-resume-on-prompt.ps1` | UserPromptSubmit：偵測開工關鍵字 → 觸發 AO-RESUME（300 秒去重）|
| `post-push-trigger-deploy.ps1` | git push 後自動觸發 Trigger.dev deploy（若設定）|

---

## 觸發統計

| 觸發類型 | 數量 | 說明 |
|---------|------|------|
| 🔴 Hook 機械強制 | 25 hooks | 100% 可靠，我無法繞過 |
| 🟠 File-path-router | 7 類別（db/supabase/n8n/auth/nginx/wp/trigger）| 100% 可靠，編輯路徑時自動 |
| 🟡 AO 生命週期 | 2（ao-resume / ao-close）| 100% 可靠 |
| 🟢 AGENTS.md 自判 | ~55 個工具 | 中等可靠，靠我的情境判斷 |
| ⚪ 需你發動 | ~20 個工具 | High-risk 等 go-ahead / 純 user intent 類 |
