# LOBSTER_FACTORY_CHECKLIST

> **版本：v3.0（合併版）**
> 對齊主文件：`LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md`
> 定位：**單一 Checklist 真相來源**——每天開工收工 + 每次部署驗收，全在這一份。
>
> **結構：**
> - **Part 1**：每天開工/收工（系統建置進度追蹤）
> - **Part 2**：永遠有效的不可妥協規則（隨時查）
> - **Part 3**：每次部署 Gate（有客戶要部署時用）

---

## 定案紀錄（2026-05-03）

與 `LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md`、`LOBSTER_FACTORY_DEPLOYMENT_CHECKLIST_v1.4.md`、`LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md` **同步**，不重貼全文：

| 項目 | 決議 |
|------|------|
| 命名 SSOT | [`ONE_CLICK_BUILD_SYSTEM.md`](ONE_CLICK_BUILD_SYSTEM.md) **v2.1 §1.1**（產品層 vs `Profile A\|B\|C`） |
| §41「AO-agent」 | 僅 **Profile A**；客戶路徑 **B/C** |
| Handoff | A：內部驗收；B/C：客戶 handoff（見 ONE_CLICK §3.12） |
| Master 補述 | `LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md` 頂部 **2026-05-03 定案補述** |

---

# PART 1：系統建置進度（每天開工/收工）

> 事件流程單一真相：開工以 `agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md` 為準；收工以 `agency-os/docs/operations/end-of-day-checklist.md` 為準。

## A) 全流程總覽

- [x] A1. 定義 Phase 1 範圍
- [x] A2. 建立多租戶 DB migration 基礎（core/factory/governance/RLS/seeds/catalog）
- [x] A3. 建立 manifest 規格與 `wc-core` 範本（注意：wc-core 先建是技術驗證；客戶部署順序仍依 v1.3：wp-basic → wp-business → wc-core）
- [x] A4. 建立 durable workflow 骨架（`create-wp-site`、`apply-manifest`）（命名說明見 I 區）
- [x] A5. 建立結構驗證與 fail-fast gate
- [x] A6. 串接 hosting provider adapter（`none` / `mock` / `provider_stub` / `http_json`）
- [ ] A7. WordPress 真正 provision/shell execution → v1.3 Phase 4
- [x] A8. 打通 DB 真寫入完整流程（`workflow_runs` / `package_install_runs`）
- [x] A9. artifacts / rollback / 錯誤回復 baseline
- [x] A10-1. E2E 營運劇本 + 結構閘道
- [ ] A10-2. 商業閉環：新客戶從建立→驗收 + 生產 Trigger 全鏈 → v1.3 Phase 4 + Section 8
- [ ] A11. 制度治理層（v1.3 新增 12 個制度章節）→ 見 C6、C7
- [ ] A12. Profile C 支援（已有 WordPress 客戶接管）→ 見 C8

## B) 已完成

### B1. DB / Catalog

- [x] `0001_core.sql` → v1.3 Section 15.1
- [x] `0002_factory.sql` → v1.3 Section 15.2
- [x] `0003_agents_approvals_observability.sql` → v1.3 Section 15.4-15.6
- [x] `0004_rls_helpers.sql` → v1.3 Section 22.3
- [x] `0005_seed_minimum.sql`
- [x] `0006_seed_catalog.sql`
- [x] `0007_v3_skeleton_modules.sql` → v1.3 Section 6.2
- [x] `0008_decision_engine_recommendations.sql` → v1.3 Section 25
- [x] `0009_cx_retention_upsell_baseline.sql` → v1.3 Section 6.2

> ⚠️ `package_install_runs` 表：已在實作中使用（有 UUID 證據），但 v1.3 Section 15.4 未正式列出。下次更新 Master System 時補入。

### B2. Manifest / API Types / Service

- [x] `packages/manifests/wc-core.json`（Phase 1 staging-only）
- [x] `apps/api/src/types/manifest.ts`
- [x] `apps/api/src/services/wp/wpFactory.ts`

> ❌ 待補：`wp-basic.json`（第一個客戶部署前必須建立）
> ❌ 待補：`wp-business.json`

### B3. Workflows / DB Adapter

- [x] `packages/workflows/src/trigger/create-wp-site.ts` → 對應 v1.3 `provision_client_os`
- [x] `packages/workflows/src/trigger/apply-manifest.ts` → 對應 v1.3 `apply_manifest`
- [x] `packages/workflows/src/db/catalogIds.ts`
- [x] `packages/workflows/src/db/sql/workflowRunsSql.ts`
- [x] `packages/workflows/src/db/sql/packageInstallRunsSql.ts`
- [x] `packages/workflows/src/db/supabase/supabaseRestInsert.ts`（含 `supabaseRestPatch`）

### B4. Governance / Agent / Policy

- [x] `packages/agents/src/configs/repair-agent.json`
- [x] `packages/agents/src/validators/repairAgentConfigValidator.ts`
- [x] `packages/agents/src/loaders/loadRepairAgentConfig.ts`
- [x] `packages/policies/approval/production-deploy-policy.json`
- [x] `packages/policies/tool/repair-agent-policy.json`
- [x] `packages/policies/src/validators/policiesValidator.ts`
- [x] `packages/policies/src/loaders/loadPoliciesFromFiles.ts`

> ❌ 待補：`risk-rules.json`、`rollout-policy.json`、`rollback-policy.json`

### B5. Validation / Acceptance Gates

- [x] `scripts/bootstrap-validate.mjs`
- [x] `scripts/validate-manifests.mjs`
- [x] `scripts/validate-governance-configs.mjs`
- [x] `scripts/dryrun-apply-manifest.mjs`
- [x] `scripts/validate-dryrun-apply-manifest.mjs`（`--mode=strict|fast`）
- [x] `packages/workflows/src/executor/installManifestStaging.ts`
- [x] `scripts/execute-apply-manifest-staging.mjs`
- [x] `scripts/validate-staging-manifest-executor.mjs`
- [x] `templates/woocommerce/scripts/rollback-from-manifest.sh`
- [x] `scripts/rollback-apply-manifest-staging.mjs`
- [x] `supabaseRestPatch`
- [x] `docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`
- [x] `scripts/run-staging-pipeline-regression.mjs`
- [x] `scripts/validate-workflows-integrations-baseline.mjs`
- [x] `docs/hosting/HOSTING_ADAPTER_CONTRACT.md` + `providerStubAdapter` + `resolveStagingProvisioning`
- [x] `docs/operations/LOCAL_ARTIFACTS_SINK.md` + `localArtifactSink.ts`
- [x] `docs/operations/REMOTE_PUT_ARTIFACTS.md` + `artifactMode.ts` + `remotePutArtifactSink.ts`
- [x] `docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md` + `providers/httpJsonStagingAdapter.ts`
- [x] `packages/workflows/src/hosting/providers/`
- [x] `scripts/print-create-wp-site-payload.mjs`
- [x] `scripts/print-apply-manifest-payload.mjs`
- [x] `npm run operator:sanity` + `docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`
- [x] `docs/e2e/OPERABLE_E2E_PLAYBOOK.md` + `scripts/validate-operable-e2e-skeleton.mjs`
- [x] `docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md`
- [x] `docs/operations/ARTIFACTS_IAM_BOUNDARY.md` + `policies/artifacts/artifacts-governance-baseline.json`
- [x] `scripts/validate-artifacts-governance.mjs` + `scripts/audit-artifacts-governance.mjs`
- [x] `docs/operations/PRESIGN_BROKER_MINIMAL.md`
- [x] `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md` Step 7

## C) 待完成（下一步主線）

### C1. 寫入鏈路 ✅ 全完成

- [x] C1-1. `workflow_runs` 寫入（`insertedId=1e53ec18-...`）
- [x] C1-2. `package_install_runs` 寫入與狀態流（`pending→running→completed`）
- [x] C1-3. DB 寫入錯誤處理

### C2. 執行鏈路 ✅ 全完成

- [x] C2-1. hosting adapter
- [x] C2-2. WP 安裝步驟執行器
- [x] C2-3. rollback 實作

### C3. 驗收與可運營 ✅ 全完成

- [x] C3-1. 標準 E2E 測試 payload
- [x] C3-2. 端到端演練報告
- [x] C3-3. Release gate

### C4. 規格差距補齊 ✅ 全完成

- [x] C4-1. `install-from-manifest.sh`
- [x] C4-2. `smoke-test.sh`
- [x] C4-3. `validate-manifest.yml`
- [x] C4-4. `client-onboarding-flow.json`
- [x] C4-5. `ROUTING_MATRIX.md`

### C5. Enterprise 補強（工具層）

- [ ] **C5-1.** Sentry + PostHog → v1.3 Phase 7
- [ ] **C5-2.** Cloudflare → v1.3 Section 3 + 22
- [ ] **C5-3.** Secrets Manager（1Password / Doppler）→ v1.3 Section 3
- [ ] **C5-4.** Identity/Org：Clerk / WorkOS / Auth0（三選一）→ v1.3 Section 15.1
- [ ] **C5-5.** Cost/Decision 可觀測化 → v1.3 Section 25 + 36
- [ ] **C5-6.** Langfuse / Upstash / Stripe / Object Storage / Search

### C6. 制度治理層（v1.3 Section 28–39）

- [ ] **C6-1.** `docs/CANONICAL_NAMING_POLICY.md` + `scripts/audit-naming-conventions.mjs`
- [ ] **C6-2.** `docs/ENVIRONMENT_RELEASE_POLICY.md` + `change-freeze-policy.json`
- [ ] **C6-3.** `docs/BACKUP_DR_POLICY.md` + `scripts/run-restore-test.mjs`
- [ ] **C6-4.** `idempotencyKey.ts` + `resourceLock.ts`
- [ ] **C6-5.** `docs/PLUGIN_GOVERNANCE_POLICY.md` + `scripts/validate-plugin-registry.mjs`
- [ ] **C6-6.** `docs/DOMAIN_DNS_EMAIL_POLICY.md`
- [ ] **C6-7.** ProviderAdapter contract tests（`providerAdapterContract.test.ts`）
- [ ] **C6-8.** `adopt-client-os` workflow + `docs/CLIENT_DATA_LIFECYCLE_POLICY.md`
- [ ] **C6-9.** `costAllocator.ts` + `profitabilitySnapshot.ts`
- [ ] **C6-10.** `templates/client-notifications/`（8 個模板）
- [ ] **C6-11.** `docs/adr/ADR-0001` 至 `ADR-0011`
- [ ] **C6-12.** `docs/KNOWN_CONFLICTS_LOG.md`

### C7. DB Migrations（v1.3 追加）

- [ ] `0010_release_freezes.sql`
- [ ] `0011_restore_runs.sql`
- [ ] `0012_idempotency_and_locks.sql`
- [ ] `0013_plugin_registry.sql`
- [ ] `0014_domains_dns.sql`
- [ ] `0015_client_offboarding.sql`
- [ ] `0016_site_type_and_apply_mode.sql`（Profile C 必需）

### C8. Profile C 支援（已有 WordPress 客戶）

- [ ] **C8-1.** `sites` table 新增 `site_type` + `apply_mode`（migration 0016）
- [ ] **C8-2.** `adopt_audits` + `adopt_audit_items` 表（migration 0016）
- [ ] **C8-3.** ProviderAdapter 補充 `auditExistingSite` / `applyDeltaManifest` / `runAdoptVerification`
- [ ] **C8-4.** `adopt-client-os` Trigger.dev workflow（job: `adopt-client-os`）
- [ ] **C8-5.** adopt smoke test profile JSON
- [ ] **C8-6.** manifest 新增 `apply_mode` 欄位 + `adopt_rules` 物件
- [ ] **C8-7.** `docs/adr/ADR-0011-adopt-delta-vs-full-install.md`

## D) 每次開工/收工

### 開工

- [ ] 看 C 區，只挑 **1 條主線**（優先順序：C5 → C6 → C7 → C8）
- [ ] 對照 `agency-os/TASKS.md` 確認沒有重複任務
- [ ] 確認今天是 `strict` 或 `fast` 驗收模式
- [ ] 確認今天的工作對應 v1.3 哪個 Section（參考 J 區）

### 收工

- [ ] B/C 區勾選已更新
- [ ] 今日證據回寫到 `agency-os/WORKLOG.md` 與 `memory/daily/YYYY-MM-DD.md`
- [ ] 今日已跑對應 gate（至少 `dryrun + validate`）

## E) 驗收命令

### 現有命令

```powershell
node D:\Work\lobster-factory\scripts\bootstrap-validate.mjs
node D:\Work\lobster-factory\scripts\validate-manifests.mjs
node D:\Work\lobster-factory\scripts\validate-governance-configs.mjs
node D:\Work\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="D:\Work\dummy" --environmentType=staging
node D:\Work\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=strict --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="D:\Work\dummy" --environmentType=staging
node D:\Work\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast
node D:\Work\lobster-factory\scripts\emit-staging-drill-report.mjs
cd D:\Work\lobster-factory; npm run operator:sanity
node D:\Work\lobster-factory\scripts\validate-operable-e2e-skeleton.mjs
```

### 待建立命令（C6 完成後）

```powershell
node D:\Work\lobster-factory\scripts\audit-naming-conventions.mjs
node D:\Work\lobster-factory\scripts\validate-idempotency-keys.mjs
node D:\Work\lobster-factory\scripts\validate-plugin-registry.mjs
node D:\Work\lobster-factory\scripts\run-restore-test.mjs --siteId=44444444-4444-4444-4444-444444444444 --environment=staging
node D:\Work\lobster-factory\scripts\dryrun-client-offboarding.mjs --clientId=CLIENT_UUID
```

## F) 重讀結論

### 2026-03-25

- 已重讀：`MASTER_SPEC_V1.md` / `CURSOR_PACK_V1.md` / `ENTERPRISE_BASE_STACK.md`
- 完成：C4-1~C4-5

### 2026-05-03（v3.0 合併版）

- 對齊：`MASTER_DEPLOYMENT_SYSTEM v1.3`
- 發現並解決：7 個命名/架構衝突（見 I 區）
- 確認缺口：`package_install_runs` 需補入 v1.3 Section 15.4
- 確認缺口：Artifact storage pattern 需補入 v1.3 Section 30
- 確認新增：Profile C（已有 WP 接管）完整架構（Section 41）

## G) 完工路線圖

- 執行文件：`docs/LOBSTER_FACTORY_COMPLETION_PLAN_V2.md`
- V3 整合文件：`docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`
- Master 計畫：`LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md`
- 推進順序：**C5 → C6 → C7 → C8**，不跳關

## H) MASTER V3 整合追蹤

- [x] H1. 匯入 V3 來源文件
- [x] H2. 建立整合計畫
- [x] H3. V3 缺口模組骨架（0007）
- [x] H4. Decision Engine baseline（0008）
- [x] H5. CX retention/upsell baseline（0009）
- [x] H6. V3 合規/治理 gate
- [ ] **H7.** v1.3 新增制度章節（Section 28–39）納入 V3 整合計畫
- [ ] **H8.** Decision Engine 評分邏輯實作（v1.3 Section 25 完整演算法）
- [ ] **H9.** Profitability Snapshot 定期計算 workflow

## I) 命名對照表

### Workflow 命名

| 文件層（v1.3） | Trigger.dev Job | 說明 |
| ----- | ----- | ----- |
| `provision_client_os` | `create-wp-site` | 同一概念，不同層次，不改名 |
| `apply_manifest` | `apply-manifest` | 同上 |
| `adopt_client_os` | `adopt-client-os` | Profile C 專用 |
| `install_mainwp_child` | （待實作） | — |
| `generate_handoff_report` | （待實作） | — |

### Adapter 命名

| v1.3 介面 | 實作名稱 | 說明 |
| ----- | ----- | ----- |
| `ProviderAdapter` | `StagingProvisionAdapter` | 同一概念，長期統一到介面 |
| `createOrRegisterSite()` | `resolveStagingProvisioning()` | factory function |

### Table 命名

| 實作中 | v1.3 | 狀態 |
| ----- | ----- | ----- |
| `workflow_runs` | Section 15.4 | ✅ |
| `package_install_runs` | ⚠️ 未在 15.4 | 已實作，文件待補 |
| `approvals`（泛稱） | 禁止 | 改為 `approval_requests` |

### 命名規則

```
DB table    → plural snake_case   (workflow_runs)
Trigger job → kebab-case          (apply-manifest)
TypeScript  → camelCase           (applyManifest)
API route   → kebab-case REST     (/api/workflow-runs)
JSON file   → kebab-case          (wp-basic.json)
```

## J) v1.3 對齊進度

| v1.3 Phase/Section | 說明 | 狀態 |
| ----- | ----- | ----- |
| Phase 0 | 規格文件 | ✅ |
| Phase 1 | Supabase 資料地基 | ✅（0001-0009）|
| Phase 2 | Package / Manifest | ⚠️ wc-core ✅；wp-basic / wp-business ❌ |
| Phase 3 | Provider Adapter | ✅ |
| Phase 4 | One-click Workflow | ⚠️ A7 ❌；A10-2 ❌ |
| Phase 5 | n8n 自動化 | ⚠️ export ✅；串接 ❌ |
| Phase 6 | MainWP 維護層 | ❌ |
| Phase 7 | Observability OS | ❌（C5-1）|
| Phase 8 | Approval / Governance | ✅ baseline |
| Phase 9 | Admin / Portal | ❌ |
| Phase 10 | Decision Engine | ⚠️ Schema ✅；評分邏輯 ❌（H8）|
| Section 28-39 | 制度治理 | ❌（C6）|
| Section 41 | 三種部署 Profile | ✅ 架構定義；C8 實作待做 |

---

# PART 2：不可妥協規則（永遠有效）

> 任何時候任何動作都必須符合這些規則。做任何改動前先過一遍。

### Canonical Naming

- 所有 tenant-bound table 有 `organization_id`
- 不用 `approvals`，一律用 `approval_requests`
- 審批規則用 `approval_policies`；實際審批用 `approval_requests`
- 事件表 `_events`；執行記錄 `_runs`；政策表 `_policies`
- 不用模糊欄位名（`data`、`info`、`config`）
- 核心物件只 archive，不 hard delete

### Safety

- Production deploy 不可預設自動
- High risk action 必須有 `approval_request`
- Secrets 不可出現在 logs / AI context / handoff report
- Secrets 只儲存為 `secret_ref`
- External side-effect 必須有 idempotency key
- 同一個 site 不可同時跑兩個 high-risk workflow
- MainWP Dashboard 不在客戶自有 hosting 帳號
- Netdata 不得列為純 SaaS MVP 必裝

### Versioning

- Schema migration committed to GitHub
- Manifest committed to GitHub
- 舊版本只能 deprecate，不可覆蓋
- 重大決策有 ADR

### Profile 規則（v1.3 Section 41）

- 每次部署前先確認 Profile（A / B / C）
- **用語正本**（口語「AO-agent」vs 路由）：[`ONE_CLICK_BUILD_SYSTEM.md`](ONE_CLICK_BUILD_SYSTEM.md) §1.1
- Profile C（已有 WP）備份強制，不可跳過
- Profile C 只能用 `adopt_delta` 模式，不可用 `full_install`
- Profile C smoke test 必須確認現有內容未被破壞

---

# PART 3：部署 Gate（有客戶要部署時用）

---

## Gate 0：Source of Truth

- [ ] `MASTER_DEPLOYMENT_SYSTEM_v1.3.md` 是唯一架構真相
- [ ] Phase 0–10 編號一致
- [ ] Known Conflicts Log 已更新

### 必備 ADR

- [ ] ADR-0001 Use Supabase as Factory Registry
- [ ] ADR-0002 Durable workflow for long-running jobs
- [ ] ADR-0003 n8n for lightweight automation
- [ ] ADR-0004 MainWP for WordPress fleet management
- [ ] ADR-0005 Netdata optional in pure SaaS MVP
- [ ] ADR-0006 High-risk actions require human approval
- [ ] ADR-0007 Manifests deprecated never overwritten
- [ ] ADR-0008 approval_policies + requests two-table design
- [ ] ADR-0009 Payment gateway advisory smoke test
- [ ] ADR-0010 Client data archived before deletion
- [ ] ADR-0011 adopt_delta vs full_install design decision

```
Evidence — PR: | Docs: | Reviewer: | Decision: go | no_go
```

---

## Gate P：Profile 識別（每次部署必做第一步）

- [ ] Profile 已確認：
  - [ ] **A** — AO-agent（自己公司工具）
  - [ ] **B** — 新客戶（全雲端，從零開始）
  - [ ] **C** — 已有 WordPress 客戶（接管）
- [ ] `sites.site_type` 已設定（`ao_internal` | `new_client` | `existing_wp`）
- [ ] `sites.apply_mode` 已設定（`internal_setup` | `full_install` | `adopt_delta`）

### Profile A 追加確認

- [ ] 不使用 `provision_client_os` 或 `adopt_client_os`
- [ ] 不產生 `handoff_report`
- [ ] Netdata 已部署（有任何自管 VPS）
- [ ] MainWP Dashboard 不在客戶 hosting

### Profile B 追加確認

- [ ] 確認客戶沒有現有 WordPress
- [ ] 使用 `provision_client_os`（Trigger.dev: `create-wp-site`）
- [ ] `apply_mode: "full_install"`

### Profile C 追加確認

- [ ] 使用 `adopt_client_os`（Trigger.dev: `adopt-client-os`）
- [ ] `apply_mode: "adopt_delta"`
- [ ] manifest 含 `adopt_rules` 物件
- [ ] **備份已完成**（必過，否則禁止繼續）
- [ ] `adopt_audit` 已執行
- [ ] Delta 套用只裝 `safe_to_install`
- [ ] Adopt smoke test 全過（`homepage_status_unchanged` + `existing_content_count_unchanged` 必過）

```
Evidence — Profile: | site_type: | apply_mode: | Reviewer: | Decision: go | no_go
```

---

## Gate 1：Data Foundation

### Core Tables

- [ ] `organizations` / `workspaces` / `profiles` / `memberships`
- [ ] `roles` / `permissions` / `role_permissions` / `user_role_assignments`
- [ ] `clients` / `projects` / `sites` / `site_environments`
- [ ] `packages` / `package_versions` / `manifests` / `manifest_versions`
- [ ] `workflow_runs` / `package_install_runs` / `operator_tasks`
- [ ] `approval_policies` / `approval_requests`
- [ ] `incidents` / `audit_logs`
- [ ] `mainwp_connections` / `maintenance_policies` / `maintenance_runs`

### Long-term Tables（migration 0010–0016）

- [ ] `idempotency_keys` / `resource_locks`
- [ ] `restore_runs`
- [ ] `plugin_registry` / `plugin_licenses`
- [ ] `domains` / `dns_records`
- [ ] `client_offboarding_runs`
- [ ] `cost_entries` / `profitability_snapshots`
- [ ] `release_freezes`
- [ ] `adopt_audits` / `adopt_audit_items`（Profile C）
- [ ] `sites.site_type` / `sites.apply_mode` 欄位

### RLS

- [ ] 所有 tenant-bound table 啟用 RLS
- [ ] cross-tenant 存取測試通過
- [ ] service role 僅 backend 使用

```
Evidence — Migration PR: | Supabase URL: | RLS test: | Reviewer: | Decision: go | no_go
```

---

## Gate 2：Package / Manifest

- [ ] `wp-basic@1.0.0`（⚠️ 第一個客戶前必須存在）
- [ ] `wp-business@1.0.0`
- [ ] `wc-core@1.0.0`（含 `payment_gateway_status` advisory，非必過）
- [ ] 每個 manifest 有完整必要欄位（含 `apply_mode`）
- [ ] Plugin slug 在 `plugin_registry` 中存在
- [ ] banned plugin 不可出現在任何 manifest
- [ ] CI 驗證 manifest schema
- [ ] wc-core smoke test 用 advisory `payment_gateway_status`，非必過項

```
Evidence — Manifest paths: | CI output: | plugin_registry count: | Reviewer: | Decision: go | no_go
```

---

## Gate 3：Provider Adapter

- [ ] `wordpress-generic` / `manual-task` 可運作
- [ ] `hostinger` / `siteground` / `cloudways` placeholder 存在
- [ ] 所有 adapter 通過 contract test（`supportsAutoProvisioning` / `createOrRegisterSite` / `applyManifest` / `runVerification`）
- [ ] 不支援自動化 → 回傳 `manual_required`，不 throw
- [ ] Failure → 建立 `operator_task`
- [ ] Profile C adapter 新增：`auditExistingSite` / `applyDeltaManifest` / `runAdoptVerification`
- [ ] 所有外部副作用操作有 idempotency key（格式：`{workflow}:{site_id}:{step}:{version}`）

```
Evidence — Contract test output: | Idempotency test: | Manual fallback operator_task ID: | Reviewer: | Decision: go | no_go
```

---

## Gate 4：One-click Workflow

### workflow_run 必要欄位

`run_id` / `organization_id` / `workspace_id` / `client_id` / `project_id` / `site_id` / `environment_id` / `actor_type` / `trigger_type` / `input_snapshot` / `output_snapshot` / `artifacts` / `tool_versions` / `status` / `started_at` / `ended_at` / `cost` / `approval_request_id` / `incident_id` / `decision_id` / `rollback_ref`

### Safety

- [ ] High-risk workflow 執行前取得 `resource_lock`
- [ ] Lock 失敗 → 建立 `operator_task`
- [ ] Failure → 建立 `incident` 或 `operator_task`
- [ ] Production action 需要 `approval_request`

### Handoff Report

- [ ] Structured JSON（無 secrets）
- [ ] 含 package version / provider / site URL / MainWP status / smoke test 結果 / maintenance plan
- [ ] Stored as artifact，關聯 `workflow_run_id`
- [ ] Profile C：含 adopt_audit 摘要

```
Evidence — Workflow run ID: | package_install_run ID: | Handoff report URL: | Reviewer: | Decision: go | no_go
```

---

## Gate 5：n8n 自動化

- [ ] `client_onboarding_notification` / `handoff_report_email` / `monthly_report_send`
- [ ] `crm_lead_sync` / `mainwp_status_sync` / `uptime_alert_notify` / `workflow_failure_notify`
- [ ] n8n 不執行 high-risk production deploy / 不改 DNS / 不改 payment gateway
- [ ] Failure notification 不遞迴觸發自己

```
Evidence — n8n export path: | Test webhook: | Reviewer: | Decision: go | no_go
```

---

## Gate 6：MainWP 維護層

- [ ] **MainWP Dashboard 不在客戶 hosting 帳號**（硬規則）
- [ ] Dashboard 有 2FA + access protection
- [ ] `mainwp_connections` table 存在，`mainwp_site_id` 寫回 Supabase
- [ ] `maintenance_policies` 含 SLA 等級（basic / standard / pro / enterprise）
- [ ] High risk update 需要 `approval_request`
- [ ] WooCommerce production update 需 staging + approval

```
Evidence — MainWP site ID: | Supabase record: | Maintenance run ID: | Reviewer: | Decision: go | no_go
```

---

## Gate 7：Observability OS

- [ ] Sentry / Uptime / PostHog / MainWP / Trigger.dev / n8n 告警接入
- [ ] Netdata **僅限有自管 VPS 時**實作
- [ ] Incident state machine：detected → triaged → investigating → waiting_approval → remediating → verifying → resolved → postmortem → closed
- [ ] homepage down → `high` incident
- [ ] checkout down → `critical` incident
- [ ] SSL expiry < 14 天 → `high` incident

```
Evidence — Sentry issue: | Incident ID: | Severity test output: | Reviewer: | Decision: go | no_go
```

---

## Gate 8：Approval / Governance

- [ ] `approval_policies` / `approval_requests` / `audit_logs` / `tool_policies` / `release_freezes`
- [ ] low → auto；medium → backup check；high → approval；critical → manual only
- [ ] Rejected / expired `approval_request` 阻擋 workflow
- [ ] Agent 權限符合 v1.3 Section 14.3

```
Evidence — Approval request ID: | Rejection test: | Audit log: | Reviewer: | Decision: go | no_go
```

---

## Gate 9：Admin / Client Portal

- [ ] Admin：Clients / Projects / Sites / Packages / Workflow Runs / Incidents / Approvals / Costs / Recommendations
- [ ] Client Portal：Handoff report / Maintenance report / Site status / Invoice
- [ ] RLS 確認：client 不可看其他 client 資料
- [ ] 高風險按鈕觸發 approval flow，不直接執行

```
Evidence — Admin screenshots: | RLS test: | Reviewer: | Decision: go | no_go
```

---

## Gate 10：Decision Engine v1

### Scores

- [ ] `client_health_score` / `site_risk_score` / `maintenance_cost_score`
- [ ] `incident_frequency_score` / `upsell_score` / `churn_risk_score` / `profitability_score`

### Recommendations

- [ ] `upsell` / `upgrade` / `risk_alert` / `churn_prevention` / `maintenance` / `cost_review` / `hosting_upgrade`
- [ ] `auto_execute: false` 是所有 recommendation 的預設值
- [ ] Decision Engine 不可自動：刪資料 / 升級 WooCommerce prod / 改付款閘道 / 發大量 email / 改 DNS

```
Evidence — Score test output: | Recommendation ID: | auto_execute: false confirmed: | Reviewer: | Decision: go | no_go
```

---

## Gate 11：Backup / Restore / DR

- [ ] Backup policy 存在，頻率符合 SLA
- [ ] Restore 程序已文件化且測試通過
- [ ] `restore_run` 記錄含 RTO / RPO
- [ ] DR runbook 存在，owner 已指定

| SLA | RTO | RPO |
|---|---|---|
| basic-monthly | 48h | 24h |
| standard-biweekly | 24h | 24h |
| pro-weekly | 8h | 12h |

```
Evidence — restore_run ID: | RTO/RPO values: | DR runbook path: | Reviewer: | Decision: go | no_go
```

---

## Gate 12：Go / No-Go Final

### Go Criteria（全部為 true）

- [ ] Gate 0–4 全部 approved
- [ ] wp-basic 部署成功
- [ ] `workflow_run` 建立
- [ ] `package_install_runs` 狀態流完整
- [ ] `handoff_report` 生成並儲存
- [ ] MainWP 連線（`mainwp_site_id` 在 Supabase）
- [ ] Uptime + SSL monitor 啟用
- [ ] Smoke test 通過
- [ ] Failure path 測試（incident / operator_task 建立）
- [ ] Approval gate 測試（rejection 阻擋執行）
- [ ] Secrets redaction 測試

### 任何一條為 true = No-Go

- [ ] Production action 無 `approval_request` 可執行
- [ ] Secrets 出現在 logs / AI context / handoff report
- [ ] Client 可看其他 client 資料
- [ ] Workflow failure 未建立 incident 或 operator_task
- [ ] High-risk action 無 rollback plan 且未標 `non_reversible`
- [ ] External side-effect 無 idempotency key
- [ ] 新版 package 覆蓋舊版
- [ ] MainWP Dashboard 在客戶自有 hosting
- [ ] Netdata 在純 SaaS MVP 被列為必裝
- [ ] `payment_gateway_configured` 是 wc-core 必過 smoke test
- [ ] `LOBSTER_ENABLE_DB_WRITES` 在 production 環境被設定
- [ ] 同一 site 可同時跑兩個 high-risk workflow

```
Evidence — Go criteria output: | No-go scenario test: | Reviewer: | Final Decision: go | no_go
```

---

## Gate 13：First Client（wp-basic）

### 前置確認

- [ ] `wp-basic.json` manifest 已存在
- [ ] `wp-basic@1.0.0` 已在 DB 登錄
- [ ] Plugin registry 含 wp-basic 所有 slug
- [ ] Offboarding runbook 存在
- [ ] Client notification template 存在（至少 `handoff-report.md`）

### 部署驗證

- [ ] Profile B（無現有 WP）
- [ ] Package: wp-basic（No WooCommerce / No payment gateway）
- [ ] client / project / site 建立
- [ ] WordPress 連接
- [ ] MainWP 連接（`mainwp_site_id` 回寫）
- [ ] Uptime + SSL monitor 啟用
- [ ] Smoke test 通過（basic profile）
- [ ] Handoff report 產生
- [ ] Maintenance plan 啟用（basic-monthly）

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
- Reviewer:
- Decision: go | no_go
```

---

## Checklist 維護規則

- 本文件版本化，每次修改更新版本號
- 不可新增 Master System 未定義的核心架構
- 可新增 gate / evidence / QA 項目
- 修改需更新 CHANGELOG
- 每次 production launch 前 review
- 每季 review 一次
- 每年 review 一次 30 年穩定性假設
