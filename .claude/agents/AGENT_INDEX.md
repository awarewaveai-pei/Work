# Agent Index

> 自動產生的完整 subagent 索引。SSOT = 各 `.claude/agents/*.md` frontmatter。
> 欄位：名稱 / 描述 / model / 工具權限 / 檔案路徑。
> 重生方式：`awk '/^---/{c++;next}c==1{print}c==2{exit}' .claude/agents/<name>.md`
> Last generated: 2026-05-30

共 **26** 個自訂 agents（不含內建 general-purpose / Explore / Plan / statusline-setup）。

`model` 欄標 `(inherit)` = frontmatter 無 `model:`，繼承父對話 / 預設模型。

---

## DevOps / 維運

| Agent | Model | 工具 | 描述 |
|---|---|---|---|
| [devops-engineer](devops-engineer.md) | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch | ks-aw-01 基礎設施工程師（原 SG/EU 已整併）：SSH、Docker Compose、nginx、重啟服務、讀 log、infra incident。 |
| [incident-responder](incident-responder.md) | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch | 生產告警第一響應者（Sentry/Uptime Kuma/Netdata/Grafana/Hetzner/Cloudflare/Telegram/Slack）：分流→定位根因類別→派對的專家 agent。 |
| [repair-agent](repair-agent.md) | inherit | Read, Grep, Glob, Bash, WebSearch, WebFetch | 唯讀診斷：health check 失敗、腳本報錯、MCP 斷線、治理交叉引用斷裂時讀 log/config，回根因+修法，不寫不 commit。 |
| [mainwp-engineer](mainwp-engineer.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch | ks-aw-01 上 MainWP dashboard 管理（原 EU）：增刪 child site、token、修 sync、設定 extension、跨站 bulk 操作。 |
| [n8n-engineer](n8n-engineer.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch | 自建 n8n（ks-aw-01 145.239.195.47）workflow 工程師：建/除錯/維護自動化、憑證、webhook/trigger。 |
| [trigger-deploy-agent](trigger-deploy-agent.md) | inherit | Read, Grep, Glob, Bash, mcp__server-ssh__ssh_connect, ssh_exec, ssh_disconnect, ssh_list_connections | 部署 Trigger.dev workflow 到 EU（trigger.aware-wave.com）；需 `tr_pat_*`（非 `tr_prod_*`）。 |

## 資料庫 / Supabase

| Agent | Model | 工具 | 描述 |
|---|---|---|---|
| [db-expert](db-expert.md) | opus | Read, Grep, Glob, Bash, WebSearch, WebFetch | 資料庫專家：schema 設計、migration 安全、查詢最佳化、索引建議。唯讀，只分析回報不改。merge 任何動 DB 的改動前用。 |
| [supabase-engineer](supabase-engineer.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch | EU Supabase：schema、migration、RLS policy、Edge Function、storage bucket、auth/permission 除錯。 |

## 程式 / 工程

| Agent | Model | 工具 | 描述 |
|---|---|---|---|
| [fullstack-engineer](fullstack-engineer.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch | P7 方法論資深全端：讀現況→設計→影響分析→實作→三問自審→[P7-COMPLETION]。單功能與跨模組改動。 |
| [frontend-designer](frontend-designer.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch | 前端設計師：landing page、dashboard、component；拒絕 AI slop，押大膽美學方向，出 production 品質。 |
| [refactor-specialist](refactor-specialist.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch | 大規模安全重構：跨多檔 rename、抽 module、搬檔、重組資料夾。比 fullstack 更謹慎、scope 嚴、重驗證。10+ 檔的重構用。 |
| [migration-engineer](migration-engineer.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch | 框架/函式庫/語言大版本升級：讀 changelog、稽核每處 API 用法、漸進升級每步驗證（Next 13→14、Vue 2→3 等）。 |
| [onboarder](onboarder.md) | sonnet | Read, Grep, Glob, Bash | 陌生 codebase 首次探勘：建架構/入口/核心模組/外部依賴/可疑處的心智模型。唯讀。 |

## 品質 / 安全

| Agent | Model | 工具 | 描述 |
|---|---|---|---|
| [critic](critic.md) | opus | Read, Grep, Glob, Bash, WebSearch, WebFetch | Code reviewer + 資安稽核：抓 bug/安全洞/邏輯錯/edge case/效能/不一致，每筆附 file:line。每次 commit/deploy/merge 前用。 |
| [vuln-verifier](vuln-verifier.md) | opus | Read, Grep, Glob, Bash, WebSearch, WebFetch | 漏洞驗證：拿 critic 的發現寫實際 PoC 證明真偽，產可用於 advisory/issue/PR 的驗證報告。critic 標記疑似漏洞後用。 |
| [debugger](debugger.md) | opus | Read, Grep, Glob, Bash, WebSearch, WebFetch | 除錯工程師 + log 分析：系統化找根因（讀 log→縮範圍→建假設→驗證→修）。也分析 PM2/Docker/systemd/Nginx log。 |

## 規劃 / 決策

| Agent | Model | 工具 | 描述 |
|---|---|---|---|
| [planner](planner.md) | opus | Read, Grep, Glob, Bash, WebSearch, WebFetch | P9 方法論 tech lead：把模糊需求拆成可並行 Task Prompt（六要素契約）。動 3+ 檔或 2+ 模組前用。只出 prompt 不寫 code。 |
| [decision-intelligence](decision-intelligence.md) | inherit | Read, Bash, Glob, Grep, WebSearch, WebFetch | 多 agent 決策智囊團：19 階段、8–13 個專家辯論，出排序建議+取捨矩陣+pre-mortem+rollout+風險登記+ADR skeleton。 |

## 客戶 / 佈建

| Agent | Model | 工具 | 描述 |
|---|---|---|---|
| [client-onboarding](client-onboarding.md) | inherit | Read, Grep, Glob, Bash, WebSearch, WebFetch | 新客戶上線到 Ops Dashboard：建 Supabase organizations、設 client_config、必要時存 SSH key 到 SG，驗證 /ops/clients。 |
| [site-builder](site-builder.md) | inherit | Read, Grep, Glob, Bash, WebSearch, WebFetch, mcp__github__create_repository, create_branch, push_files | Lobster Factory 租戶佈建：建 GitHub repo/Sentry/PostHog/Supabase schema/n8n workflow。需明示授權，失敗 rollback。 |
| [wordpress-maintenance-agent](wordpress-maintenance-agent.md) | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch | WP 客戶維護（MainWP/WPvivid/SSH/WP-CLI/Ops Dashboard）：備份狀態、sync 檢視、plugin 更新規劃、backup-gated 安全更新。 |
| [wordpress-plugin-expert](wordpress-plugin-expert.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch | WP plugin 專家：Kadence、WooCommerce、Fluent 全家桶。診斷衝突、設定、寫 snippet、WP-CLI/SSH 修。 |

## 分析 / 研究 / 工具

| Agent | Model | 工具 | 描述 |
|---|---|---|---|
| [posthog-analyst](posthog-analyst.md) | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch | PostHog 產品分析：events/funnel/retention/feature flag。唯讀。查採用率、轉換率、行為、error 趨勢、event 有無被追蹤。 |
| [web-researcher](web-researcher.md) | sonnet | WebSearch, WebFetch | 技術文件研究員：查 API spec、官方文件、error code、版本差異、函式庫用法。只搜不寫不改。 |
| [tool-expert](tool-expert.md) | sonnet | Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch, Agent | 工具專家：選對工具、串複雜 workflow、排除工具故障。內建 vs MCP vs shell 的取捨。 |
