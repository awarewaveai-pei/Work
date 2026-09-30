# Claude Code 完整檔案參考清單

> **用途**：列出 Claude Code（CLI / VSCode extension）在每次對話中**實際讀取、寫入、執行**的所有檔案。  
> 此清單只描述現行 Claude Code / Codex 相容工作流；Cursor 已於 2026-08-26 退場，底部內容僅保留為歷史對照。
> 現行架構 SSOT：`CLAUDE.md` + `agency-os/AGENTS.md`；Codex bridge / hooks：`mcp/claude-userlevel/`。

---

## ⚠️ 最重要的架構分界

| IDE | 自動載入機制 | 規則/指令檔位置 |
|-----|------------|--------------|
| **Claude Code** | `CLAUDE.md` (`@-include`) + Auto Memory | `.claude/commands/` · `.claude/agents/` · `.claude/skills/` |
| **Cursor** | 已退場（2026-08-26） | 不再載入或維護 `.cursor/rules/`；本表僅保留歷史對照。|

**歷史註記**：`.cursor/rules/*.mdc` 曾是 Cursor 專用，Claude Code 永遠不讀；現行 workflow 不再使用此樹。

---

## Category 1 — 自動載入（Tier 0，每次對話無條件）

| 檔案 | 說明 |
|------|-----|
| `CLAUDE.md`（repo root） | 專案指令，`@agency-os/AGENTS.md` via @-include |
| `agency-os/AGENTS.md` | 全局 Agent 身份 + 所有操作規則 |
| `~/.claude/projects/c--Users-USER-Work/memory/MEMORY.md` | Auto Memory 索引，比 CLAUDE.md 更早注入上下文 |
| `~/.claude/projects/c--Users-USER-Work/memory/*.md` | Auto Memory 個別記憶檔（user / feedback / project / reference）|

---

## Category 2 — Session 啟動主動讀取（Tier 1，AO-RESUME）

按 `.claude/commands/ao-resume.md` Step 1 讀取順序：

| 檔案 | 說明 |
|------|-----|
| `agency-os/TASKS.md` | 任務狀態 |
| `agency-os/.agency-state/worklog-excerpt.md`（WORKLOG since last AO-CLOSE；不存在時 fallback `WORKLOG.md` last 30 lines） | 最近工作紀錄 |
| `agency-os/memory/CONVERSATION_MEMORY.md` | 長期對話記憶 |
| `agency-os/memory/daily/YYYY-MM-DD.md` | 今日日記 |
| `agency-os/memory/daily/YYYY-MM-DD.md`（昨日） | 昨日日記 |
| `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md` | 龍蝦工廠進度 |
| `lobster-factory/docs/LOBSTER_FACTORY_COMPLETION_PLAN_V2.md` | 龍蝦工廠計畫 |
| `agency-os/handoffs/*.md`（最新） | /tomo handoff packet（七段式第 7 段 inline）|
| `agency-os/.agency-state/ao-resume-hook-last.json` | Hook 執行狀態（去重 + exit code）|
| `agency-os/.agency-state/external-signals-digest.json` | 外部信號摘要（Telegram / Slack / 告警）|
| `agency-os/.agency-state/open-tasks-snapshot.md` | 開放任務快照 |
| `agency-os/.agency-state/doc-sync-state.json` | Doc sync 最後執行狀態 |
| `agency-os/reports/status/auto-reboot-LATEST.md` | VPS auto-reboot 健康狀態（必讀，AGENTS.md 強制）|
| `agency-os/reports/status/cf-security-LATEST.md` | Cloudflare 安全狀態（mtime > 24h 才重跑腳本）|

---

## Category 3 — Slash Commands（Tier 2，使用者輸入 `/cmd` 才載入）

位置：`.claude/commands/`（junction → `~/.claude/commands/`）

| 命令 | 說明 |
|------|-----|
| `ao-resume.md` | 開工七段式 |
| `ao-close.md` | 收工流程 |
| `apply-audit.md` | 套用 audit report patch |
| `audit-cross-machine-bom.md` | BOM 跨機稽核 |
| `audit-encoding.md` | CP950 encoding 稽核 |
| `auto-reboot-status.md` | VPS auto-reboot 即時查詢 |
| `build-tenant.md` | 租戶佈建 |
| `check-drift.md` | Deploy / governance drift 偵測 |
| `checkpoint.md` | 手動 checkpoint commit |
| `client-onboarding.md` | 客戶上線 |
| `client-status.md` | 客戶狀態查詢 |
| `command-plane-verify.md` | Command plane 驗證 |
| `decide.md` | 決策輔助 |
| `doc-sync.md` | 文件同步 |
| `ks-aw-01-reboot.md` | 唯一現役主機重啟（取代已删除的 sg-reboot / eu-reboot）|
| `health.md` | 系統健康檢查 |
| `phase4-check.md` | Phase 4 進度查詢 |
| `playwright.md` | Playwright 測試 |
| `recap.md` | 對話摘要 |
| `review.md` | Critic subagent 審查 |
| `sg-deploy.md` | ks-aw-01 部署（指令名稱為歷史）|
| `signals.md` | 外部信號抓取 |
| `smoke-test.md` | Smoke test |
| `strategy-review.md` | 策略審查 |
| `sync-check.md` | 雙機同步檢查 |
| `tasks.md` | TASKS.md 查詢 |
| `tomo.md` | Handoff packet 建立 |
| `vault-status.md` | Secrets vault 狀態 |
| `vault-sync.md` | Vault 跨機同步 |
| `verify-recent.md` | 本 session 改動驗證 |
| `verify.md` | 通用驗證 |
| `wp-maintenance.md` | WordPress 維護 |

**共 34 個命令**（`ls .claude/commands/*.md | wc -l`）

---

## Category 4 — Subagents（Tier 2，Agent tool 觸發才載入）

位置：`.claude/agents/`

| 定義檔 | Subagent 說明 |
|--------|-------------|
| `critic.md` | 程式碼審查 / 安全稽核 |
| `db-expert.md` | 資料庫設計 / 遷移安全 |
| `debugger.md` | 除錯 / log 分析 |
| `decision-intelligence.md` | 多代理決策分析 |
| `devops-engineer.md` | SG/EU VPS DevOps |
| `frontend-designer.md` | 前端 UI 設計 |
| `fullstack-engineer.md` | 全端功能開發（P7 方法論）|
| `incident-responder.md` | 生產告警第一響應者 |
| `mainwp-engineer.md` | MainWP 管理 |
| `migration-engineer.md` | 框架升級 / 大版本遷移 |
| `n8n-engineer.md` | n8n workflow 工程師 |
| `onboarder.md` | 陌生 codebase 探索 |
| `planner.md` | 技術 lead / 任務分解（P9 方法論）|
| `posthog-analyst.md` | PostHog 產品分析 |
| `refactor-specialist.md` | 大規模重構 |
| `repair-agent.md` | 系統健康診斷（唯讀）|
| `site-builder.md` | 租戶佈建 |
| `supabase-engineer.md` | Supabase 工程師 |
| `tool-expert.md` | 工具鏈選型 / MCP 排錯 |
| `trigger-deploy-agent.md` | Trigger.dev deploy |
| `vuln-verifier.md` | 漏洞驗證（PoC）|
| `web-researcher.md` | 技術文件搜尋（唯讀）|
| `wordpress-maintenance-agent.md` | WordPress 維護 |
| `wordpress-plugin-expert.md` | WP 外掛專家 |
| `client-onboarding.md` | 客戶上線 subagent |

**共 25 個 subagents**（另有 `README.md` × 2 說明文件）

---

## Category 5 — Skills（Tier 2，`/skill` 觸發才載入）

位置：`.claude/skills/`

| 技能目錄 | 說明 |
|---------|-----|
| `feature-plan/SKILL.md` | 功能規劃 |
| `integration-javascript_node/SKILL.md` | JS/Node 整合 |
| `level-check/SKILL.md` | 程式碼等級評估 |
| `qa-review/SKILL.md` | QA 審查 |
| `sdd-update/SKILL.md` | SDD 文件更新 |
| `strategy-review/SKILL.md` | 策略審查 |
| `ai-decision-intelligence.skill` | AI 決策輔助 |

> **注意**：Claude Desktop app 另有 FleetView skills plugin 提供的 pdf / xlsx / pptx / docx / skill-creator / schedule / setup-cowork / consolidate-memory 等技能，儲存在 `AppData\Roaming\Claude\local-agent-mode-sessions\`，**非 repo 管理**。

---

## Category 6 — Claude 寫入的檔案

| 檔案 | 時機 |
|------|-----|
| `agency-os/WORKLOG.md` | 每個 R0 任務完成 + AO-CLOSE |
| `agency-os/TASKS.md` | 任務狀態異動 |
| `agency-os/memory/CONVERSATION_MEMORY.md` | 對話 8000+ 中文字時濃縮 |
| `agency-os/memory/daily/YYYY-MM-DD.md` | 每日日記 |
| `agency-os/reports/ao-close/*.md` | AO-CLOSE 存檔 |
| `agency-os/reports/ao-resume/*.md` | AO-RESUME 存檔 |
| `agency-os/handoffs/YYYY-MM-DD-*.md` | /tomo handoff packet |
| `agency-os/.agency-state/ao-resume-hook-last.json` | AO-RESUME hook 去重更新 |
| `agency-os/.agency-state/open-tasks-snapshot.md` | 開放任務快照更新 |
| `~/.claude/projects/c--Users-USER-Work/memory/*.md` | Auto Memory 寫入 |

---

## Category 7 — Claude 執行的 Scripts

位置：`scripts/`（PowerShell）

| 腳本 | 觸發時機 |
|------|---------|
| `ao-resume.ps1` | AO-RESUME hook + `/ao-resume` 命令 |
| `ao-close.ps1` | AO-CLOSE 收工 `/ao-close` 命令 |
| `commit-checkpoint.ps1` | `/tomo`、`/checkpoint` 命令 |
| `verify-sid-shared.ps1` | `/verify-recent` shared helper（SID 計算）|
| `verify-recent-ack.ps1` | `/verify-recent --ack` atomic helper |
| `verify-closeout-completeness.ps1` | AO-CLOSE gate（機械驗證 R0 四動作）|
| `bughunt-oracle.ps1` | commit-time：驗證 `BUGHUNT_DONE: hits=0` 宣告 |
| `fetch-external-signals.ps1` | AO-RESUME（Telegram/Slack/告警）|
| `check-cloudflare-security.ps1` | AO-RESUME + 使用者問 CF 設定 |
| `check-vps-auto-reboot-health.ps1` | AO-RESUME reboot 狀態 |
| `secrets-vault.ps1` | 任何需要 key 的操作 |
| `sync-mcp-config.ps1` | MCP registry 異動後 |
| `register-new-governance-doc.ps1` | 新治理文件建立後 |
| `audit-tools/dogfood-auto-repair.ps1` | Auto-Repair 程式碼改動觸發 |

---

## Category 8 — 查詢用 Runbooks/Docs（按需讀取，非自動載入）

| 檔案 | 觸發情境 |
|------|---------|
| `agency-os/docs/operations/BUG_HUNT_PROTOCOL.md` | audit / 抓蟲 / encoding 相關議題 |
| `agency-os/docs/operations/AUDIT_REGISTRY.md` | apply-audit / bug class 狀態查詢 |
| `agency-os/reports/audit/*.md` | apply-audit 指令 |
| `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` | deploy / rollback 操作 |
| `agency-os/runbooks/*.md` | 502/OOM/入侵/CF/Codex 緊急處置 |
| `agency-os/docs/operations/scope-change-policy.md` | 客戶新增需求 |
| `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` | MCP routing 決策 |
| `lobster-factory/docs/ROUTING_MATRIX.md` | MCP routing 人讀矩陣 |
| `mcp/registry.template.json` | MCP registry 異動 |
| `agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md` | MCP 工具盤點 |
| `agency-os/docs/operations/cursor-enterprise-rules-index.md` | IDE 規則架構查詢 |
| `agency-os/tenants/<slug>/core/ENVIRONMENT_REGISTRY.md` | 客戶 Staging URL（SSOT）|
| `agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md` | 換機 / 雙機設定 |

---

## 歷史附錄：Cursor IDE 自動載入（已退場）

以下檔案曾由 **Cursor IDE** 透過 `alwaysApply: true` 自動注入；Cursor 已退場，Claude Code / Codex 不讀此歷史樹：

| 正本位置 | Mirror | 說明 |
|---------|--------|-----|
| `agency-os/.cursor/rules/00-session-bootstrap.mdc` | `.cursor/rules/00-session-bootstrap.mdc` | Session 啟動 |（歷史退場）
| `agency-os/.cursor/rules/10-memory-maintenance.mdc` | `.cursor/rules/` | 記憶維護 |（歷史退場）
| `agency-os/.cursor/rules/20-doc-sync-closeout.mdc` | `.cursor/rules/` | Doc sync |（歷史退場）
| `agency-os/.cursor/rules/30-resume-keyword.mdc` | `.cursor/rules/` | AO-RESUME 關鍵字 + 七段格式 |（歷史退場）
| `agency-os/.cursor/rules/40-shutdown-closeout.mdc` | `.cursor/rules/` | AO-CLOSE 收工流程 |（歷史退場）
| `agency-os/.cursor/rules/50-operator-autopilot.mdc` | `.cursor/rules/` | Autopilot 模式 |（歷史退場）
| `agency-os/.cursor/rules/60-beginner-operation-format.mdc` | `.cursor/rules/` | 初階操作格式 |（歷史退場）
| `agency-os/.cursor/rules/62-progress-heartbeat-15min.mdc` | `.cursor/rules/` | 15 分鐘心跳 |（歷史退場）
| `agency-os/.cursor/rules/63-cursor-core-identity-risk.mdc` | `.cursor/rules/` | 身分 + 風險分級（精簡）|（歷史退場）
| `agency-os/.cursor/rules/64-architecture-mcp-routing.mdc` | `.cursor/rules/` | 架構 + MCP routing |（歷史退場）
| `agency-os/.cursor/rules/65-build-standards-data-state.mdc` | `.cursor/rules/` | 建置標準 + 狀態機 |（歷史退場）
| `agency-os/.cursor/rules/66-skills-observability-protocol.mdc` | `.cursor/rules/` | Skills + 可觀測性 |（歷史退場）
| `agency-os/.cursor/rules/67-shared-mcp-governance.mdc` | `.cursor/rules/` | 共用 MCP 治理 |（歷史退場）

> **歷史 SSOT**：`agency-os/.cursor/rules/` 曾由同步腳本鏡像；現行 SSOT 請看 `CLAUDE.md`、`agency-os/AGENTS.md` 與 `mcp/claude-userlevel/`。

---

## Related Documents

- [`docs/operations/cursor-enterprise-rules-index.md`](cursor-enterprise-rules-index.md) — **歷史** IDE 規則索引（Cursor vs Claude Code 對照表）
- `CLAUDE.md` (repo root) — 專案指令 SSOT
- `agency-os/AGENTS.md` — 全局 Agent 規則 SSOT
- [`.claude/commands/ao-resume.md`](../../../.claude/commands/ao-resume.md) — AO-RESUME 執行 SSOT（含完整 Tier 1 讀檔清單）

_Last updated: 2026-05-27_
