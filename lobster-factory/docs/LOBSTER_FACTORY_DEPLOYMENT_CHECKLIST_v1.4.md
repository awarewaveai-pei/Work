# LOBSTER_FACTORY_DEPLOYMENT_CHECKLIST

副標：Cloud-first One-click Client OS Factory — 30 年穩定部署驗收清單

版本：`v1.4`
對齊主文件：`LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md`
對齊追蹤文件：`LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
定位：**Execution Checklist / Gate Checklist / Evidence Checklist**

> **v1.4 修訂說明：** 新增 Section 24A「Deployment Profile Identification Gate」，正式定義 Profile A（AO-agent 自架）/ Profile B（新客戶全雲端）/ Profile C（已有 WordPress 接管）三種部署路徑的完整驗收 Gate。對應 Master System v1.3 Section 41。
>
> **2026-05-03 定案補述：** 「AO-agent」在 §24A 與 Master §41 中等於 **Profile A（自家控制面）**；**整體產品**交付客戶系統仍含 Profile B/C。口語 vs 路由標籤不可混用——**單一正文** [`ONE_CLICK_BUILD_SYSTEM.md`](ONE_CLICK_BUILD_SYSTEM.md) **v2.1 §1.1**；Master 頂部修訂說明同日補述；handoff 規則 Profile A 見 §24A Profile A Gate（無客戶 handoff），B/C 見 `ONE_CLICK_BUILD_SYSTEM.md` §3 規則 12。
>
> **v1.3 修訂說明（基於 GPT v1.2.1 補強）：**
> - 補全 ADR-0006 至 ADR-0010（GPT 版只到 ADR-0005）
> - 新增 `package_install_runs` 至 Phase 1 Core Tables
> - 補全 Phase 4 `workflow_run` 所有必要欄位（`actor_type`、`trigger_type`、`artifacts`、`tool_versions`、`decision_id`）
> - 新增 Artifact Storage Gate（Phase 4）
> - 所有 Section 14–20 補齊 Evidence 欄位
> - Phase 22（First Client）新增 `wp-basic.json` 存在前置確認 + offboarding runbook 前置確認
> - Traceability Matrix 補入 Section 19（Versioning）、Section 20（SLA）
> - Phase 3 補充 idempotency key format 規範驗收
> - Phase 1 補入 `LOBSTER_ENABLE_DB_WRITES` dev-only flag 確認
> - Phase 0 補入命名對照表驗收項目
> - 補充 Decision Engine 評分邏輯覆蓋完整度確認
> - 新增 Section 25（Companion Document Sync）

---

## 0. 使用規則

本 checklist 不取代 Master Plan，不重新定義架構。
Master Plan 管「系統設計」；本 checklist 管「是否真的完成、是否有證據、是否可進下一關」。

```
Master System          = docs/LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md
Deployment Checklist   = docs/LOBSTER_FACTORY_DEPLOYMENT_CHECKLIST_v1.4.md（本文件）
Master Checklist       = docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
日課合併版（可選）   = docs/LOBSTER_FACTORY_CHECKLIST.md
```

**三份文件必須一致，不可矛盾。任何衝突發現必須先更新 Known Conflicts Log（v1.2 Section 39）再繼續。**

每個 Phase 都必須產生：

```
owner
reviewer
evidence
blockers
rollback_plan
go_no_go_decision
```

狀態只能是：

```
not_started
in_progress
blocked
ready_for_review
approved
rejected
deferred
```

沒有 evidence，不算完成。

可接受 evidence：

- PR link
- migration file path
- Supabase SQL result screenshot
- test output log
- `workflow_run` ID
- Sentry issue ID
- PostHog event screenshot
- Uptime monitor ID
- MainWP site ID
- handoff report URL
- ADR file path
- `approval_request` ID
- `incident` ID
- `rollback_record` ID
- `restore_run` ID
- `idempotency_key` value
- script output log

---

## 1. Global Non-Negotiable Checklist

> 這些是不可妥協的底線。任何一條為 false，不可進入下一 Phase。

### 1.1 Canonical Naming

- [ ] 所有 tenant-bound table 都有 `organization_id`
- [ ] 需要 workspace scope 的 table 都有 `workspace_id`
- [ ] 不使用泛稱 `approvals`（一律用 `approval_requests`）
- [ ] 審批規則只用 `approval_policies`
- [ ] 實際審批只用 `approval_requests`
- [ ] 事件表用 `_events` suffix
- [ ] 執行記錄用 `_runs` suffix
- [ ] 政策表用 `_policies` suffix
- [ ] 不使用模糊欄位名：`data`、`info`、`config`（應改為具體描述）
- [ ] 所有核心物件只 archive，不 hard delete
- [ ] Trigger.dev job 名稱用 kebab-case（e.g. `apply-manifest`）
- [ ] DB table 名稱用 plural snake_case（e.g. `workflow_runs`）
- [ ] TypeScript 用 camelCase（e.g. `applyManifest`）
- [ ] JSON manifest 檔名用 kebab-case（e.g. `wp-basic.json`）
- [ ] Policy JSON 檔名用 kebab-case（e.g. `production-deploy-policy.json`）
- [ ] 命名對照表（`docs/CANONICAL_NAMING_POLICY.md` 或 MASTER_CHECKLIST v2 I 區）已建立

### 1.2 Safety

- [ ] Production deploy 不可預設自動
- [ ] High risk action 必須有 `approval_request`
- [ ] Critical risk action 必須 manual only
- [ ] Secrets 不可出現在 logs
- [ ] Secrets 不可出現在 AI context
- [ ] Secrets 不可出現在 handoff report
- [ ] Secrets 只儲存為 `secret_ref`，不可明文存資料庫
- [ ] PostHog event 不可包含 secrets / PII 明文
- [ ] Sentry event 必須 redact sensitive data
- [ ] External side-effect operation 必須有 idempotency key
- [ ] 同一個 site 不可同時跑兩個 high-risk workflow（resource lock）
- [ ] MainWP Dashboard 不在客戶自有 hosting 帳號內
- [ ] Netdata 不得列為純 SaaS MVP 的必要安裝項目

### 1.3 Observability

- [ ] 每個 workflow 都建立 `workflow_run`
- [ ] 每個 agent 都建立 `agent_run`
- [ ] workflow failure 會建立 `incident` 或 `operator_task`
- [ ] high / critical incident 會通知（Slack / Email / LINE）
- [ ] production site 有 uptime monitor
- [ ] WooCommerce site 有 checkout endpoint monitor
- [ ] handoff report 會保存並關聯 `workflow_run_id`
- [ ] rollback plan 有記錄（或標記 `non_reversible`）
- [ ] `package_install_runs` 狀態流有記錄（pending → running → completed / failed）

### 1.4 Versioning

- [ ] schema migration committed to GitHub
- [ ] manifest committed to GitHub
- [ ] workflow source committed to GitHub
- [ ] policy committed to GitHub
- [ ] agent config committed to GitHub
- [ ] prompt template committed to GitHub
- [ ] 舊版本只能 deprecate，不可覆蓋
- [ ] CHANGELOG 已更新
- [ ] 重大決策有 ADR（對應 v1.2 Section 38）

---

## 2. Phase 0 — Source of Truth Gate

### 必備文件

- [ ] `docs/LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md`（設計 SSOT；若另建索引 `docs/MASTER_SYSTEM.md` 須與本檔語意一致）
- [ ] `docs/DATA_MODEL.md`
- [ ] `docs/WORKFLOW_ROUTING.md`
- [ ] `docs/APPROVAL_POLICY.md`
- [ ] `docs/OBSERVABILITY_OS.md`
- [ ] `docs/CLIENT_OS_PACKAGES.md`
- [ ] `docs/RUNBOOKS.md`
- [ ] `docs/CHANGELOG.md`
- [ ] `docs/CANONICAL_NAMING_POLICY.md`（對應 v1.2 Section 28）
- [ ] `docs/KNOWN_CONFLICTS_LOG.md`（對應 v1.2 Section 39）

### 必備 ADR（第一批，對應 v1.2 Section 38.3）

- [ ] `docs/adr/ADR-0001-use-supabase-as-factory-registry.md`
- [ ] `docs/adr/ADR-0002-use-durable-workflow-for-long-running-jobs.md`
- [ ] `docs/adr/ADR-0003-use-n8n-for-lightweight-automation.md`
- [ ] `docs/adr/ADR-0004-use-mainwp-for-wordpress-fleet-management.md`
- [ ] `docs/adr/ADR-0005-netdata-optional-in-pure-saas-mvp.md`
- [ ] `docs/adr/ADR-0006-high-risk-actions-require-human-approval.md`
- [ ] `docs/adr/ADR-0007-manifests-deprecated-never-overwritten.md`
- [ ] `docs/adr/ADR-0008-approval-policies-and-requests-two-table-design.md`
- [ ] `docs/adr/ADR-0009-payment-gateway-advisory-smoke-test.md`
- [ ] `docs/adr/ADR-0010-client-data-archived-before-deletion.md`

### 驗收

- [ ] 所有文件引用 Master System，不重新定義衝突架構
- [ ] Phase 0–10 編號在 Master System、Deployment Checklist、Master Checklist v2 完全一致
- [ ] Cursor Master Prompt（v1.2 Section 26）與 Deployment Plan 一致
- [ ] Known Conflicts Log 已更新（v1.2 Section 39）
- [ ] CHANGELOG 已更新
- [ ] 命名對照表已包含 Trigger.dev kebab-case vs DB snake_case 的說明

### No-Go

- 同一概念有兩種命名，且沒有說明原因（如 `create-wp-site` 和 `provision_client_os` 必須有 I 區對照說明）
- checklist 新增 Master System 未定義的核心架構
- Phase 編號不一致
- Cursor Prompt 和 Deployment Plan 不一致

```
Evidence:
- PR:
- Docs path:
- ADR paths (0001-0010):
- Known Conflicts Log updated:
- Reviewer:
- Decision: go | no_go
```

---

## 3. Phase 1 — Data Foundation Gate

### Supabase

- [ ] staging project 建立
- [ ] production project 建立
- [ ] staging / production credentials 完全分離
- [ ] `.env.example` 不含真實 secrets
- [ ] migration 可在 staging 完整跑通
- [ ] production migration 需要 `approval_request`
- [ ] `LOBSTER_ENABLE_DB_WRITES` 確認為 dev-only feature flag，production 環境不可使用此 flag 繞過正常 write flow

### Core Tables（必須存在）

- [ ] `organizations`
- [ ] `workspaces`
- [ ] `profiles`
- [ ] `organization_memberships`
- [ ] `workspace_memberships`
- [ ] `roles`
- [ ] `permissions`
- [ ] `role_permissions`
- [ ] `user_role_assignments`
- [ ] `service_accounts`
- [ ] `api_keys`
- [ ] `secret_references`
- [ ] `clients`
- [ ] `projects`
- [ ] `sites`
- [ ] `site_environments`
- [ ] `domains`
- [ ] `hosting_accounts`
- [ ] `packages`
- [ ] `package_versions`
- [ ] `manifests`
- [ ] `manifest_versions`
- [ ] `deployments`
- [ ] `workflow_runs`
- [ ] `package_install_runs`（⚠️ 在實作中已有 UUID 證據，必須正式列入 schema 文件）
- [ ] `operator_tasks`
- [ ] `approval_policies`
- [ ] `approval_requests`
- [ ] `incidents`
- [ ] `audit_logs`
- [ ] `mainwp_connections`
- [ ] `maintenance_policies`
- [ ] `maintenance_runs`
- [ ] `smoke_test_results`
- [ ] `handoff_reports`

### Long-term Tables（對應 v1.2 C7 migration 0010–0015）

- [ ] `idempotency_keys`（migration 0012）
- [ ] `resource_locks`（migration 0012）
- [ ] `restore_runs`（migration 0011）
- [ ] `plugin_registry`（migration 0013）
- [ ] `plugin_licenses`（migration 0013）
- [ ] `dns_records`（migration 0014，補強版 domains）
- [ ] `client_offboarding_runs`（migration 0015）
- [ ] `cost_entries`
- [ ] `profitability_snapshots`
- [ ] `release_freezes`（migration 0010）

### Schema Rules

- [ ] 所有核心 table 有 `id uuid primary key`
- [ ] 所有 tenant-bound table 有 `organization_id NOT NULL`
- [ ] 重要 table 有 `created_at timestamptz`
- [ ] 可修改 table 有 `updated_at timestamptz`
- [ ] enum-like 欄位有 check constraint 或 Postgres enum
- [ ] FK 有明確 `on delete` 策略（不可預設 cascade 在危險關聯上）
- [ ] 不儲存 raw secrets，只儲存 `secret_ref`（指向 secrets manager）

### RLS Gate

- [ ] 所有 tenant-bound tables 啟用 RLS
- [ ] agency staff 跨 client scope 需要 role
- [ ] client user 只能看到自己的 scope
- [ ] service role 僅 backend 使用，前端不可觸及
- [ ] RLS 測試通過（含 cross-tenant 存取測試）

```
Evidence:
- Migration PR:
- Migration files (0001–0015):
- Supabase project URL:
- Test output:
- RLS cross-tenant test:
- package_install_runs table confirmed:
- Reviewer:
- Decision: go | no_go
```

---

## 4. Phase 2 — Package / Manifest Gate

### Required Packages（對應 v1.2 Section 9）

- [ ] `wp-basic@1.0.0`（⚠️ 必須在 Phase 22 First Client 之前建立完成）
- [ ] `wp-business@1.0.0`
- [ ] `wc-core@1.0.0`（技術上先建，客戶部署順序仍為第三）
- [ ] `client-os-basic@1.0.0`

### Manifest Required Fields

- [ ] `name`
- [ ] `version`（semver 格式）
- [ ] `target`（e.g. `wordpress`）
- [ ] `risk_level`（`low` | `medium` | `high` | `critical`）
- [ ] `theme`
- [ ] `plugins`（含 `slug`、`required`、`version`）
- [ ] `conditional_plugins`（含 `condition_expression`）
- [ ] `post_install`（有序步驟清單）
- [ ] `verification`（含 profile 和 checks 清單）
- [ ] `rollback`（含 `strategy` 和 `backup_required_before_apply`）
- [ ] `approval_required_for`（高風險項目清單）
- [ ] `deprecated`（boolean）

### Plugin Governance Validation

- [ ] JSON schema exists（可機器驗證 manifest 欄位）
- [ ] CI validates manifest schema on PR
- [ ] 每個 plugin slug 可在 `plugin_registry` 中查到
- [ ] banned 狀態 plugin 不可出現在任何 manifest
- [ ] restricted 狀態 plugin 需要對應 `approval_required_for` 設定
- [ ] conditional_plugins 有 `condition_expression`
- [ ] rollback policy 存在且可執行

### wc-core 特別規則（對應 v1.2 Section 9.4 修正）

- [ ] `wc-core` smoke test profile 不含 `payment_gateway_configured` 作為必過項
- [ ] `payment_gateway_status` 是 advisory check（`not_configured` | `pending_approval` | `configured` | `failed`）
- [ ] `checkout_page` HTTP 200 是必過項
- [ ] `crm_webhook_active` 是必過項

```
Evidence:
- wp-basic.json path:
- wp-business.json path:
- wc-core.json path:
- JSON schema path:
- CI output:
- plugin_registry records:
- payment_gateway_status advisory test:
- Reviewer:
- Decision: go | no_go
```

---

## 5. Phase 3 — Provider Adapter Gate

### Required Adapters（對應 v1.2 Section 10）

- [ ] `wordpress-generic`（可自動）
- [ ] `manual-task`（fallback，產生 `operator_task`）
- [ ] `hostinger` placeholder
- [ ] `siteground` placeholder
- [ ] `cloudways` placeholder
- [ ] `shopify-future` placeholder（可空實作，但介面必須存在）
- [ ] `webflow-future` placeholder（可空實作，但介面必須存在）

### Contract Tests（每個 adapter 必須通過同一套）

- [ ] `supportsAutoProvisioning()` 回傳 boolean
- [ ] `createOrRegisterSite()` 回傳 valid status（`created` | `registered` | `manual_required` | `failed`）
- [ ] 不支援自動化的 provider 回傳 `manual_required`，不 throw
- [ ] provider failure 建立 `operator_task`，不中斷 workflow
- [ ] `applyManifest()` 回傳包含 `logs: string[]` 的物件
- [ ] `runVerification()` 回傳包含 `passed: boolean` 的物件
- [ ] errors 已 sanitize（不含 raw secrets、不含 stack trace 給客戶）
- [ ] secrets never logged

### Idempotency

- [ ] `createOrRegisterSite` 使用 idempotency key
- [ ] `applyManifest` 使用 idempotency key
- [ ] `registerMonitoring` 使用 idempotency key
- [ ] `sendHandoffEmail` 使用 idempotency key
- [ ] `createInvoice` 使用 idempotency key
- [ ] key 格式符合 v1.2 Section 31.2 規範：`{workflow_name}:{site_id}:{step_name}:{manifest_version}`
- [ ] 重複 key 不觸發重複操作（idempotent behavior 有測試覆蓋）
- [ ] key 有 `expires_at`（避免永久佔用）

```
Evidence:
- Adapter files:
- Contract test output:
- Manual fallback operator_task ID:
- Idempotency test output:
- Reviewer:
- Decision: go | no_go
```

---

## 6. Phase 4 — One-click Client OS Workflow Gate

### Required Workflows（對應 v1.2 Phase 4）

- [ ] `provision_client_os`（Trigger.dev: `create-wp-site`）
- [ ] `apply_manifest`（Trigger.dev: `apply-manifest`）
- [ ] `install_mainwp_child`
- [ ] `connect_mainwp`
- [ ] `register_monitoring`
- [ ] `run_smoke_tests`
- [ ] `generate_handoff_report`

### Workflow Run Required Fields（對應 v1.2 Section 12）

- [ ] `run_id`（uuid）
- [ ] `organization_id`
- [ ] `workspace_id`
- [ ] `client_id`
- [ ] `project_id`
- [ ] `site_id`
- [ ] `environment_id`
- [ ] `actor_type`（`human` | `agent` | `scheduler` | `webhook`）
- [ ] `trigger_type`（`manual` | `automatic` | `retry` | `rollback`）
- [ ] `input_snapshot`（immutable snapshot of input at time of run）
- [ ] `output_snapshot`（result snapshot）
- [ ] `artifacts`（JSON array of artifact references）
- [ ] `tool_versions`（每個工具的版本快照）
- [ ] `status`（`pending` | `running` | `completed` | `failed` | `rolled_back`）
- [ ] `started_at`
- [ ] `ended_at`
- [ ] `cost`（此次 run 的成本估算）
- [ ] `approval_request_id`（applicable 時）
- [ ] `incident_id`（failed 時）
- [ ] `decision_id`（Decision Engine 觸發時）
- [ ] `rollback_ref`（rollback 存在時）

### Artifact Storage Gate（對應 v1.2 Section 30 + MASTER_CHECKLIST v2 B5）

- [ ] `localArtifactSink` 可在本機儲存 artifacts
- [ ] `remotePutArtifactSink` 可上傳至遠端（Object Storage / S3-compatible）
- [ ] `artifactMode.ts` 可依環境變數切換 local / remote
- [ ] presign broker 介面已定義（`PRESIGN_BROKER_MINIMAL.md`）
- [ ] artifact 不含 raw secrets
- [ ] artifact 有 `logs_ref` 欄位
- [ ] artifact URL 關聯到 `workflow_run_id`

### Safety

- [ ] high-risk workflow 執行前取得 `resource_lock`
- [ ] lock 取得失敗建立 `operator_task`，不 throw
- [ ] retry limit 存在（不可無限 retry）
- [ ] failure 建立 `incident` 或 `operator_task`
- [ ] manual provider fallback 可正常運作
- [ ] production action 需要 `approval_request`
- [ ] workflow 可在 manual task 完成後 resume

### Handoff Report

- [ ] structured JSON exists（對應 v1.2 Section 8.1 欄位）
- [ ] 不含 secrets
- [ ] 含 `package` + `version`
- [ ] 含 `provider`
- [ ] 含 `site_url` 和 `admin_url`
- [ ] 含 `mainwp_connected` 和 `mainwp_site_id`
- [ ] 含 `monitoring` status
- [ ] 含 `smoke_tests` 結果
- [ ] 含 `maintenance_plan` 和 `next_maintenance`
- [ ] 含 `status`（`delivered` 等）
- [ ] stored as artifact（linked to `workflow_run_id`）

```
Evidence:
- Workflow run ID:
- package_install_run ID:
- Handoff report URL:
- Artifact storage test:
- Manual fallback operator_task ID:
- Failure test incident/operator_task ID:
- Reviewer:
- Decision: go | no_go
```

---

## 7. Phase 5 — n8n Lightweight Automation Gate

### Required n8n Flows（對應 v1.2 Phase 5）

- [ ] `client_onboarding_notification`
- [ ] `handoff_report_email`
- [ ] `monthly_report_send`
- [ ] `crm_lead_sync`
- [ ] `mainwp_status_sync`
- [ ] `uptime_alert_notify`
- [ ] `workflow_failure_notify`

### Safety

- [ ] n8n 不執行 high-risk production deploy
- [ ] n8n 不直接改 DNS
- [ ] n8n 不直接改 payment gateway
- [ ] n8n credentials 使用 secrets manager 或 n8n 內建 credentials
- [ ] n8n logs 不包含 secrets
- [ ] 每個 n8n flow 有對應 `workflow_run`、`event` 或明確 log record
- [ ] failure notification 不會遞迴觸發自己（loop guard）
- [ ] n8n workflow exports committed to GitHub（`infra/n8n/exports/`）

```
Evidence:
- n8n export path:
- Test webhook result:
- Notification screenshot:
- Failure test output:
- Loop guard test:
- Reviewer:
- Decision: go | no_go
```

---

## 8. Phase 6 — MainWP Maintenance Gate

### Deployment（對應 v1.2 Section 4.2 修正）

- [ ] MainWP Dashboard **不在**客戶自有 hosting 帳號內
- [ ] Dashboard 有 2FA 啟用
- [ ] Dashboard 有 backup
- [ ] Dashboard 有 Cloudflare Access 或同等 access protection
- [ ] Dashboard admin 不共用帳號
- [ ] Dashboard 不與任何客戶 production site 混用

### Connection

- [ ] 測試站已安裝 MainWP Child
- [ ] `mainwp_connections` table 存在
- [ ] `mainwp_site_id` 寫回 Supabase
- [ ] connection status 可同步
- [ ] disconnected site 建立告警
- [ ] MainWP sync failure 建立 `incident` 或 `operator_task`

### Maintenance

- [ ] `maintenance_policies` 存在（含 SLA 等級：basic / standard / pro / enterprise）
- [ ] `maintenance_runs` 存在
- [ ] low risk update 可自動記錄
- [ ] high risk update 需要 `approval_request`
- [ ] WooCommerce production update 需 staging 測試 + `approval_request`
- [ ] 維護報告可產生並關聯 `maintenance_run_id`

```
Evidence:
- MainWP site ID:
- Supabase mainwp_connections record:
- Maintenance run ID:
- Approval request for high-risk update:
- Report URL:
- Reviewer:
- Decision: go | no_go
```

---

## 9. Phase 7 — Observability OS Gate

### Required Ingestion Sources（對應 v1.2 Section 13.1）

- [ ] Sentry webhook ingestion
- [ ] Uptime monitoring webhook ingestion
- [ ] PostHog events
- [ ] MainWP status sync
- [ ] Trigger.dev failed run ingestion
- [ ] n8n failed run ingestion
- [ ] Netdata alert ingestion **僅限自管伺服器存在時**（純 SaaS MVP 不必實作）

### Incident Pipeline（對應 v1.2 Section 13.2 state machine）

- [ ] Detect（信號入庫）
- [ ] Normalize（統一格式）
- [ ] Enrich context（關聯 site / client / workflow）
- [ ] Classify severity（low / medium / high / critical）
- [ ] Create / update incident
- [ ] Notify（Slack / Email / LINE 依 SLA）
- [ ] Create runbook 或 `operator_task`
- [ ] Verify after fix
- [ ] Close with postmortem entry

### Severity Tests

- [ ] homepage down → `high` incident
- [ ] checkout down → `critical` incident
- [ ] Sentry workflow failure → incident
- [ ] SSL expiry < 14 days → `high` incident
- [ ] form failure → `medium` incident
- [ ] Netdata not required for pure SaaS MVP（明文驗證此假設）

```
Evidence:
- Sentry issue ID:
- Uptime alert ID:
- Incident ID:
- Notification screenshot:
- Severity classification test output:
- Reviewer:
- Decision: go | no_go
```

---

## 10. Phase 8 — Approval and Governance Gate

### Required Tables

- [ ] `approval_policies`
- [ ] `approval_requests`
- [ ] `approval_decisions`（optional，多人審批時用）
- [ ] `audit_logs`
- [ ] `tool_policies`
- [ ] `release_freezes`

### Policy Tests（對應 v1.2 Section 14.2）

- [ ] low risk → auto allowed + log
- [ ] medium risk → backup check + log
- [ ] high risk → `approval_request` required + backup + staging + rollback plan
- [ ] critical risk → manual only + explicit irreversible declaration
- [ ] rejected `approval_request` blocks workflow
- [ ] expired `approval_request` blocks workflow
- [ ] `approval_decision` creates `audit_log`
- [ ] production deploy blocked without `approval_request`
- [ ] WooCommerce checkout change blocked without `approval_request`
- [ ] DNS change blocked without `approval_request`
- [ ] payment gateway change blocked without `approval_request`
- [ ] destructive DB migration 永遠不可 auto-run

### Agent Tool Policy（對應 v1.2 Section 14.3）

- [ ] `site-builder-agent` 不可 production launch without approval
- [ ] `repair-agent` 不可讀 raw secrets
- [ ] `repair-agent` 不可 deploy production
- [ ] `repair-agent` 不可 destructive DB migration
- [ ] `content-agent` 不可 bulk publish high-risk content without policy
- [ ] `support-agent` 必須 escalate legal / refund / threat / high-value churn
- [ ] `seo-agent` bulk production SEO change 需要 approval

```
Evidence:
- Approval request ID:
- Rejection test output:
- Audit log record:
- Tool policy test output:
- Release freeze test:
- Reviewer:
- Decision: go | no_go
```

---

## 11. Phase 9 — Admin and Client Portal Gate

### Admin Required Views

- [ ] Clients
- [ ] Projects
- [ ] Sites
- [ ] Packages（含版本歷史）
- [ ] Manifests（含版本歷史）
- [ ] Workflow Runs
- [ ] Package Install Runs
- [ ] Operator Tasks
- [ ] Incidents（含 severity / state）
- [ ] Approval Requests
- [ ] Maintenance Runs
- [ ] Reports
- [ ] Costs
- [ ] Recommendations

### Client Portal MVP Views

- [ ] Handoff report
- [ ] Maintenance report
- [ ] Site status
- [ ] Support ticket
- [ ] Invoice
- [ ] Knowledge base

### UI Safety

- [ ] client user 不可看到其他 client 的資料（RLS verified）
- [ ] destructive 按鈕需要 confirmation dialog
- [ ] high-risk 按鈕觸發 approval flow，不直接執行
- [ ] raw secrets 不可顯示在任何 UI（含 admin）
- [ ] internal stack trace 不可顯示給 client
- [ ] 重要 UI 操作有 `audit_log`

```
Evidence:
- Admin screenshots:
- Client portal screenshots:
- RLS cross-tenant test:
- UI action audit log ID:
- Reviewer:
- Decision: go | no_go
```

---

## 12. Phase 10 — Decision Engine v1 Gate

### Scores（對應 v1.2 Section 25.1）

- [ ] `client_health_score`（0–100，含扣分邏輯：incident / overdue / SSL / backup）
- [ ] `site_risk_score`（0–100，越高越危險，含 WooCommerce / pending updates）
- [ ] `maintenance_cost_score`
- [ ] `incident_frequency_score`
- [ ] `upsell_score`（含流量 / CRM / email automation 評估）
- [ ] `churn_risk_score`（含報告未讀 / 發票逾期 / 支票未回）
- [ ] `profitability_score`（來自 `profitability_snapshots`）

### Recommendations（對應 v1.2 Section 25.2）

- [ ] `upsell`（含 `estimated_revenue_impact`）
- [ ] `upgrade`
- [ ] `risk_alert`
- [ ] `churn_prevention`
- [ ] `maintenance`
- [ ] `cost_review`（margin_rate ≤ 0 時觸發）
- [ ] `hosting_upgrade`

### Guardrails（Decision Engine 絕對不可自動）

- [ ] 刪除任何資料
- [ ] 升級 WooCommerce production
- [ ] 更改付款閘道
- [ ] 發送大量 email
- [ ] 更改 DNS
- [ ] 更改 role / permission
- [ ] 讀取 raw secrets
- [ ] `auto_execute: false` 是所有 recommendation 的預設值

```
Evidence:
- Score calculation test output:
- Recommendation record ID:
- Guardrail test output（確認 auto_execute 永遠 false）:
- Reviewer:
- Decision: go | no_go
```

---

## 13. Cross-Phase Traceability Matrix

> 確認 v1.2 每個 Section 都有對應的 Checklist 驗收覆蓋。

| Master v1.2 Section | 說明 | Checklist 覆蓋 | Status |
|---|---|---|---|
| Section 0 | 定案 | Checklist 0–1 | [ ] |
| Section 1 | 30 年穩定 | Checklist 1, 18, 16 | [ ] |
| Section 3 | Tool Positioning | Checklist 5, 7, 9 | [ ] |
| Section 4 | Cloud-first Deployment | Checklist 3, 5, 8 | [ ] |
| Section 5 | Core Objects | Checklist 3 | [ ] |
| Section 6 | Modular Design | Checklist 18 | [ ] |
| Section 8 | One-click Flow | Checklist 6 | [ ] |
| Section 9 | Packages | Checklist 4 | [ ] |
| Section 10 | Provider Adapter | Checklist 5 | [ ] |
| Section 11 | Workflow Routing | Checklist 7 | [ ] |
| Section 12 | Run Model | Checklist 6 | [ ] |
| Section 13 | Observability | Checklist 9 | [ ] |
| Section 14 | Governance | Checklist 10 | [ ] |
| Section 15 | Data OS | Checklist 3 | [ ] |
| Section 17 | Deployment Phases | Checklist 2–12 | [ ] |
| Section 19 | Versioning & Deprecation | Checklist 1.4 | [ ] |
| Section 20 | Maintenance SLA | Checklist 8, 17 | [ ] |
| Section 21 | Backup / Migration | Checklist 16 | [ ] |
| Section 22 | Security | Checklist 1, 10, 11 | [ ] |
| Section 25 | Decision Engine | Checklist 12 | [ ] |
| Section 28 | Canonical Naming | Checklist 1.1, 2 | [ ] |
| Section 29 | Environment Release | Checklist 14 | [ ] |
| Section 30 | Backup & DR | Checklist 16 | [ ] |
| Section 31 | Idempotency & Locking | Checklist 3, 5, 6 | [ ] |
| Section 32 | Plugin Governance | Checklist 4 | [ ] |
| Section 33 | Domain / DNS / Email | Checklist 15 | [ ] |
| Section 34 | Testing Strategy | Checklist 17 | [ ] |
| Section 35 | Client Lifecycle | Checklist 18 | [ ] |
| Section 36 | Cost & Profitability | Checklist 12, 19 | [ ] |
| Section 37 | Communication Policy | Checklist 20 | [ ] |
| Section 38 | ADR | Checklist 2 | [ ] |
| Section 39 | Known Conflicts Log | Checklist 2 | [ ] |

---

## 14. Environment and Release Gate

- [ ] local environment 可運行完整 validate 命令
- [ ] staging environment 可運行完整 workflow
- [ ] production environment 存在但受保護（approval required）
- [ ] pilot_client 環境或 flag 存在
- [ ] sandbox 環境存在（demo / 測試用，無收費）
- [ ] staging 和 production credentials 完全分離
- [ ] `LOBSTER_ENABLE_DB_WRITES` 僅在 staging/local 使用，production 環境不可設定此 flag
- [ ] 環境晉升路徑已文件化：local → staging → pilot_client → production
- [ ] local tests passed
- [ ] PR reviewed（含 schema impact / workflow impact）
- [ ] staging deploy passed
- [ ] internal QA passed
- [ ] pilot client `approval_request` approved（如 applicable）
- [ ] production `approval_request` approved
- [ ] rollback plan attached to `approval_request`
- [ ] monitoring watch window defined（部署後監控窗口）
- [ ] 無 active `release_freeze`
- [ ] 無 high / critical unresolved incident
- [ ] campaign / launch day / sale period excluded
- [ ] high-risk production action 前確認 `release_freezes` table

```
Evidence:
- Staging deploy log:
- Production approval_request ID:
- Release freeze check output:
- Rollback plan URL:
- Reviewer:
- Decision: go | no_go
```

---

## 15. Domain, DNS, and Email Gate

### Domain（對應 v1.2 Section 33）

- [ ] domain 已登錄至 `domains` table
- [ ] registrar 已記錄
- [ ] DNS provider 已記錄
- [ ] expiry date 已記錄
- [ ] expiry alert 在 60 天前自動觸發（`monitoring_checks`）
- [ ] SSL status 已記錄（`ssl_status` 欄位）
- [ ] SSL alert 在 30 天 / 14 天前分別觸發

### DNS

- [ ] A / CNAME records 已記錄至 `dns_records`
- [ ] MX records 已記錄
- [ ] TXT records 已記錄（含 SPF / DKIM / DMARC）
- [ ] DNS 變更需要 `approval_request`（high risk）
- [ ] production DNS 變更不可 auto-run
- [ ] DNS 變更有 `audit_log`

### Email Deliverability

- [ ] SPF configured + status 記錄（`spf_status`）
- [ ] DKIM configured + status 記錄（`dkim_status`）
- [ ] DMARC configured + status 記錄（`dmarc_status`）
- [ ] SMTP provider 記錄（`smtp_configs`）
- [ ] `email_auth_status` 欄位值：`configured` | `partial` | `none` | `failed`
- [ ] email sending domain 變更需要 `approval_request`

```
Evidence:
- domains table record ID:
- dns_records table count:
- email_auth_status value:
- Expiry alert test output:
- Reviewer:
- Decision: go | no_go
```

---

## 16. Backup, Restore, and DR Gate

### Backup（對應 v1.2 Section 30）

- [ ] backup policy 存在（關聯 maintenance_policy SLA 等級）
- [ ] backup provider 已記錄
- [ ] backup 頻率符合 maintenance plan（basic: daily / pro: daily + weekly full）
- [ ] backup status 可查
- [ ] medium / high risk 操作前需確認備份
- [ ] backup artifact reference 已儲存（`backup_checks`）

### Restore（備份必須能還原）

- [ ] restore 程序已文件化（`docs/BACKUP_DR_POLICY.md`）
- [ ] restore test 已通過（至少 staging 環境）
- [ ] `restore_run` 記錄存在（含 `status` / `rto_minutes` / `rpo_minutes`）
- [ ] RTO 已記錄（對應 SLA 等級：basic=48h / standard=24h / pro=8h）
- [ ] RPO 已記錄（對應 SLA 等級：basic=24h / standard=24h / pro=12h）
- [ ] WooCommerce restore 含 checkout verification
- [ ] restore 失敗建立 `incident`

### DR

- [ ] DR runbook 存在（`templates/runbooks/`）
- [ ] DR owner 已指定
- [ ] DR test cadence 已定義（basic: 每季 / pro: 每月）
- [ ] enterprise-custom 有 contract 定義的 RTO / RPO

```
Evidence:
- restore_run ID:
- Restore test output:
- RTO/RPO values:
- DR runbook path:
- Reviewer:
- Decision: go | no_go
```

---

## 17. Testing Strategy Gate

### Unit Tests（對應 v1.2 Section 34.2）

- [ ] approval policy evaluator
- [ ] manifest parser（欄位驗證、版本格式、plugin slug 查找）
- [ ] provider adapter logic（supportsAutoProvisioning 判斷）
- [ ] decision score calculator（每個評分維度的 edge case）
- [ ] idempotency key generator（格式符合 v1.2 Section 31.2）
- [ ] cost entry allocator（`billed_to` 分類邏輯）

### Integration Tests（對應 v1.2 Section 34.3）

- [ ] Supabase insert / read
- [ ] RLS cross-tenant isolation
- [ ] Trigger.dev workflow step execution
- [ ] n8n webhook trigger / response
- [ ] Sentry incident webhook ingestion
- [ ] PostHog event capture
- [ ] MainWP connection 建立與 site_id 回寫 Supabase

### Contract Tests（對應 v1.2 Section 34.4）

- [ ] `ProviderAdapter` contract（所有實作 adapter 必須通過）
- [ ] `MonitoringProvider` contract
- [ ] `EmailProvider` contract
- [ ] `MainWP` connector contract

### E2E Tests（對應 v1.2 Section 34.5）

- [ ] create client → project → site
- [ ] select wp-basic → apply manifest
- [ ] register monitoring
- [ ] run smoke tests（basic profile）
- [ ] generate handoff report
- [ ] trigger incident（homepage down simulation）
- [ ] create runbook
- [ ] request approval → approve → execute
- [ ] failure path → operator_task created

```
Evidence:
- Unit test coverage output:
- Contract test output:
- E2E test output:
- Reviewer:
- Decision: go | no_go
```

---

## 18. Client Lifecycle and Offboarding Gate

### States（對應 v1.2 Section 35.1）

- [ ] `active` 狀態可設定
- [ ] `paused` 狀態可設定（服務暫停，資料保留）
- [ ] `offboarding` 狀態可設定（觸發 offboarding workflow）
- [ ] `archived` 狀態可設定（工具停用，資料封存）
- [ ] `export_ready` 狀態可設定
- [ ] `deleted` 僅在法律要求或客戶明確書面要求時可設定

### Offboarding Steps（對應 v1.2 Section 35.2，步驟不可跳過）

- [ ] 匯出所有客戶資料（site / CRM / report / invoice）
- [ ] `data_exported: true` 記錄至 `client_offboarding_runs`
- [ ] 撤銷所有 secrets（`secrets_revoked: true`）
- [ ] 從 MainWP Dashboard 移除站連線（`mainwp_disconnected: true`）
- [ ] 停用所有 monitoring checks（`monitoring_disabled: true`）
- [ ] 停用所有 scheduled workflows（`workflows_stopped: true`）
- [ ] 產生最終 offboarding report（`final_report_url` 填入）
- [ ] 客戶確認（`client_confirmed: true`）
- [ ] archive（資料不刪除）
- [ ] `audit_log` 記錄整個 offboarding 過程

```
Evidence:
- client_offboarding_run ID:
- Export URL:
- Secrets revoked confirmation:
- MainWP disconnected confirmation:
- Final report URL:
- Reviewer:
- Decision: go | no_go
```

---

## 19. Cost and Profitability Gate

### Cost Capture（對應 v1.2 Section 36.1）

- [ ] `ai_token` 成本記錄
- [ ] `hosting` 成本記錄（按客戶分攤）
- [ ] `plugin_license` 成本記錄
- [ ] `automation_run` 成本記錄（n8n / Trigger.dev）
- [ ] `human_operator` 成本記錄
- [ ] `monitoring` 成本記錄
- [ ] `support` 成本記錄
- [ ] `incident` 成本記錄
- [ ] `saas_tool` 成本記錄
- [ ] `billed_to` 欄位值：`agency` | `client` | `shared`

### Profitability（對應 v1.2 Section 36.3）

- [ ] 每月 `profitability_snapshot` 計算
- [ ] `revenue` 已記錄
- [ ] `cost` 已記錄
- [ ] `gross_margin` = revenue - cost
- [ ] `margin_rate` = gross_margin / revenue
- [ ] `score` 0–100 依 margin_rate 計算
- [ ] `margin_rate <= 0`（虧損）→ 自動產生 `cost_review` recommendation
- [ ] `cost_review` recommendation 不可 auto-execute

```
Evidence:
- cost_entries sample records:
- profitability_snapshot ID:
- cost_review recommendation ID:
- auto_execute: false confirmed:
- Reviewer:
- Decision: go | no_go
```

---

## 20. Client Communication Gate

### Notification Templates（對應 v1.2 Section 37）

- [ ] `maintenance-scheduled.md` 存在（`templates/client-notifications/`）
- [ ] `incident-opened.md` 存在
- [ ] `incident-resolved.md` 存在
- [ ] `approval-request.md` 存在
- [ ] `handoff-report.md` 存在
- [ ] `monthly-report.md` 存在
- [ ] `domain-expiry-warning.md` 存在
- [ ] `offboarding-confirmation.md` 存在

### Template Rules

- [ ] 所有模板有 `template_id`、`version`、`channel`、`variables` 定義
- [ ] 模板已 version controlled（committed to GitHub）
- [ ] 模板不含 secrets
- [ ] 模板不含 raw stack traces
- [ ] 模板不洩漏其他客戶資料
- [ ] 通知事件有 `audit_log` 或 event record

### Notification Matrix 覆蓋

- [ ] `basic` tier 通知項目已確認
- [ ] `commerce` tier 立即通知（checkout down）已確認
- [ ] `enterprise` tier 客製化通知流程已確認

```
Evidence:
- Template file paths:
- Template version in git:
- Notification test output:
- Reviewer:
- Decision: go | no_go
```

---

## 21. Go / No-Go Final Gate

### Go Criteria（全部為 true 才可 go）

- [ ] Phase 0–4 全部 approved
- [ ] MVP first client flow passed（wp-basic）
- [ ] `workflow_run` created
- [ ] `package_install_runs` status flow confirmed
- [ ] `handoff_report` generated and stored
- [ ] MainWP connected（`mainwp_site_id` in Supabase）
- [ ] uptime monitor enabled
- [ ] smoke tests passed（basic profile）
- [ ] failure path tested（incident / operator_task created）
- [ ] approval gate tested（rejection blocks execution）
- [ ] incident path tested（created + notified）
- [ ] secrets redaction tested（不出現在 log / event）
- [ ] rollback plan tested or documented
- [ ] idempotency test passed（重複 trigger 不重複執行）
- [ ] resource lock test passed（並發 high-risk 被阻止）

### Any One Is No-Go（任何一條為 true 則不可 go）

- [ ] production action 可在無 `approval_request` 下執行
- [ ] secrets 出現在 logs / AI context / handoff report
- [ ] client 可看到另一個 client 的資料（RLS failure）
- [ ] workflow failure 不建立 `incident` 或 `operator_task`
- [ ] high-risk action 無 rollback plan 且未標 `non_reversible`
- [ ] external side-effect 無 idempotency key
- [ ] 新版 package 覆蓋舊版（沒有版本化）
- [ ] high-risk action 無 `audit_log`
- [ ] MainWP Dashboard 部署在客戶自有 hosting 帳號
- [ ] Netdata 在純 SaaS MVP 中被列為必裝
- [ ] `payment_gateway_configured` 是 wc-core 必過 smoke test
- [ ] `LOBSTER_ENABLE_DB_WRITES` 在 production 環境被設定
- [ ] 同一 site 可同時跑兩個 high-risk workflow

```
Evidence:
- Go criteria test output:
- No-go scenario test output:
- Reviewer:
- Final Decision: go | no_go
```

---

## 22. First Client Deployment Gate

### 前置確認（必須在部署前完成）

- [ ] `wp-basic.json` manifest 存在（`packages/manifests/wp-basic.json`）
- [ ] `wp-basic@1.0.0` 已在 `packages` / `package_versions` table 登錄
- [ ] `plugin_registry` 中 wp-basic 所有 plugin slug 已存在
- [ ] offboarding runbook 存在（知道如何安全退出此客戶）
- [ ] client communication template 存在（至少 `handoff-report.md`）

### Scope 限制

- [ ] Package: `wp-basic`（risk: low）
- [ ] Provider: generic WordPress / Hostinger / SiteGround / Cloudways
- [ ] No WooCommerce
- [ ] No payment gateway
- [ ] No production DNS automation
- [ ] No high-risk plugin

### Validation

- [ ] client created
- [ ] project created
- [ ] site created
- [ ] package selected（wp-basic）
- [ ] WordPress connected
- [ ] MainWP connected（`mainwp_site_id` written back）
- [ ] uptime monitor enabled
- [ ] SSL monitor enabled
- [ ] smoke test passed（basic profile all green）
- [ ] handoff report generated（structured JSON）
- [ ] maintenance plan active（basic-monthly）
- [ ] monthly report schedule created

```
Evidence:
- Client ID:
- Project ID:
- Site ID:
- Workflow Run ID:
- package_install_run ID:
- MainWP Site ID:
- Monitor ID:
- Handoff Report URL:
- wp-basic.json path:
- offboarding runbook path:
- Reviewer:
- Decision: go | no_go
```

---

## 23. Plugin Governance Gate

### Plugin Registry

- [ ] `plugin_registry` table 存在且有記錄
- [ ] 所有 manifest 中的 plugin slug 在 registry 中存在
- [ ] 每個 plugin 有 `risk_level`（`low` | `medium` | `high` | `critical`）
- [ ] 每個 plugin 有 `status`（`approved` | `conditional` | `restricted` | `deprecated` | `banned`）
- [ ] payment / checkout / membership / security 類別 plugin 標為 `restricted` 或以上

### Plugin License

- [ ] `plugin_licenses` table 存在
- [ ] 付費 plugin 有授權記錄
- [ ] license key 儲存為 `secret_ref`（不明文）
- [ ] license `expires_at` 有設定（並有告警）
- [ ] license `current_activations` 不超過 `max_activations`

### Deprecation

- [ ] deprecated plugin 不可出現在新 manifest
- [ ] deprecated plugin 的舊站有升級計畫記錄

```
Evidence:
- plugin_registry record count:
- plugin_licenses records:
- License expiry alert test:
- Reviewer:
- Decision: go | no_go
```

---

## 24. Checklist Maintenance Rules

- [ ] checklist 本身必須版本化（每次修改更新版本號）
- [ ] checklist 版本號與 MASTER_DEPLOYMENT_SYSTEM 版本對應記錄在 header
- [ ] checklist 更新必須引用 Master System 對應章節
- [ ] checklist 不可新增 Master System 未定義的核心架構
- [ ] checklist 可以新增 gate、evidence、QA、驗收 items
- [ ] checklist 不可改變 tool positioning
- [ ] checklist 不可改變 canonical naming（改名必須先更新 Master System）
- [ ] checklist 不可改變 risk policy
- [ ] checklist 修改需更新 CHANGELOG（`docs/CHANGELOG.md`）
- [ ] checklist 修改需更新 Known Conflicts Log（若有新發現衝突）
- [ ] 每個 Phase 完成時 review
- [ ] 每個 production launch 前 review
- [ ] 每個 high / critical incident 後 review
- [ ] 每季 review 一次完整 checklist
- [ ] 每年 review 一次 30 年穩定性假設（工具是否仍存在、SLA 是否仍合理）

---

## 24A. Deployment Profile Identification Gate

> **每次部署開始前必須先確認 Profile。** 不同 Profile 有完全不同的 workflow、manifest 模式、風險等級。對應 v1.3 Master Section 41。

> **命名提示（2026-05-03 定案）：** 本節「AO-agent」＝**Profile A**。若需區分「整體 Aware Wave + Lobster 客戶交付」與「路由標籤」，只讀 [`ONE_CLICK_BUILD_SYSTEM.md`](ONE_CLICK_BUILD_SYSTEM.md) §1.1，勿在本檔重複長文。

### Profile 識別（必選一）

- [ ] 已確認此次部署的 Profile：
  - [ ] **Profile A**：AO-agent（部署你自己公司的控制平面工具）
  - [ ] **Profile B**：新客戶（從零開始，無現有 WordPress）
  - [ ] **Profile C**：已有 WordPress 客戶（現有站接管/遷移）
- [ ] `sites.site_type` 已正確設定（`ao_internal` | `new_client` | `existing_wp`）
- [ ] `sites.apply_mode` 已正確設定（`internal_setup` | `full_install` | `adopt_delta`）
- [ ] manifest 的 `apply_mode` 欄位與 `sites.apply_mode` 一致

---

### Profile A Gate（AO-agent 自架）

- [ ] 確認此部署目標是 Lobster Factory 自身工具，不是客戶網站
- [ ] **不使用** `provision_client_os` 或 `adopt_client_os` workflow
- [ ] **不產生** `handoff_report`（AO 部署是內部事）
- [ ] Netdata 已部署（有任何自管 VPS 就必須）
- [ ] MainWP Dashboard 確認不在客戶 hosting 帳號
- [ ] 所有 AO 工具連線確認：
  - [ ] Supabase (staging + production 分離)
  - [ ] GitHub Actions / CI
  - [ ] Trigger.dev
  - [ ] n8n (Cloud 或 VPS)
  - [ ] Sentry (可接收 error)
  - [ ] PostHog (可接收 event)
  - [ ] Uptime monitoring (監控 AO 工具自身)
  - [ ] Cloudflare Access (保護內部工具)
  - [ ] Secrets Manager (整合完成)

```
Evidence:
- AO tool connection test outputs:
- Netdata dashboard URL:
- MainWP not-in-client-hosting confirmation:
- Reviewer:
- Decision: go | no_go
```

---

### Profile B Gate（新客戶、全雲端）

- [ ] 確認客戶沒有現有 WordPress 站
- [ ] 使用 `provision_client_os` workflow（Trigger.dev job: `create-wp-site`）
- [ ] manifest `apply_mode: "full_install"`
- [ ] Provider adapter 已選定（或 fallback 到 `manual-task`）
- [ ] 無需 plugin 衝突檢查（全新安裝）
- [ ] 第一個客戶限制：僅用 `wp-basic`，不用 WooCommerce
- [ ] smoke test profile 與 package 對應：
  - `wp-basic` → `basic` profile
  - `wp-business` → `business` profile
  - `wc-core` → `woocommerce` profile（含 advisory payment_gateway_status）

```
Evidence:
- Confirmed no existing WordPress:
- Provider adapter selected:
- workflow_run ID:
- Reviewer:
- Decision: go | no_go
```

---

### Profile C Gate（已有 WordPress 客戶）

> ⚠️ **最高風險 Profile。** 現有真實內容與資料可能遺失。每個步驟都必須有 evidence 才能進下一步。

#### Step 1：前置確認

- [ ] 現有站 URL 可存取（HTTP 200）
- [ ] WP Admin 可存取
- [ ] `site_type = 'existing_wp'` 已設定
- [ ] `apply_mode = 'adopt_delta'` 已設定
- [ ] manifest 包含 `apply_mode: "adopt_delta"` 和 `adopt_rules` 物件
- [ ] 使用 `adopt_client_os` workflow（Trigger.dev job: `adopt-client-os`）

#### Step 2：強制備份（任何一項未完成 → 禁止繼續）

- [ ] 全站備份已完成（files + DB）
- [ ] `backup_checks` 記錄存在且 status = confirmed
- [ ] `backup_ref` 已寫入 Supabase
- [ ] 備份可還原（備份檔案大小合理、完整性確認）

#### Step 3：Adopt Audit

- [ ] `adopt_audits` 記錄已建立
- [ ] 現有 plugin 清單已掃描（含版本）
- [ ] 現有 theme 已掃描
- [ ] 現有 SMTP 設定已掃描
- [ ] 每個 manifest plugin 的 adopt status 已分類：
  - [ ] `safe_to_install`（不存在，可安全安裝）
  - [ ] `skip_install`（已有相同或更新版本）
  - [ ] `update_required`（已有但版本舊，需 approval_request）
  - [ ] `conflict`（有衝突，需 operator_task）
- [ ] `adopt_audit_report` 已產生並可查看

#### Step 4：Delta Manifest 套用

- [ ] 只安裝 `safe_to_install` 的 plugin
- [ ] 未動現有 theme（除非有 approval + 客戶同意書面）
- [ ] 未覆蓋現有有效 SMTP 設定
- [ ] `update_required` 項目已建立 `approval_request`
- [ ] `conflict` 項目已建立 `operator_task`
- [ ] `apply_manifest` log 顯示 installed / skipped 分類

#### Step 5：Adopt Smoke Tests（必過項 FAIL = 立即 rollback）

- [ ] `homepage_status_unchanged`（HTTP status 和主要內容未改變）
- [ ] `existing_content_count_unchanged`（文章/頁面/產品數量不變）
- [ ] `no_new_php_errors`（PHP error log 無新 critical error）
- [ ] `wp_admin_accessible`
- [ ] `ssl_valid`
- [ ] `existing_forms_still_functional`（若有表單）
- [ ] `mainwp_child_connected`
- [ ] `uptime_monitor_registered`
- [ ] **任何必過項 FAIL → rollback → critical incident 已建立**

#### Step 6：交付

- [ ] `handoff_report` 含 adopt_audit 摘要
- [ ] 客戶知道：哪些 plugin 新增、哪些跳過、哪些需人工處理
- [ ] `operator_tasks` 已告知客戶或內部排定

```
Evidence:
- adopt_audit ID:
- backup_ref:
- adopt_audit_items count (safe/skip/conflict breakdown):
- delta apply log (installed/skipped):
- adopt smoke test output:
- operator_tasks created (if any):
- handoff_report URL:
- Reviewer:
- Decision: go | no_go
```

---

## 25. Companion Document Sync Gate

> 確認三份 Single Source of Truth 文件保持一致。

| 文件 | 版本 | 最後確認日期 |
|---|---|---|
| `LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM` | v1.3 | |
| `LOBSTER_FACTORY_MASTER_CHECKLIST` | v2.0 | |
| `LOBSTER_FACTORY_DEPLOYMENT_CHECKLIST`（本文件）| v1.4 | |

### 同步確認項目

- [ ] Phase 0–10 編號在三份文件完全一致
- [ ] Canonical Naming 定義在三份文件完全一致
- [ ] `approval_policies` / `approval_requests` 命名在三份文件完全一致
- [ ] No-Go 條件在三份文件沒有矛盾
- [ ] MASTER_CHECKLIST v2 J 區的對齊進度與本 checklist gate 狀態一致
- [ ] `package_install_runs` 已同步更新至 Master System Section 15.4（待更新）
- [ ] Artifact storage pattern 已同步更新至 Master System Section 30（待更新）

```
Evidence:
- Last sync review date:
- Master System version confirmed:
- Master Checklist version confirmed:
- Conflicts found and logged:
- Reviewer:
```

---

## 26. Final Rule

```
Master System          = 設計與架構真相
Deployment Checklist   = 執行與驗收真相
Master Checklist v2    = 實作進度追蹤真相

三者缺一不可。三者必須一致。
```

任何部署任務必須同時滿足：

- Master System 沒衝突
- Checklist 有 evidence
- Phase Gate 通過
- High-risk 有 `approval_request`
- Failure 有 `incident` 或 `operator_task`
- Rollback 有計畫（或明標 `non_reversible`）
- Secrets 沒外洩
- Customer data 有 RLS 隔離
- Old version 沒被覆蓋（只 deprecate）
- New feature 可停用（module toggle）
- Idempotency key 存在於所有外部副作用操作
- Resource lock 存在於所有 high-risk site-level 操作
- `package_install_runs` 狀態流完整記錄
- Artifact storage mode 已確認（local / remote_put）
