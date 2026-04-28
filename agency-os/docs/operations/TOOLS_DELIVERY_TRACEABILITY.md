# 工具交付追溯總表（平台能力／自託管／建置順序）

## 目的

- **單一 Owner**：本檔同時承載（1）**一句話工具總索引（§0，僅連結）**、（2）**平台能力狀態表**、（3）**建置順序／任務追溯**；不在其他檔複製 §0 大表或狀態格。
- 避免「看得到任務，但看不到能力全景」或「有工具清單，卻不知道何時建」的落差。
- 作為 `TASKS.md`、`cursor-mcp-and-plugin-inventory.md`、`MCP_TOOL_ROUTING_SPEC.md` 之間的對照中樞。
- **維護規則**：改**狀態／P 階段／DoD**只改本檔下方表格；改**某工具專文**只改其 Owner 連結目標；§0 僅在「新增／下架工具」或「專文搬家」時改列。

## 0. 平台與工具總索引（一句話＋專文／計畫）

> **只列連結與一句話**，不重貼各 Owner 正文。🟢🟡⚪ 狀態以**本檔「平台能力總表」**為準。

**閱讀順序**：① 下表 → ② 本檔 **「平台能力總表」** 與 **「工具建置順序」** → ③ [`MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) → ④ [`cursor-mcp-and-plugin-inventory.md`](cursor-mcp-and-plugin-inventory.md) → ⑤ [`CURSOR_AGENT_RUNTIME_PLAYBOOK.md`](CURSOR_AGENT_RUNTIME_PLAYBOOK.md)（執行期：MCP 驗證與 SSH／API／CLI 備援）。

| 項目 | 一句話角色 | 專門說明（正文入口） | 長篇計畫／邊界／階段 |
|:---|:---|:---|:---|
| **編排路由（強制）** | 誰能 orchestrate、核准、env | [`MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)、[`ROUTING_MATRIX.md`](../../../lobster-factory/docs/ROUTING_MATRIX.md) | [ADR 004](../architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md) |
| **能力狀態與 P 階段** | 上線與否、何時建、證據 | **本檔**「平台能力總表」「工具建置順序」「任務到規格追溯」 | `TASKS.md` |
| **Cursor MCP 全鍵** | IDE 外掛分工、與路由對照 | [`cursor-mcp-and-plugin-inventory.md`](cursor-mcp-and-plugin-inventory.md)、repo 根 `mcp.json` | §8「無 `task_type`」輔助鍵（replicate、perplexity、**work-global** 等） |
| **Supabase** | 結構化 SoR、RLS | [ADR 005](../architecture/decisions/005-supabase-sor-vs-wordpress-runtime-db.md)、[`supabase-self-hosted-cutover-checklist.md`](supabase-self-hosted-cutover-checklist.md) | [`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)（BFF 窄代理邊界） |
| **WordPress** | 站內執行期、內容 | [`WORDPRESS_CLIENT_DELIVERY_MODELS.md`](WORDPRESS_CLIENT_DELIVERY_MODELS.md)、[`tools-and-integrations.md`](tools-and-integrations.md) | 同 API PLAN（與 apex `/api/` 關係） |
| **n8n** | 黏着、webhook、輕流程 | [`n8n-workflow-architecture.md`](../standards/n8n-workflow-architecture.md) | [ADR 004](../architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md) |
| **Trigger.dev** | 耐久編排、重試 | [`github-actions-trigger-prod-deploy.md`](github-actions-trigger-prod-deploy.md)、[`hetzner-stack-rollout-index.md`](hetzner-stack-rollout-index.md) | [`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)（薄代理） |
| **`api.aware-wave.com` / `node-api`** | 內部 BFF、HTTP 邊緣 | [`CLOUDFLARE_HETZNER_PHASE1.md`](CLOUDFLARE_HETZNER_PHASE1.md)、[`../edge-and-domains/EDGE_DOMAINS_INDEX.md`](../edge-and-domains/EDGE_DOMAINS_INDEX.md) | [`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md) |
| **`app.aware-wave.com` /admin** | 書籤入口 → apex | [`CLOUDFLARE_HETZNER_PHASE1.md`](CLOUDFLARE_HETZNER_PHASE1.md) §子網域 | 同 API PLAN §1.2 |
| **Hetzner / phase1 compose** | 自託管主機與堆疊 | [`hetzner-self-host-start-here.md`](hetzner-self-host-start-here.md)、[`../../../lobster-factory/infra/hetzner-phase1-core/README.md`](../../../lobster-factory/infra/hetzner-phase1-core/README.md) | [`LONG_TERM_OPS.md`](../../../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md) |
| **Cloudflare** | DNS、WAF、TLS 邊緣 | [`CLOUDFLARE_HETZNER_PHASE1.md`](CLOUDFLARE_HETZNER_PHASE1.md) | 本檔 P5；[`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md) |
| **Nginx（系統／容器）** | 反代、TLS、路由 | `lobster-factory/infra/hetzner-phase1-core/nginx/`、`aware-wave-app-api-subdomains.conf` | [`edge-and-domains/EDGE_DOMAINS_INDEX.md`](../edge-and-domains/EDGE_DOMAINS_INDEX.md) 快速導覽 |
| **Sentry** | 錯誤與效能訊號 | [`SENTRY_ALERT_POLICY.md`](SENTRY_ALERT_POLICY.md)、[`tools-and-integrations.md`](tools-and-integrations.md) | [`PLAN_30Y_STABILITY_HARDENING.md`](../governance-plans/PLAN_30Y_STABILITY_HARDENING.md) Phase 1 |
| **PostHog** | 產品分析／funnel | `hetzner-phase1-core/README`（`NEXT_PUBLIC_POSTHOG_*`）、[`ARCHITECTURE_SPEC.md`](ARCHITECTURE_SPEC.md) | 本檔 P4；[`PROGRAM_TIMELINE.md`](../overview/PROGRAM_TIMELINE.md) OP-6 |
| **Clerk** | B2B 身分邊界 | [ADR 002](../architecture/decisions/002-clerk-identity-boundary.md) | 本檔 P6；API PLAN P1 |
| **GitHub Actions** | CI、Trigger 部署等 | [`github-actions-trigger-prod-deploy.md`](github-actions-trigger-prod-deploy.md) | 本檔「平台能力總表」列為已上線能力 |
| **Redis** | 快取、冪等、限流（預留） | [`hetzner-stack-rollout-index.md`](hetzner-stack-rollout-index.md) | API PLAN P2 |
| **Replicate** | 推論／影像（API） | [`tools-and-integrations.md`](tools-and-integrations.md)、`cursor-mcp-and-plugin-inventory` **replicate** | 規格長文：`docs/spec/raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md` §10.6 |
| **Perplexity／work-global／各家 LLM MCP** | 草擬、搜尋、**不**寫入生產權威 | `cursor-mcp-and-plugin-inventory` §8 | — |
| **DataForSEO** | SEO 資料 API | [`tools-and-integrations.md`](tools-and-integrations.md)（Expected env） | — |
| **Secrets／輪替** | 憑證治理 | [`security-secrets-policy.md`](security-secrets-policy.md)、[`mcp-secrets-hardening-runbook.md`](mcp-secrets-hardening-runbook.md) | [`PLAN_30Y_STABILITY_HARDENING.md`](../governance-plans/PLAN_30Y_STABILITY_HARDENING.md) Phase 2 |
| **全庫穩定化（觀測／DR／gate）** | 30 年級底座 | 本檔能力表＋[`PLAN_30Y_STABILITY_HARDENING.md`](../governance-plans/PLAN_30Y_STABILITY_HARDENING.md) | 同左 |
| **規則治理（Cursor／AO）** | 單一 Owner、鏡像 | [`rules-version-and-enforcement.md`](rules-version-and-enforcement.md) | [`PLAN_30_YEAR_RULE_CONSOLIDATION.md`](../governance-plans/PLAN_30_YEAR_RULE_CONSOLIDATION.md)、[`PLAN_RULES_STABILITY_CONSOLIDATION.md`](../governance-plans/PLAN_RULES_STABILITY_CONSOLIDATION.md) |
| **Uptime Kuma／Netdata** | 可用性／主機指標（若採用） | [`WORKLOG.md`](../../WORKLOG.md)、[`memory/CONVERSATION_MEMORY.md`](../../memory/CONVERSATION_MEMORY.md) | 可併入 `PLAN_30Y_STABILITY_HARDENING` 演進；尚無獨立規格 Owner |
| **AI／代理操作路徑（MCP·API·SSH）** | 自架 vs 雲、人讀一表 | **本檔 §0.1**、monorepo 根 [`mcp/SERVICE_MATRIX.md`](../../../mcp/SERVICE_MATRIX.md) | [`CURSOR_AGENT_RUNTIME_PLAYBOOK.md`](CURSOR_AGENT_RUNTIME_PLAYBOOK.md)、[`AWARE_WAVE_OBSERVABILITY_BASELINE.md`](AWARE_WAVE_OBSERVABILITY_BASELINE.md) |

**子網域／邊緣統管**：[`../edge-and-domains/EDGE_DOMAINS_INDEX.md`](../edge-and-domains/EDGE_DOMAINS_INDEX.md)｜**舊 Cursor plan 對照**：[`../governance-plans/GOVERNANCE_PLANS_INDEX.md`](../governance-plans/GOVERNANCE_PLANS_INDEX.md)

## 0.1 AI／代理操作路徑 SSOT（自架 · 雲端 · 建議路徑）

> **用途**：讓人與代理一眼分辨「**該用 MCP 還是走 API／UI／SSH**」；**不得**在表內或聊天貼**生效中的**密鑰。實裝的 MCP 鍵名、雙專案 Supabase 等，以 monorepo 根 **`.mcp.json`／`mcp.json.template`／`secrets-vault.ps1`** 與下表**憑證欄**為準。  
> **雙寫合約**：**敘事與流程**以本表 + **`cursor-mcp-and-plugin-inventory.md`** 為準；**MCP 與雲服務的機讀分岔**可另見根目錄 **`mcp/SERVICE_MATRIX.md`**（兩者衝突時，以**版控專文** + **`verify-build-gates`** 契約優先，並在 PR 修正漂移）。

| 系統 / 邊界 | 典型部署 | 入口 / 邊界（正字；勿混用寫法） | 建議操作路徑（代理優先序） | 憑證 / 設定鍵（僅名稱；值走 vault / env） | 正本或延伸 |
|:---|:---|:---|:---|:---|:---|
| **n8n** | 自託管（Hetzner） | `https://n8n.aware-wave.com`（`GET /healthz` 見觀測基線） | ① **MCP** 鍵 **`n8n`**（HTTP）② n8n REST ③ 瀏覽器 UI | `N8N_BASE_URL`、`N8N_API_KEY`（與 `tools-and-integrations.md` 一致；實機以部署為準） | [`n8n-workflow-architecture.md`](../standards/n8n-workflow-architecture.md) |
| **Supabase（AwareWave／自託管 SoR）** | 自託管 Postgres 堆疊 | 內網 DB／API 邊界；**MCP 僅** schema／除錯視角，**不**等於生產寫入管線 | ① **REST**：`awarewave-ops` → `supabase_awarewave` ② **SQL MCP**：`supabase-awarewave-postgres` + `run-postgres-mcp.ps1` + `SUPABASE_AWAREWAVE_POSTGRES_DSN`（先開 tunnel）③ 應用 / Edge ④ migrations | `SUPABASE_AWAREWAVE_URL`、`SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY`、`SUPABASE_AWAREWAVE_POSTGRES_DSN`、JWT／DB 密（見 [`supabase-self-hosted-cutover-checklist.md`](supabase-self-hosted-cutover-checklist.md)） | [ADR 005](../architecture/decisions/005-supabase-sor-vs-wordpress-runtime-db.md) |
| **Supabase（Soulful Expression／雲端專案）** | 供應商雲託管 | 供應商 Dashboard 與專用 API URL；與上列 AwareWave 在帳戶/專案上分開 | ① **MCP**（庫內鍵 **`supabase-soulfulexpression`**；`mcp.supabase.com` URL 已寫入 **`.cursor/mcp.json`**）② 官方管理 API ③ 儀表板 | **`SUPABASE_SOULFULEXPRESSION_AUTH_BEARER_TOKEN`**（Bearer）、`SUPABASE_SOULFULEXPRESSION_URL`、`SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY`；勿與 AwareWave 專案混用 | 供應商文件 + 本庫 `mcp.json`；[`cursor-mcp-and-plugin-inventory.md`](cursor-mcp-and-plugin-inventory.md) §2 |
| **Trigger.dev** | 自託管（Hetzner） | `https://trigger.aware-wave.com` | ① **MCP** 鍵 **`trigger`** ② `trigger.dev` API／CLI ③ Dashboard | `TRIGGER_SECRET_KEY`、API/Worker **base URL**；每台開發機一組（[`TASKS.md`](../../TASKS.md)、`RESUME_AFTER_REBOOT`） | [`github-actions-trigger-prod-deploy.md`](github-actions-trigger-prod-deploy.md)、`lobster-factory/infra/trigger/README.md` |
| **Uptime Kuma** | 自託管 | `https://uptime.aware-wave.com/dashboard` | ① 官方 UI／Socket API ② 專案內 **AwareWave Ops** 匯流（若有）— 見 `mcp/SERVICE_MATRIX` | 儀表板登入、API token（若啟用）；**不入庫** | [`AWARE_WAVE_OBSERVABILITY_BASELINE.md`](AWARE_WAVE_OBSERVABILITY_BASELINE.md) |
| **Grafana**（+ Loki 觀測棧常同機） | 自託管 | 常 **僅本機回環**（如 `:3009`）或 **SSH tunnel** 後再開瀏覽器；勿預設對公網 exposure | ① `scripts/open-grafana-ssh-tunnel.ps1` 等（見觀測文）② Grafana HTTP API ③ 瀏覽器 | admin 密碼僅在 VPS/`.env`（**不入庫**；見 [`OBSERVABILITY_FIRST_TIME_SETUP_ZH.md`](OBSERVABILITY_FIRST_TIME_SETUP_ZH.md)） | 同上、[`OBSERVABILITY_P1_P2_ROLLOUT.md`](OBSERVABILITY_P1_P2_ROLLOUT.md) |
| **對外公開網域**（apex／admin／api） | CDN + 自託管 origin | `https://aware-wave.com` · `https://app.aware-wave.com` · **`https://api.aware-wave.com/health`**（**非** `api-awarewave.com` 類誤寫） | ① 健康與 e2e：`curl`／smoke ② 經 **AwareWave Ops** 匯流（`mcp/SERVICE_MATRIX`）③ 應用 Sentry/日誌 | 應用與 WAF 憑證分層；見邊界文件 | [`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)、`AWARE_WAVE_OBSERVABILITY_BASELINE` |
| **Slack** | 雲端 SaaS | Workspace／Incoming Webhook／Apps | ① Plugin／官方 **Slack MCP** ② 專案內匯流 ③ Slack API 直接呼叫 | `SLACK_*`、Bot token、Webhook（[`security-secrets-policy.md`](security-secrets-policy.md)） | 告警落點见觀測基線；[`mcp/SERVICE_MATRIX.md`](../../../mcp/SERVICE_MATRIX.md) §Notes |
| **Hetzner** | 雲端 IaaS | **Robot／API** 與 **VPS SSH**；主機實作見 phase1 目錄 | ① `ssh`／`hcloud` ② 專有腳本與 runbook ③ 非必要**不**給寬鬆 MCP 寫權 | SSH key、API token；見 [`hetzner-self-host-start-here.md`](hetzner-self-host-start-here.md) 與 vault 慣例 | 各 hetzner runbook |
| **Cloudflare** | 邊緣雲 | Zone、WAF、DNS、Analytics | ① **MCP** `cloudflare-*`（plugin 命名見 inventory）② API ③ 控制台 | API token／OAuth（`CLOUDFLARE_*` 或儀表板產生） | [`CLOUDFLARE_HETZNER_PHASE1.md`](CLOUDFLARE_HETZNER_PHASE1.md) |
| **GitHub** | 雲端 | `github.com` org／repo、Actions | ① **MCP** `github`／`copilot` ② `gh` CLI ③ REST | `GITHUB_TOKEN`、PAT 權限最小化 | `github-actions-trigger-prod-deploy.md` |
| **Sentry** | 雲端專案 | 多專案邊界（`node-api`、n8n、WP…） | ① Plugin **sentry** ② 儀表板 ③ 與 **release/告警** 串 Slack | `SENTRY_DSN_*`（契約见 [`SENTRY_ALERT_POLICY.md`](SENTRY_ALERT_POLICY.md)、`security-secrets-policy`） | 同上、觀測基線 |
| **Netdata** | **Agent 自架** + **可選** Netdata Cloud「Console」 | 主機指標、告警腳本；**非**產品分析 | ① **SSH** 上主機看 agent／`alarm-notify` ② 本機 Cloud UI（若啟用連結）③ **不**佔用 MCP 關鍵路徑名額 | 主機內路徑與 webhook 設定（**不入庫**） | `AWARE_WAVE_OBSERVABILITY_BASELINE`、WORKLOG 實作紀錄 |
| **PostHog** | **雲端**（專案慣例：免自架、省 RAM；見 WORKLOG） | 專案、Insight、**exception capture** | ① Plugin **posthog** ② 官方 API ③ SDK/環境變數 | `NEXT_PUBLIC_POSTHOG_KEY`、host（[`tools-and-integrations.md`](tools-and-integrations.md) 與前端 env） | 觀測基線、本檔能力表 P4 |
| **Resend** | 雲端 Email API | 寄件網域／Template | ① 官方 **resend-mcp**（見 `mcp/SERVICE_MATRIX`）② 直接 REST ③ 經匯流 **AwareWave Ops** | `RESEND_API_KEY`（**不入庫**；僅列名） | `mcp/README.md`、`mcp/SERVICE_MATRIX.md`；寄件 policy 以產品／治理為準 |

**不變量**：

- **編排與核准**仍以 **`MCP_TOOL_ROUTING_SPEC.md`** 為強制語意；本表**不**新增隱性 `task_type`。
- **MCP 綠燈前**的備援，一律依 **[`CURSOR_AGENT_RUNTIME_PLAYBOOK.md`](CURSOR_AGENT_RUNTIME_PLAYBOOK.md)**（SSH／API／CLI…）。

---

## 單一視角（誰負責什麼）
| 順序 | 層級 | 正本檔案（自 `agency-os/` 起算） | 回答問題 |
|---:|---|---|---|
| 1 | 編排路由（**強制**） | `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` | `task_type`、Owner 引擎、env、風險、核准 |
| 2 | 機讀閘道 | `../lobster-factory/workflow-risk-matrix.json` + `../lobster-factory/scripts/validate-workflow-routing-policy.mjs` | CI／bootstrap 是否與 spec 結構一致 |
| 3 | 人讀矩陣 | `../lobster-factory/docs/ROUTING_MATRIX.md` | 一眼對照路由（語意須與 spec 一致） |
| 4 | 工具分工（IDE/MCP 鍵名） | `docs/operations/cursor-mcp-and-plugin-inventory.md` | Cursor `mcpServers` 做什麼；**不**覆寫生產編排 |
| 5 | 編排邊界理由 | `docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md` | 為何 Trigger vs n8n 如此切分 |
| 6 | 平台能力與時機（本檔；**含 §0 總索引**） | `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` | 能力要不要做、自託管、建置順序、證據欄位；一句話＋專文連結見 **§0** |
| 7 | 執行狀態 | `TASKS.md` | 目前完成/未完成與下一步 |

## 平台能力總表（你會用到的能力）
> 說明：`自託管可行性` 是技術可行，不代表現在就應該上；仍以風險、維運成本與商業時機決定。
> 狀態圖例：`🟢 已上線` / `🟡 建置中` / `⚪ 未啟動`。

| 能力/元件 | 目前實際狀態 | 自託管可行性 | 建議時機 | 主要依據 | 完成證據（DoD） |
|---|---|---|---|---|---|
| Supabase（SoR） | 🟢 已上線（Hetzner） | 可（已採自架） | P1（立即） | `docs/operations/supabase-self-hosted-cutover-checklist.md` | migration/連線/權限驗證全通過 |
| WordPress + MariaDB | 🟢 已上線（站台執行） | 可 | P1（立即） | `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`、`../lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md` | staging/prod 可用，回滾可驗證 |
| n8n（staging） | 🟢 已上線（自託管；**staging E2E 已證** 2026-04-10，見 `WORKLOG.md`） | 可 | P2 | `docs/standards/n8n-workflow-architecture.md` | 至少 1 條 staging 流程端到端成功 |
| Trigger.dev（自託管） | 🟢 **已上線**（營運定案 **2026-04-20**：與 **`origin/main`** 及本總表敘述一致為單一真相） | 可 | P2 | `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`；實裝正本：`../lobster-factory/infra/trigger/README.md`；堆疊索引：`hetzner-stack-rollout-index.md`；**CI／deploy**：`github-actions-trigger-prod-deploy.md`；**雙機本機消費**（`TRIGGER_*`、每台 vault）：`../../RESUME_AFTER_REBOOT.md`「下次開機提醒」§4、`../../TASKS.md` 雙機子項 | `WORKLOG.md` **`## 2026-04-16`～`## 2026-04-17`**（儀表板／HTTPS／Redis）；`memory/CONVERSATION_MEMORY.md`（2026-04-16）；`packages/workflows` 與自架 **`triggerUrl`** 對齊；可定期重跑 deploy／健康檢查 |
| Redis | ⚪ 未啟動（Phase A） | 可 | P2 | `docs/operations/hetzner-stack-rollout-index.md` | 服務健康檢查與應用連線成功 |
| Nginx | 🟡 建置中（Phase A） | 可 | P1-P2 | `docs/operations/hetzner-stack-rollout-index.md` | 路由/健康檢查/SSL 正常 |
| Node API | 🟡 建置中（Phase A） | 可 | P1-P2 | `docs/operations/hetzner-stack-rollout-index.md` | 核心 API endpoint 驗證通過 |
| Next.js 控制台 | 🟡 建置中（P7；控制平面 migration 已落地） | 可 | P3 | `docs/operations/NEXTJS_INTERNAL_OPS_CONSOLE_V1.md`、`../lobster-factory/packages/db/migrations/0011_ops_console_control_plane.sql` | 可建立並回顯 1 個測試租戶設定；AI 生圖落 R2 並可於 SoR 追蹤；WP 商品/部落格圖維持 WP 媒體庫 |
| Sentry | 🟢 已上線（Phase1：`next-admin`／`node-api`／`php` + n8n DSN；**2026-04-12** 驗證與告警，見 `agency-os/WORKLOG.md` **`## 2026-04-12`**） | 可（維運較重） | P3 | `docs/operations/tools-and-integrations.md`、`../lobster-factory/infra/hetzner-phase1-core/README.md` | 測試錯誤可上報與告警；手動路由 `../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/sentry-test/route.ts` |
| PostHog | ⚪ 未啟動（列入 P4） | 可 | P3 | `docs/operations/tools-and-integrations.md` | 可看到完整測試 funnel |
| MinIO（S3 相容） | ⚪ 未啟動（Phase B） | 可 | P3（需要時） | `docs/operations/hetzner-stack-rollout-index.md` | 上傳/下載/權限驗證通過 |
| Cloudflare | ⚪ 未啟動（列入 P5） | 以 SaaS 為主 | P2-P3 | `docs/operations/tools-and-integrations.md` | 規則生效且無回歸 |
| Clerk（或替代） | ⚪ 未啟動（列入 P6） | Clerk 為 SaaS；可改自架替代 | P3 | `docs/architecture/decisions/002-clerk-identity-boundary.md` | 角色權限測試通過 |
| GitHub Actions | 🟢 已上線（CI 正在使用） | SaaS（可改自建 CI） | P1-P2 | `docs/operations/github-actions-trigger-prod-deploy.md` | gate 與部署流程驗證通過 |

## 工具建置順序（建議）
> 先穩定核心，再補可觀測，再做控制台；避免先做 UI 但底層未穩定。

| 階段 | 項目 | 目前狀態 | 對應 `TASKS` 關鍵字 |
|---|---|---|---|
| P1 | Secrets 治理升級 | 🟡 基線已文件化（Owner／vault 鍵名對照）；**輪替演練待 WORKLOG 證據** | `（工具建置）Secrets 治理升級`；執行手冊 `secrets-governance-p1-closeout.md` |
| P2 | Hetzner 自託管 n8n（staging） | 🟢 E2E DoD 已證（2026-04-10） | `（工具建置）Hetzner 自託管 n8n（staging）`；E2E 正本 `n8n-staging-client-onboarding-e2e.md` |
| P3 | Sentry 觀測接入 | 🟢 DoD 已證（2026-04-12；`WORKLOG.md`、`TASKS.md`） | `（工具建置）Sentry 觀測接入` |
| P4 | PostHog 事件基線 | ⚪ 未啟動 | `（工具建置）PostHog 事件基線` |
| P5 | Cloudflare 邊界保護 | ⚪ 未啟動 | `（工具建置）Cloudflare 邊界保護` |
| P6 | Clerk 組織與角色（B2B 多租戶） | ⚪ 未啟動 | `（工具建置）Clerk 組織與角色（B2B 多租戶）` |
| P7 | Next.js 控制台 v1（Internal Ops） | ⚪ 未啟動 | `（工具建置）Next.js 控制台 v1（Internal Ops）` |

## 任務到規格追溯（P1-P7）
| `TASKS` 關鍵字 | 主要規格正本 | 路由錨點 | 完成判定（需可觀測） | 證據欄位 |
|---|---|---|---|---|
| `（工具建置）Secrets 治理升級` | `docs/operations/security-secrets-policy.md` | `MCP_TOOL_ROUTING_SPEC.md` Guardrails + Tool Boundaries | 輪替演練完成且無中斷 | `date`, `owner`, `rotated_scopes`, `rollback_note`, `report_path` |
| `（工具建置）Hetzner 自託管 n8n（staging）` | `docs/standards/n8n-workflow-architecture.md` | `webhook_ingress` / `crm_sync` / `notifications` 屬 `n8n` | 至少 1 條 staging 流程端到端成功 | `workflow_run_id`, `environment`, `route`, `artifact_path`, `status` |
| `（工具建置）Sentry 觀測接入` | `docs/operations/tools-and-integrations.md` | 屬於可觀測平面（非控制平面） | 測試錯誤可觸發告警 | `release_tag`, `alert_rule`, `event_id`, `screenshot_path` |
| `（工具建置）PostHog 事件基線` | `docs/operations/tools-and-integrations.md` | 屬於分析平面（非控制平面） | 可見完整測試 funnel | `event_names`, `funnel_id`, `time_window`, `report_path` |
| `（工具建置）Cloudflare 邊界保護` | `docs/operations/tools-and-integrations.md` | 邊界防護能力 | staging 防護生效且無回歸 | `zone`, `rule_ids`, `before_after_result`, `rollback_note` |
| `（工具建置）Clerk 組織與角色` | `docs/architecture/decisions/002-clerk-identity-boundary.md` | 控制平面身分邊界不可破 | 兩個測試角色權限區隔成功 | `org_id`, `role_matrix_ref`, `test_accounts`, `result` |
| `（工具建置）Next.js 控制台 v1` | `docs/operations/NEXTJS_INTERNAL_OPS_CONSOLE_V1.md` | UI 不可繞過既有路由與核准 | 可由 UI 建立 1 筆測試配置 | `tenant_slug`, `department_selection_payload`, `submit_result`, `ui_capture` |

## 執行檢查清單（每完成一項都要做）
- 在 `TASKS.md` 對應項有狀態更新（未完成/完成）。
- 在 `WORKLOG.md` 留下當日證據路徑（至少一條）。
- 若改變路由 Owner 或新增 `task_type`，必須**同一變更集**更新（順序與 `MCP_TOOL_ROUTING_SPEC.md` 文件集一致）：
  1. `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
  2. `../lobster-factory/docs/ROUTING_MATRIX.md`
  3. `../lobster-factory/workflow-risk-matrix.json`
  4. `docs/operations/cursor-mcp-and-plugin-inventory.md`
  5. 本檔與 `TASKS.md`（含可執行任務與 DoD）

## 路由與工具四件套長期治理契約（30+ years）

### A. 一致性不變量（Invariants）
- `MCP_TOOL_ROUTING_SPEC.md` 的 `task_type` 命名是強制語意主鍵。
- `ROUTING_MATRIX.md` 必須沿用同一語意欄位（`task_type`、`risk_level`、`environment`、`approval_required`）。
- `workflow-risk-matrix.json` 必須通過 `validate-workflow-routing-policy.mjs`；與 spec 漂移視為 **gate FAIL**。
- 本檔任何「任務追溯」若指向路由，必須引用上述主鍵，**不得**自創別名或隱含新 `task_type`。

### B. 版本與審核節奏
- 每月：術語/欄位 drift 檢查（Spec vs Matrix vs JSON vs Inventory vs 本檔 vs `TASKS`）。
- 每季：風險分級、核准門檻、rollback 規則校準。
- 每年：淘汰項（deprecated `task_type`／工具）清理，保留遷移對照表。

### C. 變更流程（最小要求）
- 新增或廢止路由語意時，至少同時更新上節清單 **1–5**；若只改 IDE 說明、不碰 `task_type`，可限於 **inventory**（並在 PR 註明「無 routing 語意變更」）。
- 未完成 **1–3** 與驗證腳本綠燈前，不得標示路由相關項為「已完成」。

## 證據儲存慣例
- 報告：`agency-os/reports/`
- 執行追蹤：`lobster-factory` workflow artifacts + `workflow_run_id`
- 決策紀錄：`agency-os/WORKLOG.md`

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- `docs/operations/security-secrets-policy.md`
- `docs/operations/tools-and-integrations.md`
- `TASKS.md`
- `WORKLOG.md`

_Last synced: 2026-04-28 09:39:47 UTC_

