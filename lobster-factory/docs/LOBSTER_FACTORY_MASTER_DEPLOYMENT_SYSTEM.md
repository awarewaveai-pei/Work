# `LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM`

副標：**Cloud-first 一鍵生成 Client OS / Agency OS / Factory OS / Observability OS / Decision Engine 完整部署藍圖**

版本：`v1.3`
定位：**單一真相來源 Single Source of Truth**
目標：**可部署、可擴充、可刪減、可替換工具、可長期維護 30 年**

> **Repo 路徑：** `lobster-factory/docs/LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM.md`（連結與 `LOBSTER_FACTORY_DEPLOYMENT_CHECKLIST.md` 標頭「對齊主文件」一致；勿另存 `_v1.3.md` 複製檔以免分叉）。

> **v1.1 修訂說明：** 修正全文 Markdown 逃脫字符、Phase 編號對齊、補全資料模型缺漏表、wp-basic manifest 範例、handoff report 結構、Decision Engine 評分邏輯、SLA 等級定義。

> **v1.2 修訂說明：** 修正 4 個架構矛盾；新增 12 個長期營運制度章節（Canonical Naming / Environment Release / Backup & DR / Idempotency & Locking / Plugin Governance / Domain & DNS & Email / Testing Strategy / Client Data Lifecycle / Cost & Profitability / Client Communication Policy / ADR）。

> **v1.3 修訂說明：** 新增 Section 41「三種部署 Profile」—— AO-agent（自架控制平面）/ Profile B（新客戶全雲端）/ Profile C（已有 WordPress 接管）。新增 `adopt_delta` manifest 模式、`adopt-client-os` workflow、`adopt_audits` / `adopt_audit_items` DB 表、`site_type` / `apply_mode` 欄位（migration 0016）、Adopt Smoke Test Profile、ProviderAdapter adopt 方法擴充。

---

# **0. 最重要的定案**

你要做的不是：

- 一鍵架 VPS
- 一鍵裝 WordPress
- 一鍵裝外掛
- 一鍵自架所有客戶網站

你要做的是：

**一鍵生成雲端版 Client OS**

也就是：

客戶使用雲端主機 / Managed WordPress / SaaS
你的系統負責：

- 建立客戶
- 建立專案
- 建立網站
- 選擇 package
- 套用 WordPress / CRM / SEO / Email / Monitoring 組合
- 接入 MainWP
- 接入 Supabase Registry
- 接入 Sentry / PostHog / Uptime monitoring
- 產生交付報告
- 進入維護、監控、報告、升級、決策流程

這跟你原本文件定義一致：Lobster Factory 不是一般接案公司或建站公司，而是「可以複製整間公司結構的系統工廠」，能幫每個客戶從網站、CRM、客服、數據、財務、法務、營運到決策建立完整作業系統。

---

# **1. 30 年穩定的真正定義**

先講清楚：
**沒有任何單一工具可以保證 30 年不變。**

30 年穩定不是靠：

- 永遠用同一個 SaaS
- 永遠用同一個主機商
- 永遠用同一個 AI 模型
- 永遠用同一個 WordPress 外掛

30 年穩定靠的是：

1. 資料模型穩定
2. 業務邊界穩定
3. workflow 記錄穩定
4. 權限與審批穩定
5. 工具全部可替換
6. package / manifest 版本化
7. 每個動作可觀測
8. 每個高風險動作可回滾
9. 每個模組可新增、停用、替換
10. 所有客戶資料可匯出、可遷移

所以這套系統的核心原則是：

> 工具可換，資料不可亂。
> 流程可升級，審計不可斷。
> 模組可刪減，核心物件不可變。
> 自動化可增加，production 風險不可失控。

---

# **2. 單一總架構**

```
Lobster Factory
│
├── Agency OS
│   └── 你自己的公司營運系統
│
├── Factory OS
│   └── 一鍵生成客戶系統的生產線
│
├── Client OS
│   └── 每個客戶收到的一套雲端營運系統
│
├── Ops / Observability OS
│   └── 監控、事故、AI 修復、Runbook、Status、PR
│
├── Data OS
│   └── Supabase / Postgres 作為主資料與系統記憶
│
├── Decision Engine
│   └── 根據數據做建議、升級、停用、優化
│
└── Governance Layer
    └── 權限、審批、風險、稽核、rollback、secrets
```

你的文件原本已經定義 Agency OS、Client OS、Factory OS、CX OS、Decision Engine 是完整系統範圍，而且 Client OS 由 Factory 生成，包含 Website / Store、CRM、Marketing Tracking、CX Layer、Commerce、Brand Kit、Content System、Data Sync。

---

# **3. 不再矛盾的最終工具定位**

這裡直接定案，避免東一塊西一塊。

| 工具 / 層 | 最終定位 | 是否核心 | 是否可替換 |
| ----- | ----- | ----- | ----- |
| Supabase / Postgres | Factory Registry / Data Plane / 主資料庫 | 必須 | 可遷移到 Postgres 相容平台 |
| WordPress | 客戶網站與 Client OS 前台 | 必須 | 可擴充 Shopify/Webflow/Framer adapter |
| Kadence | 預設 WordPress theme family | 預設 | 可替換 |
| WooCommerce | 電商 package 核心 | 必須於電商案 | 可替換 Shopify adapter |
| FluentCRM | WordPress CRM / email automation | 預設 | 可替換 HubSpot/Brevo |
| Fluent Forms | 表單與 lead capture | 預設 | 可替換 |
| Rank Math | SEO 基礎 | 預設 | 可替換 |
| FluentSMTP | SMTP 設定 | 預設 | 可替換 |
| Google Site Kit / GA4 | 客戶網站流量追蹤 | 建議 | 可替換 |
| MainWP | WordPress 集中維護 console | 建議核心 | 可替換 ManageWP / WP Umbrella |
| n8n | 輕量 webhook / 通知 / sync | 核心 | 可替換 Make / Zapier / 自寫 queue |
| Trigger.dev / Inngest / Temporal | Durable workflow / 長流程 | 核心 | 三選一，可替換 |
| Sentry | Error / incident context | 核心 | 可替換 Datadog / Axiom / Honeybadger |
| PostHog | Analytics / feature flag / funnel | 核心 | 可替換 Amplitude / Mixpanel |
| Uptime Kuma | Uptime / SSL / endpoint monitor | 建議 | 可替換 Better Stack / UptimeRobot |
| Netdata | Server / VPS / container metrics | 有自管 server 才必須 | 可替換 Grafana Agent / Datadog |
| Cloudflare | DNS / WAF / Access / edge protection | 建議核心 | 可替換，但不建議早期換 |
| GitHub | repo / CI / PR / versioning | 必須 | 可替換 GitLab |
| Secrets Manager | 金鑰治理 | 必須 | 1Password / Doppler / Infisical / Vault |

重點：

> 核心不是某個工具。
> 核心是資料、workflow、manifest、policy、run、incident、approval。

---

# **4. 最終部署型態：Cloud-first，不預設自架**

## **4.1 預設客戶部署**

```
Client Delivery Cloud
│
├── Hostinger / DreamHost / Namecheap / SiteGround
│   └── WordPress + MainWP Child + selected package
│
├── Cloudways
│   └── WordPress + MainWP Child + staging if available
│
├── Managed WordPress Provider
│   └── WordPress + MainWP Child
│
├── Shopify / Webflow / Framer (future adapter)
│   └── 非 WP 客戶系統
│
└── SaaS tools
    └── CRM / email / scheduling / analytics / payment
```

## **4.2 你的控制系統部署**

```
Lobster Factory Control Plane
│
├── Supabase Cloud
│   └── Factory Registry
│
├── GitHub
│   └── repo / migrations / manifests / workflows
│
├── Trigger.dev Cloud
│   └── durable provisioning / maintenance / repair
│
├── n8n Cloud 或 managed n8n
│   └── webhook / notification / reports / sync
│
├── Sentry Cloud
│   └── errors / traces / workflow failures
│
├── PostHog Cloud
│   └── analytics / feature flags / funnel
│
├── Uptime Monitoring
│   ├── Uptime Kuma if self-hosting allowed
│   └── Better Stack / UptimeRobot / StatusCake if pure SaaS
│
├── MainWP Dashboard
│   └── 可以放 managed WordPress / Cloudways / 獨立安全環境
│   └── ⚠️ MainWP Dashboard 絕對不能部署在客戶自有的 hosting 帳號內
│
└── Cloudflare
    └── DNS / WAF / Access / internal protection
```

## **4.3 Netdata 的最終規則**

如果你完全 SaaS：
- Netdata 不必放 MVP

如果你自管任何一台機器（MainWP VPS / n8n VPS / Uptime Kuma VPS / internal API / worker server / Hetzner / DigitalOcean / Vultr）：
- Netdata 必須上

---

# **5. 系統核心物件：永遠不要亂改**

這些是 30 年穩定的骨架。

```
organization
workspace
client
project
site
environment
package
manifest
workflow
workflow_run
agent
agent_run
approval
incident
monitor
smoke_test
handoff_report
maintenance_policy
maintenance_run
cost_entry
metric_snapshot
decision
recommendation
audit_log
```

你的 Master Spec 第 3 部分已經把資料域分成 6 層：Identity & Tenancy、Business & Delivery、Operations & Automation、Growth & Revenue、Knowledge & Artifacts、Decision & Learning。

---

# **6. 模組化總設計：可擴充、可刪減**

## **6.1 永遠保留的核心模組**

這些不能刪，否則系統會散掉。

```
Core Platform
├── Identity & Tenancy
├── Factory Registry
├── Package / Manifest Registry
├── Workflow Registry
├── Workflow Runs
├── Approval / Policy Engine
├── Incident System
├── Observability Ingestion
├── Audit Logs
└── Handoff / Reports
```

## **6.2 可插拔模組**

這些可以依客戶、產業、預算開關。

```
Optional Business Modules
├── Sales OS
├── Marketing OS
├── CX OS
├── Commerce OS
├── Content OS
├── Finance OS
├── Legal OS
├── Media OS
├── HR OS
├── Partner OS
├── Compliance OS
├── Supply Chain OS
├── Merchandising OS
└── Advanced Decision Engine
```

## **6.3 開關方式**

每個模組都要有：

```json
{
  "module": "cx-os",
  "status": "enabled",
  "scope_type": "client",
  "scope_id": "client_uuid",
  "version": "1.0.0",
  "dependencies": ["client", "site", "workflow_runs"],
  "can_disable": true,
  "disable_policy": {
    "preserve_data": true,
    "stop_workflows": true,
    "hide_ui": true
  }
}
```

---

# **7. 三大 OS 的最終邊界**

## **7.1 Agency OS：你自己的公司系統**

負責：

- leads
- deals
- proposals
- clients
- projects
- invoices
- subscriptions
- costs
- maintenance plans
- reports
- internal tasks
- approval
- incidents
- decision records
- profitability

Agency OS 不直接等於客戶網站。
它是你公司的控制中心。

---

## **7.2 Factory OS：生產線**

負責：

- package registry
- manifest registry
- provider adapters
- site provisioning
- WordPress install
- plugin install
- MainWP connection
- monitoring setup
- smoke tests
- handoff report
- maintenance workflow
- rollback workflow

Factory OS 是你真正的「一鍵生成」核心。

---

## **7.3 Client OS：交付給客戶的系統**

每個客戶一份。

```
Client OS
├── Website / Store
├── CRM
├── Forms
├── Email automation
├── SEO setup
├── Analytics tracking
├── Monitoring
├── Support / FAQ / Knowledge
├── Reports
└── Maintenance plan
```

---

# **8. 一鍵生成流程：唯一標準版**

```
Client intake
↓
建立 organization / workspace / client
↓
建立 project
↓
建立 site
↓
選擇 package
↓
選擇 provider adapter
↓
建立或接入 WordPress / SaaS
↓
套用 manifest
↓
安裝 MainWP Child
↓
連回 MainWP Dashboard
↓
設定 SEO / form / CRM / SMTP / tracking
↓
設定 monitoring
↓
跑 smoke tests
↓
寫入 workflow_run
↓
產生 handoff report
↓
送出 client onboarding
↓
進入 maintenance policy
↓
持續監控
↓
incident / decision / upsell loop
```

## **8.1 Handoff Report 結構**

每次完成部署必須產生結構化 `handoff_report`，欄位如下：

```json
{
  "report_id": "uuid",
  "client_id": "uuid",
  "project_id": "uuid",
  "site_id": "uuid",
  "workflow_run_id": "uuid",
  "generated_at": "ISO timestamp",
  "package": "wp-basic@1.0.0",
  "provider": "hostinger",
  "site_url": "https://example.com",
  "admin_url": "https://example.com/wp-admin",
  "plugins_installed": ["kadence", "rank-math", "fluent-forms", "fluent-smtp", "mainwp-child"],
  "monitoring": {
    "uptime_check": true,
    "ssl_check": true,
    "endpoint": "https://example.com"
  },
  "smoke_tests": {
    "homepage": "passed",
    "wp_admin": "passed",
    "ssl_valid": "passed",
    "contact_form": "passed"
  },
  "mainwp_connected": true,
  "mainwp_site_id": "mainwp_123",
  "maintenance_plan": "basic-monthly",
  "next_maintenance": "ISO timestamp",
  "notes": "",
  "status": "delivered"
}
```

---

# **9. Package 系統：所有客戶系統都從 package 生成**

## **9.1 Package 分層**

```
packages/
├── wp-basic
├── wp-business
├── wc-core
├── client-os-basic
├── client-os-commerce
├── client-os-content
├── client-os-cx
└── custom-enterprise
```

## **9.2 `wp-basic`**

適合：
- 形象網站
- 個人品牌
- 顧問
- 小公司官網
- Landing Page

包含：
- WordPress
- Kadence
- Kadence Blocks
- Rank Math
- Fluent Forms
- FluentSMTP
- MainWP Child
- homepage monitor
- SSL monitor
- basic handoff report

**wp-basic manifest 範例（`manifests/wp-basic@1.0.0.json`）：**

```json
{
  "name": "wp-basic",
  "version": "1.0.0",
  "target": "wordpress",
  "risk_level": "low",
  "theme": {
    "slug": "kadence",
    "version": ">=3.0.0"
  },
  "plugins": [
    { "slug": "kadence-blocks", "required": true },
    { "slug": "seo-by-rank-math", "required": true },
    { "slug": "fluentform", "required": true },
    { "slug": "fluent-smtp", "required": true },
    { "slug": "mainwp-child", "required": true }
  ],
  "conditional_plugins": [
    { "slug": "litespeed-cache", "condition": "provider == 'litespeed'" }
  ],
  "post_install": [
    "configure_fluent_smtp_via_env",
    "create_contact_form",
    "configure_rank_math_defaults",
    "set_permalink_structure"
  ],
  "verification": {
    "profile": "basic",
    "checks": ["homepage", "wp_admin", "ssl", "contact_form"]
  },
  "rollback": {
    "strategy": "restore_backup",
    "backup_required_before_apply": true
  },
  "approval_required_for": [],
  "deprecated": false
}
```

## **9.3 `wp-business`**

適合：
- 正式公司網站
- lead generation
- SEO 內容站

包含：
- wp-basic（繼承）
- Google Site Kit
- lead form
- sitemap
- monthly report
- business maintenance policy

## **9.4 `wc-core`**

適合：
- WooCommerce
- 小型電商
- 會員 / 課程 / 商品銷售

包含：
- WordPress
- Kadence
- WooCommerce
- CartFlows
- FluentCRM
- Fluent Forms
- Rank Math
- FluentSMTP
- Google Site Kit
- LiteSpeed Cache conditional
- checkout smoke test
- order email check
- approval policy

這跟你原先 `wc-core` 的定義一致：Kadence、WooCommerce、CartFlows、Rank Math、FluentCRM、FluentSMTP、Google Site Kit、LiteSpeed conditional、smoke tests、rollback。

**wc-core smoke test profile：**

```json
{
  "profile": "woocommerce",
  "checks": [
    "homepage",
    "wp_admin",
    "ssl",
    "shop_page",
    "product_page",
    "cart_page",
    "checkout_page",
    "order_email_template",
    "crm_webhook_active"
  ],
  "advisory_checks": [
    "payment_gateway_status"
  ]
}
```

> **注意：** `payment_gateway_configured` 不列為必過項目。Payment gateway 需要客戶金融帳戶資料與 approval，不應讓初始 wc-core install 因此失敗。改用 advisory 狀態：
>
> ```
> payment_gateway_status = not_configured | pending_approval | configured | failed
> ```
>
> smoke test 結果範例：
> ```json
> { "checkout_page": "passed", "payment_gateway_status": "pending_approval" }
> ```

---

# **10. Provider Adapter：解決工具替換與雲端差異**

所有主機商、SaaS、平台都不能直接寫死。

```
provider-adapters/
├── wordpress-generic
├── hostinger
├── dreamhost
├── namecheap
├── siteground
├── cloudways
├── shopify-future
├── webflow-future
├── framer-future
└── manual-task
```

## **統一介面**

```typescript
export interface ProviderAdapter {
  provider: string;

  supportsAutoProvisioning(): Promise<boolean>;

  createOrRegisterSite(input: {
    organizationId: string;
    workspaceId: string;
    clientId: string;
    projectId: string;
    siteId: string;
    domain: string;
    packageName: string;
  }): Promise<{
    status: "created" | "registered" | "manual_required" | "failed";
    siteUrl?: string;
    adminUrl?: string;
    taskId?: string;
    message?: string;
  }>;

  applyManifest(input: {
    siteId: string;
    manifestVersionId: string;
  }): Promise<{
    status: "success" | "partial" | "failed";
    logs: string[];
  }>;

  runVerification(input: {
    siteId: string;
    verificationProfile: "basic" | "business" | "woocommerce";
  }): Promise<{
    passed: boolean;
    results: Record<string, unknown>;
  }>;
}
```

原則：

- 能自動就自動。
- 不能自動就產生 `operator_task`。
- 不可因主機商 API 限制讓整個系統失敗。

---

# **11. Workflow Routing：不可混亂**

| 類型 | 使用工具 | 原則 |
| ----- | ----- | ----- |
| 表單進件 | n8n | 輕量 webhook |
| 通知 | n8n | Slack / Email / LINE |
| 報告寄送 | n8n | 低風險 |
| CRM sync | n8n | 低至中風險 |
| 建站流程 | Trigger.dev / durable | 長流程、可重試 |
| 套用 manifest | Trigger.dev / durable | 必須記錄 run |
| WooCommerce staging test | Trigger.dev / durable | 高風險 |
| incident repair | Trigger.dev + agent | 需 policy |
| CI/CD | GitHub Actions | repo 驗證 |
| AI 修復 | MCP / Cursor agent | 只可 staging / PR |
| production deploy | Approval + workflow | 不可直接自動 |

你的文件原本就定義 workflow 要有 `workflows`、`workflow_versions`、`workflow_runs`，而且 `orchestrator_type` 要區分 `n8n`、`durable`、`github_actions`、`mcp`、`manual`。

---

# **12. Run 是系統最小工作單位**

所有工作都必須是 Run。

- workflow run
- agent run
- deployment run
- maintenance run
- report run
- repair run
- content generation run
- SEO refresh run
- handoff run

每個 Run 必須記錄：

```
run_id
organization_id
workspace_id
client_id
project_id
site_id
environment_id
actor_type
trigger_type
input_snapshot
output_snapshot
artifacts
tool_versions
status
started_at
ended_at
cost
approval_id
incident_id
decision_id
rollback_ref
```

你的 Master Spec 已經明確說，公司工作單位不是專案，而是 Run；沒有 Run 就無法審計、回溯、計成本、分析 ROI、自動學習、失敗補救與比較版本成效。

---

# **13. Observability OS：完整監控與修復閉環**

這一層不是「網站有沒有掛」而已。
它是 AI 公司能不能穩定跑的核心。

```
Detect
→ Normalize
→ Enrich Context
→ Classify
→ Dispatch AI
→ Plan Remediation
→ Approval
→ Execute
→ Verify
→ Notify
→ Learn
```

## **13.1 觀測來源**

**Sentry**
- app error
- API error
- worker error
- workflow failure
- release regression

**Uptime monitoring**
- homepage down
- SSL issue
- wp-admin inaccessible
- checkout unavailable

**PostHog**
- funnel drop
- feature impact
- client portal usage
- report open rate

**Netdata（僅限自管基礎設施）**
- server CPU
- RAM
- disk
- container
- network
- database pressure

> **重要：** Netdata 只在你自管至少一台機器時才需要實作 connector。MVP 純 SaaS 模式時，Cursor **不需要** 實作 Netdata ingestion。

**MainWP**
- WP core update
- plugin update
- theme update
- site health

**Trigger.dev**
- workflow duration
- failed runs
- retries
- stuck jobs

**n8n**
- webhook failure
- sync failure
- notification failure

## **13.2 Incident state machine**

```
detected
→ triaged
→ investigating
→ waiting_approval
→ remediating
→ verifying
→ resolved
→ postmortem
→ closed
```

## **13.3 Severity**

**low**
- minor visual issue
- non-critical warning

**medium**
- form issue
- sitemap issue
- admin warning
- report failure

**high**
- homepage down
- lead form broken
- CRM sync failed
- workflow provisioning failed

**critical**
- checkout broken
- payment broken
- malware
- data leak
- production admin inaccessible

---

# **14. Governance：永遠防止系統失控**

## **14.1 風險級別**

**low**
- generate report
- run smoke test
- sync MainWP status
- register monitor

**medium**
- install basic plugin
- update non-commerce plugin
- configure form
- configure SEO

**high**
- WooCommerce update
- checkout change
- payment plugin update
- production DNS change
- SMTP provider change
- bulk email launch

**critical**
- destructive DB migration
- delete site
- change payment gateway
- delete customer data
- legal final publish
- tax final submission

## **14.2 Approval 規則**

| 風險級別 | 規則 |
| ----- | ----- |
| low | auto allowed + log |
| medium | backup check + log |
| high | approval required + backup + staging if possible + rollback plan |
| critical | manual only + audit trail + explicit irreversible declaration if no rollback |

## **14.3 Agent 權限**

**site-builder-agent**
- can create staging
- can apply manifest
- cannot production launch without approval

**repair-agent**
- can read logs
- can create diagnosis
- can open PR
- can repair staging
- cannot deploy production
- cannot read raw secrets
- cannot run destructive DB migration

**content-agent**
- can draft
- can suggest
- cannot publish high-risk content without policy

**support-agent**
- can answer FAQ
- must escalate legal / medical / refund / threat / high-value churn

**seo-agent**
- can draft SEO changes
- bulk production SEO changes require approval

---

# **15. Data OS：資料模型總表**

## **15.1 Identity & Tenancy**

```
organizations
workspaces
profiles
organization_memberships
workspace_memberships
roles
permissions
role_permissions
user_role_assignments
service_accounts
api_keys
secret_references
```

## **15.2 Business & Delivery**

```
clients
projects
sites
site_environments
domains
hosting_accounts
packages
package_versions
manifests
manifest_versions
deployments
launch_checklists
handoff_reports
```

## **15.3 WordPress / Client OS**

```
wp_sites
wp_plugins
wp_themes
wp_stack_profiles
mainwp_connections
crm_configs
form_configs
smtp_configs
seo_configs
tracking_configs
```

## **15.4 Operations & Automation**

```
workflows
workflow_versions
workflow_runs
scheduled_jobs
operator_tasks
approval_policies       ← 定義哪些操作需要審批、由誰審批
approval_requests       ← 實際審批記錄（status: pending / approved / rejected）
maintenance_policies
maintenance_runs
backup_checks
smoke_test_results
rollback_records
```

> **補充說明：**
> `approval_policies` 定義規則（e.g. 所有 high risk 動作需要 senior 審批）。
> `approval_requests` 是每次實際觸發審批的記錄，關聯到 `workflow_run_id`、`actor_id`、`approver_id`、`status`、`decided_at`。

## **15.5 Observability & Incident**

```
service_registry
monitoring_checks
alert_rules
incident_events
incidents
evidence_snapshots
deployment_metadata
remediation_actions
runbooks
status_page_events
notifications
```

## **15.6 Agents & AI**

```
agents
agent_versions
tool_policies
agent_runs
prompt_templates
prompt_versions
llm_traces
evaluation_runs
ai_dispatch_runs
```

## **15.7 Growth & Revenue**

```
leads
contacts
accounts
deals
proposals
subscriptions
invoices
payments
expenses
cost_entries
revenue_entries
experiments
```

## **15.8 Knowledge & Artifacts**

```
knowledge_bases
knowledge_chunks
documents
assets
templates
playbooks
reports
videos
media_jobs
```

## **15.9 Decision & Learning**

```
metric_snapshots
client_scores
evaluations
decision_records
recommendations
rollout_states
change_history
feedback_loops
profitability_snapshots
```

---

# **16. Repo 結構：單一標準**

```
lobster-factory/
├── apps/
│   ├── admin/              # 內部管理台
│   ├── portal/             # 客戶 portal
│   ├── api/                # API
│   └── worker/             # background workers
│
├── packages/
│   ├── db/                 # migrations, schema, RLS
│   ├── shared/             # types, zod, constants
│   ├── workflows/          # Trigger.dev / durable workflows
│   ├── n8n/                # n8n workflow specs / exports
│   ├── agents/             # agent configs / policies
│   ├── manifests/          # wp-basic / wc-core / client-os
│   ├── provider-adapters/  # hostinger / cloudways / generic / manual
│   ├── policies/           # approval / tool / rollout / risk
│   ├── observability/      # Sentry / Uptime / Netdata / PostHog ingestion
│   ├── monitoring/         # monitors, alert routing
│   ├── reports/            # handoff / maintenance / monthly reports
│   ├── billing/            # invoices / subscriptions / costs
│   ├── cx/                 # tickets / SLA / support
│   ├── analytics/          # metrics / dashboards
│   ├── knowledge/          # RAG / docs / runbooks
│   └── decision-engine/    # scores / recommendations
│
├── templates/
│   ├── wordpress/
│   ├── emails/
│   ├── reports/
│   ├── proposals/
│   └── runbooks/
│
├── infra/
│   ├── github/
│   ├── trigger/
│   ├── cloudflare/
│   └── supabase/
│
├── docs/
│   ├── MASTER_SYSTEM.md
│   ├── DEPLOYMENT_PLAN.md
│   ├── DATA_MODEL.md
│   ├── WORKFLOW_ROUTING.md
│   ├── APPROVAL_POLICY.md
│   ├── OBSERVABILITY_OS.md
│   ├── CLIENT_OS_PACKAGES.md
│   ├── RUNBOOKS.md
│   └── CHANGELOG.md
│
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

# **17. Deployment Plan：真正部署順序**

> **Phase 編號與 Section 24 Cursor Prompt 完全對齊。**

## **Phase 0：統一規格，不再分散**

產出：

```
docs/MASTER_SYSTEM.md
docs/DATA_MODEL.md
docs/WORKFLOW_ROUTING.md
docs/APPROVAL_POLICY.md
docs/OBSERVABILITY_OS.md
docs/CLIENT_OS_PACKAGES.md
```

驗收：

- 所有後續開發只引用這幾份文件。
- 舊的零散文件只當參考，不再當部署依據。

---

## **Phase 1：資料地基**

建立 Supabase staging / production。

先建：

```
organizations
workspaces
profiles
memberships
roles
permissions
clients
projects
sites
site_environments
packages
manifests
workflow_runs
operator_tasks
approval_policies
approval_requests
incidents
audit_logs
```

驗收：

- 可以建立 agency org
- 可以建立 client org
- 可以建立 workspace
- 可以建立 client
- 可以建立 project
- 可以建立 site
- 可以記錄 workflow_run
- 可以擋 high-risk approval

---

## **Phase 2：Package / Manifest 系統**

建立：

```
wp-basic
wp-business
wc-core
client-os-basic
```

每個 manifest 必須有：

```
name
version
target
risk_level
theme
plugins
conditional_plugins
post_install
verification
rollback
approval_required_for
```

驗收：

- workflow 可以讀取 manifest
- manifest 可以版本化
- 舊版本不可被覆蓋，只能 deprecate

---

## **Phase 3：Provider Adapter**

先做：

```
generic-wordpress-adapter
manual-task-adapter
```

再慢慢加：

```
hostinger
siteground
cloudways
shopify-future
webflow-future
```

驗收：

- API 可用就自動
- API 不可用就產生 operator_task
- workflow 不會因 provider 限制而失敗

---

## **Phase 4：One-click Client OS Workflow**

建立 durable workflow：

```
provision_client_os
apply_manifest
install_mainwp_child
connect_mainwp
register_monitoring
run_smoke_tests
generate_handoff_report
```

驗收：

- 輸入 client + package + provider
- 可以建立完整 site record
- 可以 fallback manual task
- 可以產生 handoff report
- 可以記錄 workflow_run

---

## **Phase 5：n8n 輕量自動化**

建立 n8n workflows：

```
client_onboarding_notification
handoff_report_email
monthly_report_send
crm_lead_sync
mainwp_status_sync
uptime_alert_notify
workflow_failure_notify
```

驗收：

- 新客戶建立後自動觸發 onboarding 通知
- handoff report 完成後自動發送
- Uptime 告警自動通知 Slack / Email
- workflow 失敗自動通知
- n8n 工作流程全部有記錄，不會靜悄悄失敗

---

## **Phase 6：MainWP 維護層**

建立：

```
MainWP Dashboard
MainWP Child installation SOP
mainwp_connections table
maintenance_policies
maintenance_runs
```

驗收：

- 測試站能接入 MainWP
- MainWP site id 能寫回 Supabase
- 可以產生維護紀錄

---

## **Phase 7：Observability OS**

建立 ingestion：

```
Sentry webhook
Uptime webhook
PostHog events
MainWP status sync
Trigger.dev failed run
n8n failed run
Netdata alert (optional)
```

建立：

```
service_registry
alert_rules
incident_events
incidents
evidence_snapshots
remediation_actions
runbooks
notifications
```

驗收：

- Sentry error 可以建立 incident
- Uptime failure 可以建立 incident
- workflow failure 可以建立 incident
- critical incident 可以通知
- incident 可以產生 runbook

---

## **Phase 8：Approval / Governance**

建立：

```
approval_policies      ← 規則定義
approval_requests      ← 每次實際審批記錄
risk_rules
tool_policies
rollout_policy
rollback_policy
```

驗收：

- production deploy 無 approval 不能跑
- WooCommerce checkout change 無 approval 不能跑
- destructive DB migration 永遠 manual only
- agent 不能讀 raw secrets
- agent 不能直接 production deploy

---

## **Phase 9：Client Portal / Admin**

Admin 先做：

```
clients
projects
sites
packages
workflow_runs
incidents
approvals
maintenance_runs
reports
```

Client Portal 後做：

```
handoff report
maintenance report
support ticket
site status
invoice
knowledge base
```

---

## **Phase 10：Decision Engine 初版**

先做規則型，不要一開始就全 AI。

```
client health score
site risk score
maintenance cost score
incident frequency score
upsell score
churn risk score
hosting upgrade recommendation
```

驗收：

- 能判斷哪個客戶維護成本過高
- 能判斷哪個客戶應升級方案
- 能判斷哪個站事故太多
- 能產生 recommendation
- 但不能自動執行高風險動作

---

# **18. 可刪減設計**

你要能刪模組，不破壞系統。

## **可以停用的**

- Media OS
- HR OS
- Supply Chain OS
- Advanced Legal OS
- Advanced Finance OS
- Langfuse
- Netdata
- Shopify adapter
- Webflow adapter
- advanced AI dispatch

## **不能刪的**

- organizations
- workspaces
- clients
- projects
- sites
- workflow_runs
- approval_policies
- approval_requests
- incidents
- audit_logs
- packages
- manifests

## **停用模組規則**

1. 不刪資料，只 archive
2. 不刪 migrations，只 deprecate
3. 不刪 workflow history
4. 不刪 audit logs
5. UI 可隱藏
6. workflow 可停用
7. package 可 deprecate
8. agent 可 disable

---

# **19. 版本與淘汰政策**

## **19.1 所有東西都要 version**

```
package version
manifest version
workflow version
agent version
prompt version
policy version
template version
report version
schema migration version
```

## **19.2 不允許直接覆蓋**

❌ 錯誤：
```
wc-core.json 直接改掉
```

✅ 正確：
```
wc-core@1.0.0
wc-core@1.1.0
wc-core@2.0.0
```

舊站繼續記錄它當初用哪個版本。

## **19.3 CHANGELOG 格式（`docs/CHANGELOG.md`）**

每次重大變更必須記錄：

```markdown
## [v1.1.0] - 2025-06-01

### Added
- wp-basic manifest JSON example
- approval_policies / approval_requests tables

### Changed
- Phase numbering aligned between Section 17 and Section 24

### Deprecated
- None

### Removed
- None

### Fixed
- ProviderAdapter TypeScript interface escape characters
```

---

# **20. Maintenance Plan：SLA 等級定義**

每個客戶的 `maintenance_policy` 必須明確定義 SLA。

| 方案 | 更新頻率 | 報告頻率 | 事故回應時間 | 備份頻率 | 備注 |
| ----- | ----- | ----- | ----- | ----- | ----- |
| `basic-monthly` | 每月一次 | 每月報告 | 48 小時內 | 每日自動 | 適合 wp-basic |
| `standard-biweekly` | 每兩週一次 | 每月報告 | 24 小時內 | 每日自動 | 適合 wp-business |
| `pro-weekly` | 每週一次 | 每週報告 | 8 小時內 | 每日 + 每週全站備份 | 適合 wc-core |
| `enterprise-custom` | 按需 | 客製 | 2 小時內 | 客製 | 大型電商 / 高流量站 |

`maintenance_policy` 物件結構：

```json
{
  "policy_id": "uuid",
  "client_id": "uuid",
  "site_id": "uuid",
  "tier": "standard-biweekly",
  "update_schedule": "biweekly",
  "report_schedule": "monthly",
  "sla_response_hours": 24,
  "backup_strategy": "daily-auto",
  "active": true,
  "next_run_at": "ISO timestamp"
}
```

---

# **21. 備份、匯出、遷移**

30 年系統一定要能離開任何工具。

## **必做**

- Supabase daily backup
- monthly full export
- schema migration committed to GitHub
- manifest committed to GitHub
- workflow source committed to GitHub
- report artifacts stored
- client data export
- incident export
- audit log retention

## **可遷移原則**

- Supabase → any Postgres
- Trigger.dev → Temporal / Inngest / custom worker
- n8n → Make / custom workflow
- Sentry → Datadog / Axiom
- PostHog → Amplitude / Mixpanel
- MainWP → ManageWP / WP Umbrella
- Uptime Kuma → Better Stack / UptimeRobot

---

# **22. Security Baseline**

## **22.1 Secrets**

禁止 secrets 出現在：
- logs
- AI context
- handoff report
- screenshots
- webhook payload dumps
- PostHog events

## **22.2 Access**

- 2FA required
- least privilege
- service accounts separated
- production keys separated
- staging/prod separated
- client data isolated
- Cloudflare Access for internal tools

## **22.3 RLS**

MVP 可以先保守，但 production 必須有 RLS。

所有 tenant-bound tables：
- `organization_id` required
- `workspace_id` where applicable
- RLS enabled
- service role only in backend

你的文件也明確要求所有表都要啟用 RLS，並示範 tenant isolation policy。

---

# **23. 最小可賣版本 MVP**

不要一開始做滿 20 個 OS。
但骨架要完整。

## **MVP 必須有**

- Supabase Registry
- wp-basic package
- wp-business package
- wc-core package
- manual provider adapter
- generic WordPress adapter
- provision_client_os workflow
- n8n onboarding notifications
- MainWP connection
- Sentry integration
- PostHog events
- Uptime monitoring
- smoke tests
- handoff report
- approval policy
- incident table
- workflow_runs

## **MVP 不必有**

- 完整 HR OS
- 完整 Legal OS
- 完整 Supply Chain OS
- 完整 Media OS
- 完整 AI video pipeline
- 完整跨國稅務
- 完整 autonomous Decision Engine

---

# **24. 第一個客戶部署策略**

第一個客戶不要用 WooCommerce。

**Client type：**
- 個人品牌
- 顧問
- 小公司官網
- 藝術治療網站
- 作品集

**Package：**
- wp-basic

**Provider：**
- Hostinger / SiteGround / Cloudways / generic WordPress

**驗證：**
- client created
- project created
- site created
- package selected
- WordPress connected
- MainWP connected
- monitoring enabled
- smoke test passed
- handoff report generated
- maintenance plan active

第二個做 `wp-business`。
第三個再做 `wc-core`。

---

# **25. Decision Engine：評分邏輯**

## **25.1 評分維度**

Decision Engine 第一版採規則型評分，不依賴 AI，確保可解釋、可審計。

**client_health_score（0–100）**

```
base: 100

扣分條件：
- open incident (critical): -30
- open incident (high): -15
- open incident (medium): -5
- maintenance overdue > 7 days: -10
- smoke test failure: -10
- MainWP disconnected: -15
- SSL expiry < 14 days: -20
- backup not confirmed > 7 days: -10
```

**site_risk_score（0–100，越高越危險）**

```
base: 0

加分條件：
- WooCommerce active: +10 (higher stakes)
- last incident within 30 days: +20
- plugin update pending > 30 days: +15
- no staging environment: +10
- no backup confirmed: +20
- no monitoring registered: +15
```

**upsell_score（0–100）**

```
加分條件：
- client on wp-basic but site has > 500 monthly visitors: +20
- client has no CRM configured: +15
- client has no email automation: +15
- monthly report shows repeated manual tasks: +10
- client_health_score > 80: +10 (healthy = ready for upsell)
```

**churn_risk_score（0–100）**

```
加分條件：
- no report opened in 60 days: +20
- support tickets unanswered > 48h: +20
- invoice overdue > 14 days: +25
- client_health_score < 40: +15
- no activity in client portal > 90 days: +10
```

## **25.2 recommendation 輸出結構**

```json
{
  "recommendation_id": "uuid",
  "client_id": "uuid",
  "generated_at": "ISO timestamp",
  "type": "upsell | upgrade | risk_alert | churn_prevention | maintenance",
  "priority": "critical | high | medium | low",
  "title": "建議升級至 wp-business",
  "reason": "流量已超過 wp-basic 建議範圍，且缺乏 Google Site Kit 追蹤",
  "suggested_action": "upgrade_package",
  "suggested_package": "wp-business",
  "estimated_revenue_impact": 200,
  "auto_execute": false,
  "requires_approval": true,
  "status": "pending | accepted | rejected | executed"
}
```

## **25.3 不能讓 Decision Engine 自動做的事**

- 刪除任何資料
- 升級 WooCommerce（production）
- 更改付款閘道
- 發送大量 email
- 更改 DNS

---

# **26. Cursor Master Prompt：只用這份，不再拆散**

```markdown
# LOBSTER_FACTORY_MASTER_BUILD_PROMPT.md

You are implementing Lobster Factory.

This is a Cloud-first One-click Client OS Factory.

It is not a VPS provisioning tool.
It is not only a WordPress installer.
It is a multi-tenant Agency OS + Factory OS + Client OS + Observability OS + Decision Engine platform.

## Core Assumptions

- Clients use cloud hosting, managed WordPress, or SaaS.
- We do not self-host client infrastructure by default.
- WordPress is the first delivery surface.
- Shopify/Webflow/Framer can be added later via provider adapters.
- Supabase/Postgres is the Factory Registry and system of record.
- Trigger.dev / durable workflow is used for long-running workflows.
- n8n is used for webhooks, notifications, reports, and simple sync.
- MainWP is used for centralized WordPress maintenance.
- Sentry is used for errors and incident context.
- PostHog is used for analytics, funnels, and feature flags.
- Uptime monitoring is required.
- Netdata is required only when self-managing servers.
- GitHub is the source of truth for code, manifests, migrations, policies, workflows, and docs.

## Non-negotiable Rules

1. All tenant-bound tables must include organization_id.
2. Use workspace_id where applicable.
3. Every workflow must produce workflow_run.
4. Every agent execution must produce agent_run.
5. Every high-risk action requires approval (stored in approval_requests).
6. Production deploy is never automatic by default.
7. Secrets must never be printed, logged, or sent to AI context.
8. All packages, manifests, workflows, agents, prompts, and policies must be versioned.
9. All critical actions must be reversible or marked non_reversible.
10. If provider automation is unavailable, create operator_task instead of failing.
11. Old versions are deprecated, never overwritten.
12. Do not build isolated fragments; connect schema, API, workflow, policy, logs, and docs.
13. approval_policies define rules; approval_requests record each actual decision.
14. Every handoff must produce a structured handoff_report JSON.

## Build Order

Phase 0:
- docs and architecture source of truth

Phase 1:
- Supabase schema
- core tenancy
- clients/projects/sites
- packages/manifests
- workflow_runs
- approval_policies + approval_requests
- incidents
- audit_logs

Phase 2:
- package manifests
- wp-basic (with manifest JSON)
- wp-business
- wc-core

Phase 3:
- provider adapters
- generic WordPress
- manual task fallback

Phase 4:
- provision_client_os workflow
- apply_manifest
- MainWP connection
- monitoring registration
- smoke tests
- handoff report

Phase 5:
- n8n lightweight automation
- onboarding notification
- report delivery
- alert routing
- sync workflows

Phase 6:
- MainWP maintenance layer
- maintenance_policies
- maintenance_runs

Phase 7:
- observability ingestion
- Sentry webhook
- Uptime alert
- PostHog events
- incident router
- runbook factory

Phase 8:
- approval engine
- risk policy
- tool policies
- rollout / rollback

Phase 9:
- admin UI
- client portal

Phase 10:
- decision engine v1 (rules-based scoring)

## Required Output for Every Task

1. Files created
2. Files updated
3. Schema impact (tables added/modified)
4. Workflow impact (new/changed runs)
5. Policy impact (approval / risk rules changed)
6. Observability impact (new monitors / alerts)
7. Acceptance criteria (what must pass)
8. Rollback plan (how to undo)
```

---

# **27. 最終總結**

你要的不是東拼西湊的工具清單。

你要的是這套：

**Cloud-first One-click Client OS Factory**

完整系統是：

**Agency OS**
= 管你的公司

**Factory OS**
= 生成客戶系統

**Client OS**
= 客戶收到的網站 + CRM + 內容 + 監控 + 報告

**Data OS**
= Supabase / Postgres 作為所有記憶

**Workflow OS**
= n8n + Trigger.dev 分工

**Observability OS**
= Sentry + PostHog + Uptime + Netdata optional + incidents

**Governance OS**
= approval_policies + approval_requests + audit_logs + rollback

**Decision Engine**
= 根據數據做優化與商業決策（規則型先行，AI 後加）

最終不可變原則：

> 工具可替換。
> 資料要可遷移。
> 流程要可審計。
> 高風險要審批（approval_policies + approval_requests 雙表）。
> 所有行動要有 Run。
> 所有錯誤要進 Incident。
> 所有交付要有 Report（含 handoff_report JSON）。
> 所有 package 要版本化。
> 所有客戶要隔離（RLS + organization_id）。
> 所有模組要能開關。
> Decision Engine 只建議，不自動執行高風險動作。

這份就是新的主計畫。
之後不要再分散成「主機一份、監控一份、MainWP 一份、Supabase 一份」。全部都應該回到這份架構下延伸。

---

# **28. Canonical Naming Policy**

所有 schema、API、UI、workflow 都必須用同一套命名。一旦定案，不再更改。

## **28.1 命名規則**

```
Table names        → plural snake_case        (organizations, sites, workflow_runs)
Event tables       → noun + _events           (incident_events, status_page_events)
Run tables         → noun + _runs             (workflow_runs, maintenance_runs, agent_runs)
Config/rule tables → noun + _policies         (approval_policies, maintenance_policies, tool_policies)
User action tables → noun + _requests         (approval_requests)
Immutable log      → audit_logs
```

## **28.2 審批相關命名最終定案**

| 表名 | 職責 |
| ----- | ----- |
| `approval_policies` | 定義哪些操作需要審批、由誰審批、風險等級 |
| `approval_requests` | 每次實際觸發的審批記錄（pending / approved / rejected） |
| `approval_decisions` | 可選：多人審批時每位審批者的個別決策記錄 |

> ⚠️ 全系統禁止再用泛稱 `approvals`。所有 schema、API、workflow、UI 都必須用上表命名。

## **28.3 其他命名禁止清單**

```
禁止使用    → 應改為
-----------  --------
approvals    → approval_requests
runs         → workflow_runs / agent_runs / maintenance_runs（指定類型）
configs      → 指定具體 (smtp_configs, seo_configs)
logs         → audit_logs（通用稽核）/ 其他特定 log 表
data         → 描述具體內容
info         → 描述具體內容
```

---

# **29. Environment and Release Policy**

## **29.1 環境定義**

| 環境 | 用途 | 可自動部署 | 可直接改 |
| ----- | ----- | ----- | ----- |
| `local` | 開發者本機 | ✅ | ✅ |
| `staging` | 內部測試 | ✅ CI/CD | ❌ 需 PR |
| `pilot_client` | 第一批客戶（低風險） | ⚠️ 需 approval | ❌ |
| `production` | 正式客戶 | ❌ 永不自動 | ❌ |
| `sandbox` | demo / 測試客戶（不收費） | ✅ | ✅ |

## **29.2 部署晉升路徑**

```
local
→ staging（PR + CI pass）
→ internal QA（人工驗收）
→ pilot client（approval + smoke test）
→ production rollout（正式 approval + 全套 smoke test + rollback plan）
```

任何 workflow、package、manifest、policy、migration 都不能跳過這條路徑直達 production。

## **29.3 Production Change Freeze**

以下期間禁止任何 high / critical risk 的 production 變更：

- 客戶 launch 當天
- 客戶主動行銷活動期間
- 高流量促銷期（Black Friday、年末等）
- 尚有未解決的 high / critical incident

Change freeze 必須記錄在 `release_freezes` 表：

```sql
release_freezes (
  id uuid primary key,
  organization_id uuid not null,
  scope_type text not null,        -- 'global' | 'client' | 'site'
  scope_id uuid,
  reason text not null,
  freeze_start timestamptz not null,
  freeze_end timestamptz,
  created_by uuid not null,
  created_at timestamptz default now()
);
```

---

# **30. Backup, Restore, and Disaster Recovery Policy**

> **備份不是重點，能還原才是重點。**
> 一個從未測試過還原的備份，等同於沒有備份。

## **30.1 備份驗證規則**

備份只有在以下條件全部滿足才視為有效：

1. 備份檔案存在且可存取
2. 備份時間在 policy 規定的窗口內
3. 還原程序已文件化
4. 在 policy 規定的週期內，至少完成過一次還原測試

## **30.2 RTO / RPO 目標（對應維護方案）**

| 方案 | RTO（最長恢復時間） | RPO（最大資料損失） |
| ----- | ----- | ----- |
| `basic-monthly` | 48 小時 | 24 小時 |
| `standard-biweekly` | 24 小時 | 24 小時 |
| `pro-weekly` | 8 小時 | 12 小時 |
| `enterprise-custom` | 客製（合約定義） | 客製（合約定義） |

## **30.3 新增表：restore_runs**

```sql
restore_runs (
  id uuid primary key,
  organization_id uuid not null,
  site_id uuid not null,
  backup_ref text not null,
  environment_type text not null,    -- 'staging' | 'production'
  triggered_by text not null,        -- 'manual' | 'dr_test' | 'incident'
  status text not null,              -- 'success' | 'failed' | 'partial'
  rto_minutes int,
  rpo_minutes int,
  tested_at timestamptz,
  notes text,
  result jsonb not null default '{}'
);
```

## **30.4 DR 演練政策**

- `basic-monthly`：每季至少進行一次 staging 環境還原測試
- `pro-weekly`：每月一次，含 WooCommerce checkout 驗證
- `enterprise-custom`：依合約，但至少每月一次全站還原測試

---

# **31. Idempotency, Retry, and Concurrency Locking**

## **31.1 為什麼必須有 Idempotency**

一鍵生成系統必然遇到：

- 使用者重複點擊
- webhook 重送
- workflow retry
- provider timeout 後重試
- n8n 重跑
- Trigger.dev retry

沒有 idempotency，會產生：重複網站、重複 email、重複 invoice、重複 plugin install、重複 monitor 登錄。

## **31.2 Idempotency Key 規則**

所有對外部有副作用的操作都必須有 idempotency key。

涵蓋操作：
- create client
- create project
- create site
- apply manifest
- send handoff email
- create monitor
- create invoice
- register MainWP site
- send onboarding notification

Key 格式：

```
idempotency_key = {workflow_name}:{site_id}:{step_name}:{manifest_version}

範例：
provision_client_os:site_abc123:apply_manifest:wp-basic@1.0.0
provision_client_os:site_abc123:send_handoff_email:v1
```

## **31.3 新增表：idempotency_keys**

```sql
idempotency_keys (
  id uuid primary key,
  organization_id uuid not null,
  key text not null unique,
  scope_type text not null,     -- 'workflow_step' | 'notification' | 'invoice' | ...
  scope_id uuid not null,
  operation text not null,
  status text not null,         -- 'pending' | 'completed' | 'failed'
  result jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
```

## **31.4 Site Locking（並發保護）**

同一個網站同一時間只能有一個高風險 workflow 在執行。

需要 lock 的操作：
- `apply_manifest`
- `production_update`
- `woocommerce_update`
- `restore_backup`
- `checkout_change`
- `dns_change`
- `smtp_change`

## **31.5 新增表：resource_locks**

```sql
resource_locks (
  id uuid primary key,
  organization_id uuid not null,
  resource_type text not null,    -- 'site' | 'client' | 'workflow'
  resource_id uuid not null,
  lock_type text not null,        -- 'apply_manifest' | 'production_update' | ...
  locked_by_run_id uuid,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(resource_type, resource_id, lock_type)
);
```

Lock 取得失敗時，workflow 必須產生 `operator_task`，不可靜悄悄失敗。

---

# **32. Plugin License and Vendor Governance**

## **32.1 為什麼需要 Plugin Governance**

你目前有：Kadence、WooCommerce、FluentCRM、Fluent Forms、Rank Math、FluentSMTP、Google Site Kit、LiteSpeed Cache。

沒有 plugin governance 會碰到：
- 付費 plugin 授權到期（客戶網站無法更新）
- plugin 被棄用（zombie plugin，有安全風險）
- agency license 超出使用上限
- plugin 被列入安全警告但無法追蹤哪些站在用
- 不同客戶用不同 license 造成混亂

## **32.2 Plugin 分類**

每個 plugin 必須被歸類為：

| 狀態 | 說明 |
| ----- | ----- |
| `approved` | 審核通過，可安裝 |
| `conditional` | 特定條件下可安裝（e.g., LiteSpeed only on LiteSpeed server） |
| `restricted` | 需要額外 approval 才能安裝 |
| `deprecated` | 不再新增，但舊站仍維護 |
| `banned` | 禁止安裝，有安全或授權問題 |

高風險 plugin 類別（需要 `restricted` 分類）：
- payment
- checkout
- membership
- security
- backup
- cache
- email sending
- user role management

## **32.3 新增表：plugin_registry、plugin_licenses**

```sql
plugin_registry (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  vendor text,
  category text not null,
  risk_level text not null,          -- 'low' | 'medium' | 'high' | 'critical'
  status text not null,              -- 'approved' | 'conditional' | 'restricted' | 'deprecated' | 'banned'
  license_required boolean default false,
  condition_expression text,         -- e.g., "provider == 'litespeed'"
  replacement_slug text,
  security_advisory_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

plugin_licenses (
  id uuid primary key,
  organization_id uuid not null,
  plugin_slug text not null,
  license_owner_type text not null,  -- 'agency' | 'client'
  license_owner_id uuid,
  license_key_ref text,              -- 指向 secrets manager，不可明文存放
  expires_at timestamptz,
  max_activations int,
  current_activations int default 0,
  status text not null,              -- 'active' | 'expired' | 'revoked'
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
```

---

# **33. Domain, DNS, and Email Deliverability Policy**

## **33.1 為什麼需要獨立政策**

Domain / DNS / Email 是最容易被忽視、但最影響客戶業務的層：
- domain 到期 → 網站消失
- DNS 改錯 → 全站斷線
- SPF/DKIM/DMARC 沒設 → email 進垃圾桶
- MX 改錯 → email 全斷

## **33.2 DNS 變更需要 Approval 的操作**

以下任何 DNS 變更都是 `high` risk，必須經過 approval：

- nameserver 變更
- A / CNAME production record 變更
- MX record 變更
- SPF / DKIM / DMARC 變更
- checkout domain 變更
- email sending domain 變更

## **33.3 每個 Domain 必須追蹤**

```
registrar
nameserver provider
expiry date（到期前 60 天自動告警）
DNS owner
SSL status（到期前 30 天 / 14 天分別告警）
email authentication status（SPF / DKIM / DMARC）
```

## **33.4 新增表：domains（補強版）、dns_records**

```sql
domains (
  id uuid primary key,
  organization_id uuid not null,
  client_id uuid,
  site_id uuid,
  domain text not null unique,
  registrar text,
  dns_provider text,
  status text not null,              -- 'active' | 'expiring' | 'expired' | 'transferred'
  expires_at timestamptz,
  ssl_status text,                   -- 'valid' | 'expiring' | 'expired' | 'none'
  ssl_expires_at timestamptz,
  spf_status text,
  dkim_status text,
  dmarc_status text,
  email_auth_status text,            -- 'configured' | 'partial' | 'none' | 'failed'
  last_verified_at timestamptz,
  metadata jsonb default '{}'
);

dns_records (
  id uuid primary key,
  domain_id uuid not null references domains(id),
  record_type text not null,         -- 'A' | 'CNAME' | 'MX' | 'TXT' | 'NS' | ...
  name text not null,
  value text not null,
  ttl int,
  managed_by text,                   -- 'cloudflare' | 'registrar' | 'manual'
  last_verified_at timestamptz,
  metadata jsonb default '{}'
);
```

---

# **34. Testing Strategy**

## **34.1 測試金字塔**

```
              E2E Tests（少量，高價值）
           ↑
        Integration Tests
      ↑
   Contract Tests（interface 驗證）
  ↑
Unit Tests（大量，快速）
```

## **34.2 Unit Tests（必須）**

- approval policy evaluator
- manifest parser（欄位驗證、版本格式）
- provider adapter 邏輯（能否自動化判斷）
- decision score calculator（各維度評分邏輯）
- idempotency key generator
- cost entry allocator

## **34.3 Integration Tests（必須）**

- Supabase insert / read / RLS 驗證
- Trigger.dev workflow step 執行
- n8n webhook trigger 與回應
- Sentry incident webhook ingestion
- PostHog event capture
- MainWP connection 建立與 site_id 回寫

## **34.4 Contract Tests（ProviderAdapter 必須）**

每個 adapter 都必須通過同一套 contract test：

```typescript
describeProviderAdapterContract(adapter: ProviderAdapter) {
  it('supportsAutoProvisioning returns boolean')
  it('createOrRegisterSite returns valid status')
  it('createOrRegisterSite falls back to manual_required without throwing')
  it('applyManifest returns logs array')
  it('runVerification returns passed boolean')
}
```

每個新 adapter（hostinger、cloudways 等）實作完成後，必須通過 contract test 才能加入 package manifests。

## **34.5 E2E Tests（關鍵路徑）**

```
1. create client → create project → create site
2. select wp-basic → apply manifest → register monitoring
3. run smoke tests → generate handoff report
4. trigger incident → create runbook → notify
5. request approval → approve → execute
```

## **34.6 Production Smoke Tests（每次部署後必跑）**

```
Profile: basic
- homepage HTTP 200
- wp-admin HTTP 200
- SSL 有效

Profile: business
- 以上 + contact form reachable + sitemap XML exists

Profile: woocommerce
- 以上 + shop page + product page + cart + checkout HTTP 200
- payment_gateway_status advisory check
- CRM webhook reachable
```

---

# **35. Client Data Lifecycle and Offboarding Policy**

## **35.1 客戶資料生命週期狀態**

```
active
→ paused           （暫停服務，資料保留）
→ offboarding      （正在離線流程）
→ archived         （所有資料封存，工具停用）
→ export_ready     （完整資料可下載）
→ deleted          （依法律要求或客戶明確要求）
```

## **35.2 Offboarding 不可跳過的步驟**

1. 匯出所有客戶資料（site、CRM、report、invoice）
2. 撤銷所有 secrets（API keys、SMTP、GA4 等）
3. 從 MainWP Dashboard 移除該站連線
4. 停用所有 monitoring checks
5. 停用所有 scheduled workflows
6. 產生最終 offboarding report
7. 客戶確認後才 archive

> **規則：不可 hard delete，先 archive。** 任何資料刪除都必須有 `client_offboarding_run` 記錄。

## **35.3 新增表：client_offboarding_runs**

```sql
client_offboarding_runs (
  id uuid primary key,
  organization_id uuid not null,
  client_id uuid not null,
  initiated_by uuid not null,
  status text not null,                    -- 'initiated' | 'in_progress' | 'completed' | 'failed'
  data_exported boolean default false,
  export_url text,
  secrets_revoked boolean default false,
  mainwp_disconnected boolean default false,
  monitoring_disabled boolean default false,
  workflows_stopped boolean default false,
  client_confirmed boolean default false,
  final_report_url text,
  completed_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
```

---

# **36. Cost and Profitability Policy**

## **36.1 成本類別**

每個 `cost_entry` 必須歸類至以下其中一個：

| 類別 | 說明 |
| ----- | ----- |
| `ai_token` | AI 模型使用費（ChatGPT、Claude、Gemini 等） |
| `hosting` | 主機費（按客戶分攤） |
| `plugin_license` | 付費 plugin 授權分攤 |
| `automation_run` | n8n / Trigger.dev 執行費 |
| `human_operator` | 人工操作時間（按小時估算） |
| `monitoring` | Uptime / Sentry / PostHog 訂閱分攤 |
| `support` | 客服時間 |
| `incident` | 事故處理成本（人工 + AI + 工具） |
| `saas_tool` | 其他 SaaS 訂閱分攤 |

## **36.2 成本分攤層級**

```
Organization（總計）
→ Client（每客戶合計）
  → Project（每專案）
    → Site（每站）
      → workflow_run（每次執行）
```

## **36.3 Profitability Score**

`profitability_snapshots` 每月計算一次：

```
gross_margin = revenue - cost
margin_rate  = gross_margin / revenue

score 0–100：
- margin_rate > 0.6  → score 90–100
- margin_rate > 0.4  → score 70–89
- margin_rate > 0.2  → score 50–69
- margin_rate > 0    → score 30–49
- margin_rate <= 0   → score 0–29（虧損客戶）
```

虧損客戶應自動產生 `recommendation`（type: `cost_review`）進入 Decision Engine。

## **36.4 cost_entries 最終欄位定義**

```sql
cost_entries (
  id uuid primary key,
  organization_id uuid not null,
  client_id uuid,
  project_id uuid,
  site_id uuid,
  workflow_run_id uuid,
  agent_run_id uuid,
  category text not null,
  amount numeric not null,
  currency text not null default 'USD',
  source text,
  billed_to text not null default 'agency',  -- 'agency' | 'client' | 'shared'
  occurred_at timestamptz not null default now(),
  metadata jsonb default '{}'
);
```

---

# **37. Client Communication Policy**

## **37.1 通知矩陣**

| 事件 | Basic | Business | Commerce | Enterprise |
| ----- | ----- | ----- | ----- | ----- |
| 排程維護 | 可選 | ✅ 提前 48h | ✅ 提前 72h | ✅ 客製 |
| 一般 plugin 更新 | 月報摘要 | 月報摘要 | ✅ 即時摘要 | ✅ 即時詳細 |
| Homepage 斷線 | ✅ 即時 | ✅ 即時 | ✅ 即時 | ✅ 即時 |
| Checkout 斷線 | n/a | n/a | ✅ 立即 + 電話 | ✅ 立即 + 電話 |
| 安全事故 | ✅ 立即 | ✅ 立即 | ✅ 立即 | ✅ 立即 |
| Backup 還原 | ✅ 事後通知 | ✅ 事前 approval | ✅ 事前 approval | ✅ 事前 approval |
| DNS 變更 | ✅ approval | ✅ approval | ✅ approval | ✅ approval |
| 月報 | ✅ | ✅ | ✅ | ✅ 週報 |

## **37.2 通知模板版本化**

所有客戶通知都使用版本化模板，存放於：

```
templates/client-notifications/
├── maintenance-scheduled.md
├── incident-opened.md
├── incident-resolved.md
├── handoff-report.md
├── approval-request.md
├── monthly-report.md
├── offboarding-confirmation.md
└── domain-expiry-warning.md
```

每個模板必須有：
- `template_id`
- `version`
- `channel`（email / Slack / SMS）
- `variables`（定義可替換變數清單）

## **37.3 通知不可包含的資料**

- 任何 secrets 或 API keys
- 完整資料庫連線字串
- 其他客戶的任何資訊
- 系統內部錯誤 stack trace（只給摘要）

---

# **38. Architecture Decision Records (ADR)**

## **38.1 為什麼需要 ADR**

30 年系統最大的風險之一是：**「為什麼當初這樣設計？」沒有記錄。**

一年後重新看這份文件時，沒有 ADR 會導致：
- 重複踩相同的坑
- 誤改已經有理由的設計
- 新成員無法理解系統邊界

## **38.2 ADR 格式**

```markdown
# ADR-XXXX: [決策標題]

## Status
Accepted | Superseded by ADR-XXXX | Deprecated

## Context
[為什麼需要做這個決定，當時面對什麼問題]

## Decision
[我們決定做什麼]

## Consequences
[這個決定的優點、缺點、風險、後續影響]

## Alternatives Considered
[我們考慮過哪些其他選項，為什麼沒選]
```

## **38.3 必須建立的 ADR 清單（第一批）**

```
ADR-0001: Use Supabase as Factory Registry（而非自建 Postgres）
ADR-0002: Trigger.dev for durable workflows（而非純 n8n）
ADR-0003: n8n for lightweight webhooks（而非全用 Trigger.dev）
ADR-0004: MainWP for WordPress fleet management（而非 ManageWP）
ADR-0005: Netdata is optional in pure SaaS MVP（為什麼不強制）
ADR-0006: High-risk actions always require human approval（不可純 AI 決定）
ADR-0007: Manifests are deprecated, never overwritten（版本不可破壞性）
ADR-0008: approval_policies + approval_requests two-table design（而非單表）
ADR-0009: Payment gateway as advisory smoke test（而非必過）
ADR-0010: Client data is archived before deletion（不可直接 hard delete）
```

ADR 存放位置：`docs/adr/ADR-XXXX-title.md`

---

# **39. Known Conflicts and Corrections Log**

此章節記錄所有版本間已知矛盾、修正原因、最終定案。這是版本間的「決策日誌」，防止未來重新踩坑。

## **39.1 v1.0 → v1.1 修正**

| 編號 | 問題 | 修正 |
| ----- | ----- | ----- |
| C-001 | 全文 GPT Markdown 逃脫字符（`\-`、`\[` 等） | 全部清除 |
| C-002 | Section 17 與 Section 24 Phase 編號不一致 | 對齊為 Phase 0–10 |
| C-003 | Section 18 「不能刪的」清單漏 `audit_logs` | 已補入 |
| C-004 | 資料模型缺 `approval_policies` / `approval_requests` | Section 15.4 補全 |
| C-005 | TypeScript ProviderAdapter 介面有逃脫字符 | 修正 |
| C-006 | 缺 `wp-basic` manifest JSON 範例 | Section 9.2 新增 |
| C-007 | 缺 `handoff_report` 結構定義 | Section 8.1 新增 |
| C-008 | Maintenance Plan 缺 SLA 等級 | Section 20 新增 |
| C-009 | Decision Engine 評分邏輯太薄 | Section 25 補強 |
| C-010 | 缺 n8n 初始部署 Phase | 新增 Phase 5 |

## **39.2 v1.1 → v1.2 修正**

| 編號 | 問題 | 修正 | 位置 |
| ----- | ----- | ----- | ----- |
| C-011 | `payment_gateway_configured` 不應為 smoke test 必過項 | 改為 advisory check，加 `payment_gateway_status` 欄位 | Section 9.4 |
| C-012 | Netdata 在 Observability 來源寫得像固定必裝 | 加明確說明：MVP 純 SaaS 無需實作 Netdata connector | Section 13.1 |
| C-013 | MainWP Dashboard 部署限制未明文 | 加：MainWP Dashboard 絕對不能部署在客戶自有 hosting 帳號 | Section 4.2 |
| C-014 | Section 17 Phase 8 用 `approval_policy`（單數） | 改為 `approval_policies` / `approval_requests`（與命名政策一致） | Section 17 Phase 8 |

---

# **40. 最終版總結（v1.2）**

```
v1.1 = 架構可部署
v1.2 = 公司可長期跑
```

**v1.1 給的是：**

- Cloud-first 一鍵生成架構
- 完整核心物件與資料模型
- Package / Manifest / Provider Adapter 系統
- Observability OS 閉環
- Governance / Approval 系統
- Decision Engine 評分邏輯

**v1.2 加的是：**

- Canonical Naming Policy（命名永遠一致）
- Environment & Release Policy（環境晉升、Change Freeze）
- Backup & DR Policy（還原測試、RTO/RPO）
- Idempotency & Locking（冪等性、並發保護）
- Plugin License & Vendor Governance（授權、生命週期）
- Domain / DNS / Email Policy（domain 生命週期、email auth）
- Testing Strategy（Unit / Integration / Contract / E2E / Smoke）
- Client Data Lifecycle（資料狀態機、offboarding 清單）
- Cost & Profitability Policy（成本分類、profitability score）
- Client Communication Policy（通知矩陣、模板版本化）
- ADR（架構決策記錄，防止 30 年後忘記為什麼）
- Known Conflicts Log（版本間矛盾追蹤）

**最終不可變原則（v1.2 版）：**

> 工具可替換。資料要可遷移。流程要可審計。
> 高風險要審批（approval_policies + approval_requests 雙表）。
> 所有行動要有 Run。所有錯誤要進 Incident。
> 所有交付要有 Report（含 handoff_report JSON）。
> 所有 package 要版本化。所有客戶要隔離（RLS + organization_id）。
> 所有模組要能開關。Decision Engine 只建議，不自動執行高風險動作。
> 命名一旦定案，不可破壞性更改。
> 備份不驗證還原，等於沒有備份。
> 每個重大決定必須有 ADR。
> Change Freeze 期間禁止任何 high risk production 變更。
> Plugin 授權是資產，必須納入 governance。
> Client offboarding 不可跳步驟，不可 hard delete。

---

# **41. 三種部署 Profile：AO-agent / 新客戶 / 已有 WordPress**

> **v1.3 新增。** 本系統服務三種完全不同的部署情境，每種 Profile 有不同的風險等級、manifest 策略、smoke test 標準、備份要求。Cursor 在開始任何部署任務前，必須先確認是哪個 Profile。

## **41.1 Profile 總表**

| 維度 | Profile A：AO-agent（自己公司） | Profile B：新客戶（全雲端） | Profile C：已有 WordPress 客戶 |
| ----- | ----- | ----- | ----- |
| **目標** | 建立公司自身的控制平面工具 | 從零建立完整 Client OS | 接管現有站，補齊缺失系統 |
| **WordPress 狀態** | 由你掌控（n8n VPS / MainWP / 等） | 不存在，需全新建立 | 已存在，有真實內容與資料 |
| **manifest 套用方式** | Full install（自己的環境） | Full install（新站） | **Delta / Additive only**（禁止破壞現有內容） |
| **備份前置要求** | 建議 | 標準 | **強制，不可跳過** |
| **Netdata** | 有自架機器就必須 | 不必（純 SaaS MVP） | 不必（客戶不自架） |
| **plugin 衝突檢查** | N/A | N/A | **必須執行** |
| **smoke test profile** | 內部工具連通性 | `basic` / `business` / `woocommerce` | `adopt`（見 41.4） |
| **MainWP 角色** | Dashboard 擁有者 | Child plugin 安裝 | Child plugin 安裝（但現有站需先審計） |
| **風險等級** | Medium（自己的系統） | Low（全新） | **High**（現有資料有損失風險） |
| **rollback 策略** | 可依版本回滾 | 標準 rollback | 必須還原至 pre-adopt 備份快照 |

---

## **41.2 Profile A：AO-agent（你自己的公司）**

### 定義

AO-agent 是你自己公司的控制平面。部署對象是 Lobster Factory 本身的基礎設施，而不是任何客戶網站。

### 包含的工具

```
MainWP Dashboard（自架或 managed，非客戶 hosting）
n8n（自架 VPS 或 Cloud）
Uptime Kuma（自架 VPS）或 Better Stack
Supabase Control Plane
GitHub Actions / CI
Cloudflare（DNS / WAF / Access）
Sentry（錯誤追蹤）
PostHog（系統使用分析）
Netdata（監控所有自管 VPS）
Secrets Manager（1Password / Doppler / Infisical）
Admin UI + Client Portal
```

### 特殊規則

- **Netdata 強制**：只要有任何一台自管 VPS（n8n / MainWP / Worker），Netdata 必須上
- **MainWP Dashboard 位置**：只能在你自己掌控的環境，絕不放客戶 hosting
- **不使用 `provision_client_os` workflow**：AO 部署走 infra/CI 流程，不走客戶 onboarding 流程
- **Agency OS 覆蓋範圍**：leads / deals / invoices / subscriptions / internal tasks / costs / profitability
- **不產生 `handoff_report`**：AO 部署是內部事，不是客戶交付

### AO 部署驗收

```
所有 Control Plane 工具可正常連線
MainWP Dashboard 可管理所有測試站
n8n webhook 可觸發並記錄
Sentry 可接收 error
PostHog 可接收 event
Uptime Kuma / Better Stack 監控 AO 工具自身
Netdata 覆蓋所有自管 VPS
Cloudflare Access 保護內部工具
Secrets Manager 整合完成
Supabase staging + production 分離
```

---

## **41.3 Profile B：新客戶（全雲端，從零開始）**

### 定義

客戶沒有任何現有系統。你從零幫他建立完整的 Client OS。這是本系統的**預設路徑**，`provision_client_os` workflow 的設計目標。

### 流程

```
intake → 建立 client/project/site → 選擇 package
→ 選擇 provider → 建立 WordPress（新站）
→ 套用完整 manifest（Full Install）
→ 安裝 MainWP Child
→ 連接 MainWP Dashboard
→ 設定 SEO / CRM / SMTP / tracking
→ 設定監控
→ 跑 smoke tests（basic / business / woocommerce profile）
→ 產生 handoff_report
→ 進入 maintenance policy
→ 持續監控 → incident / decision / upsell
```

### manifest 模式

- **模式**：`full_install`
- **所有 plugins 全新安裝**，不存在衝突問題
- **主題全新套用**

### 特殊規則

- `payment_gateway_configured` 是 advisory，不是必過項
- 第一個客戶只用 `wp-basic`，不用 WooCommerce
- Provider 不支援自動化時，fallback 到 `operator_task`，不中斷 workflow

---

## **41.4 Profile C：已有 WordPress 客戶（接管/遷移）**

### 定義

客戶已有一個運行中的 WordPress 網站，有真實內容、可能有真實客戶資料。你的任務是：
- 把這個站接入 Lobster Factory 的管理體系
- 補齊他缺少的系統（CRM / SEO / 監控 / 報告）
- 不能破壞現有內容和資料

### 這個 Profile 的核心危險

```
現有 plugin 可能與 manifest 的 plugin 衝突
現有 theme 不一定是 Kadence
現有客製化設定可能被覆蓋
現有 DB 有真實訂單 / 客戶 / 表單資料
現有 SMTP 設定可能被新 FluentSMTP 蓋掉
manifest "全套安裝" 會破壞現有環境
```

### Profile C 強制流程

```
【Step 1】建立 Supabase 記錄
  → 建立 client / project / site
  → site_type = 'existing_wp'
  → 記錄現有 site URL / admin URL

【Step 2】強制備份（不可跳過）
  → 全站備份（files + DB）
  → 備份完成 → backup_ref 寫入 Supabase
  → 備份未完成 → 禁止繼續

【Step 3】站點審計（Adopt Audit）
  → 執行 adopt_audit workflow
  → 掃描現有 plugins（比對 manifest required plugins）
  → 掃描現有 themes
  → 掃描現有 SMTP 設定
  → 掃描現有 SEO plugin
  → 產生 adopt_audit_report：
    - 已有、無衝突：skip_install
    - 已有但版本舊：update_required（需 approval）
    - 已有但衝突：manual_review_required
    - 不存在：safe_to_install

【Step 4】套用 Delta Manifest（Additive Only）
  → manifest 模式：adopt_delta（不是 full_install）
  → 只安裝 adopt_audit_report 中 status = safe_to_install 的 plugin
  → 不動現有 theme（除非客戶明確同意）
  → 不覆蓋現有 SMTP（除非現有設定失效）
  → 衝突項目 → 產生 operator_task，人工處理

【Step 5】連接管理體系
  → 安裝 MainWP Child
  → 連接 MainWP Dashboard
  → 設定 Uptime 監控
  → 設定 SSL 監控

【Step 6】跑 Adopt Smoke Tests
  → adopt profile（見下方）

【Step 7】產生 handoff_report（含 audit 摘要）

【Step 8】進入 maintenance policy
```

### manifest 模式：`adopt_delta`

```json
{
  "name": "wp-business",
  "version": "1.0.0",
  "apply_mode": "adopt_delta",
  "adopt_rules": {
    "existing_plugin_conflict": "create_operator_task",
    "existing_theme_conflict": "skip_and_notify",
    "existing_smtp_conflict": "skip_and_notify",
    "missing_plugin": "safe_to_install",
    "outdated_plugin": "create_approval_request"
  }
}
```

### `apply_mode` 欄位定義

| 模式 | 說明 | 何時使用 |
| ----- | ----- | ----- |
| `full_install` | 全新安裝，假設環境是空的 | Profile B（新客戶） |
| `adopt_delta` | 只補缺失，不動現有設定 | Profile C（已有 WP） |
| `internal_setup` | 設定 AO 自身工具 | Profile A（AO-agent） |

### Adopt Smoke Test Profile

```json
{
  "profile": "adopt",
  "checks": [
    "homepage_status_unchanged",
    "wp_admin_accessible",
    "ssl_valid",
    "existing_forms_still_functional",
    "existing_content_count_unchanged",
    "no_new_php_errors",
    "mainwp_child_connected",
    "uptime_monitor_registered"
  ],
  "advisory_checks": [
    "new_plugins_activated",
    "smtp_configuration_valid"
  ]
}
```

> **關鍵**：`homepage_status_unchanged` 和 `existing_content_count_unchanged` 是必過項。任何一項失敗 → 立即 rollback，建立 `critical` incident。

### Adopt Audit 新增表

```sql
adopt_audits (
  id uuid primary key,
  organization_id uuid not null,
  site_id uuid not null,
  workflow_run_id uuid,
  audited_at timestamptz not null default now(),
  existing_plugins jsonb not null default '[]',
  existing_themes jsonb not null default '[]',
  existing_smtp jsonb,
  conflict_summary jsonb not null default '{}',
  safe_to_install jsonb not null default '[]',
  manual_review_required jsonb not null default '[]',
  status text not null
);

adopt_audit_items (
  id uuid primary key,
  adopt_audit_id uuid not null references adopt_audits(id),
  item_type text not null,       -- 'plugin' | 'theme' | 'smtp' | 'seo'
  slug text not null,
  existing_version text,
  manifest_version text,
  status text not null,          -- 'safe_to_install' | 'skip_install' | 'update_required' | 'conflict' | 'manual_review'
  resolution text,               -- 'installed' | 'skipped' | 'operator_task' | 'approval_request'
  notes text
);
```

---

## **41.5 新增 Workflow：`adopt_client_os`**

Profile C 需要獨立的 workflow，不能共用 `provision_client_os`。

```
adopt_client_os
├── validate_site_accessible
├── create_mandatory_backup     ← 失敗就停，不往下走
├── run_adopt_audit             ← 產生 adopt_audit + adopt_audit_items
├── create_approval_request_if_needed  ← 有 update_required 項目時
├── apply_delta_manifest        ← 只裝 safe_to_install
├── install_mainwp_child
├── connect_mainwp
├── register_monitoring
├── run_adopt_smoke_tests       ← 用 adopt profile
├── generate_handoff_report     ← 含 adopt_audit_report 摘要
└── enter_maintenance_policy
```

**Trigger.dev job 名稱**：`adopt-client-os`（kebab-case，對應 I 區命名規則）

---

## **41.6 DB 追加：`site_type` 欄位**

`sites` table 需要新增欄位以區分 Profile：

```sql
alter table sites add column if not exists
  site_type text not null default 'new_client'
  check (site_type in ('new_client', 'existing_wp', 'ao_internal'));

alter table sites add column if not exists
  apply_mode text not null default 'full_install'
  check (apply_mode in ('full_install', 'adopt_delta', 'internal_setup'));
```

Migration 編號：`0016_site_type_and_apply_mode.sql`

---

## **41.7 Provider Adapter 補充方法**

Profile C 需要 `ProviderAdapter` 新增 adopt 相關方法：

```typescript
export interface ProviderAdapter {
  // ... 現有方法 ...

  // Profile C 新增
  auditExistingSite(input: {
    siteId: string;
    siteUrl: string;
    adminUrl: string;
    adminCredentialRef: string;
  }): Promise<{
    plugins: ExistingPlugin[];
    themes: ExistingTheme[];
    smtpConfigured: boolean;
    phpVersion: string;
    wpVersion: string;
  }>;

  applyDeltaManifest(input: {
    siteId: string;
    manifestVersionId: string;
    auditReport: AdoptAuditReport;
    applyMode: 'adopt_delta';
  }): Promise<{
    status: 'success' | 'partial' | 'failed';
    installed: string[];
    skipped: string[];
    operatorTasksCreated: string[];
    logs: string[];
  }>;

  runAdoptVerification(input: {
    siteId: string;
    preAdoptSnapshot: SiteSnapshot;
  }): Promise<{
    passed: boolean;
    contentUnchanged: boolean;
    results: Record<string, unknown>;
  }>;
}
```

---

## **41.8 Checklist v2 補充追蹤**

以下項目需補入 MASTER_CHECKLIST v2 的 C 區：

```
C8. Profile C（已有 WP）支援
C8-1. sites table 新增 site_type + apply_mode 欄位（migration 0016）
C8-2. adopt_audits + adopt_audit_items 表建立（migration 0016）
C8-3. ProviderAdapter 補充 auditExistingSite / applyDeltaManifest / runAdoptVerification
C8-4. adopt-client-os Trigger.dev workflow
C8-5. adopt smoke test profile（JSON）
C8-6. manifest 新增 apply_mode 欄位 + adopt_rules 物件
C8-7. ADR-0011: adopt_delta vs full_install design decision
```
