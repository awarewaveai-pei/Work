# Lobster Factory Master Checklist

> **版本：v2.0（2026-05-03 對齊 MASTER_DEPLOYMENT_SYSTEM v1.2）**
> 用途：集中追蹤「一人跨國公司底座」的完整建置流程、目前進度、未完成項目，避免遺漏與重工。
> 單一真實來源：本檔 + [`agency-os/TASKS.md`](../../agency-os/TASKS.md)（跨系統任務板）。
>
> **v2.0 改版說明：** 對齊 MASTER_DEPLOYMENT_SYSTEM v1.2；解決 7 個命名/架構衝突；補追 12 個制度治理項目（C6）；補追 6 個 DB migration（C7）；新增 I) 命名對照表；新增 J) v1.2 對齊進度表；更新驗收命令。

---

## A) 全流程總覽（由上到下）

- [x] A1. 定義 Phase 1 範圍（先安全可驗證，再逐步開啟真寫入）
- [x] A2. 建立多租戶 DB migration 基礎（core/factory/governance/RLS/seeds/catalog）
- [x] A3. 建立 manifest 規格與 `wc-core` 範本（**注意**：wc-core 先建是技術驗證用途；客戶部署順序仍依 v1.2 Section 23：wp-basic → wp-business → wc-core，無衝突）
- [x] A4. 建立 durable workflow 骨架（`create-wp-site`、`apply-manifest`）（**命名說明**：見 I 區）
- [x] A5. 建立結構驗證與 fail-fast gate（bootstrap/manifests/governance/dryrun validate）
- [x] A6. 串接 hosting provider adapter（`none` / `mock` / `provider_stub` / **`http_json`**；**專屬 vendor SDK** 仍可待 `providers/<name>.ts`）
- [ ] A7. 串接 WordPress 真正 provision/shell execution（仍須 guardrails；**manifest 套用 shell 已具備**，全站自動建站仍待 hosting adapter）→ 對應 v1.2 Phase 4
- [x] A8. 打通 DB 真寫入完整流程（`apply-manifest`：`workflow_runs` / `package_install_runs` insert + shell 時 `running`→PATCH 終態；**不含** `create-wp-site` 端到端建站）
- [x] A9. artifacts／rollback／錯誤回復（**技術 baseline**：rollback + DB `failed` + `local`／`remote_put` + `logs_ref`；**治理 baseline**：`ARTIFACTS_LIFECYCLE_POLICY` + `ARTIFACTS_IAM_BOUNDARY` + `validate/audit-artifacts-governance`；雲廠商實際 bucket/IaC 可在後續迭代）→ 對應 v1.2 Section 30
- [x] A10-1. E2E **營運劇本 + 結構閘道**（`docs/e2e/OPERABLE_E2E_PLAYBOOK.md` + `scripts/validate-operable-e2e-skeleton.mjs` → `bootstrap-validate`）→ 對應 v1.2 Section 34
- [ ] A10-2. **商業閉環**：新客戶從建立→驗收 + 生產 Trigger 全鏈固定證據（對齊 `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md` 實跑）→ 對應 v1.2 Phase 4 + Section 8
- [ ] A11. **制度治理層**（v2.0 新增）：補齊 v1.2 新增 12 個制度章節對應的 schema、policy、docs → 見 C6、C7

---

## B) 目前已完成（依現況勾選）

### B1. DB / Catalog

- [x] `packages/db/migrations/0001_core.sql` → v1.2 Section 15.1 Identity & Tenancy
- [x] `packages/db/migrations/0002_factory.sql` → v1.2 Section 15.2 Business & Delivery
- [x] `packages/db/migrations/0003_agents_approvals_observability.sql` → v1.2 Section 15.4-15.6
- [x] `packages/db/migrations/0004_rls_helpers.sql` → v1.2 Section 22.3 RLS
- [x] `packages/db/migrations/0005_seed_minimum.sql`
- [x] `packages/db/migrations/0006_seed_catalog.sql`（固定 catalog IDs）
- [x] `packages/db/migrations/0007_v3_skeleton_modules.sql` → v1.2 Section 6.2 Optional Modules
- [x] `packages/db/migrations/0008_decision_engine_recommendations.sql` → v1.2 Section 25
- [x] `packages/db/migrations/0009_cx_retention_upsell_baseline.sql` → v1.2 Section 6.2 CX OS

> **⚠️ 缺口：`package_install_runs` 表**
> 實作中已在用（C1-2 有完整 UUID 證據），但 v1.2 Section 15.4 未列出此表。
> **解決方案**：下次更新 v1.2 時補入 Section 15.4；下次 migration 整理時確認此表有 RLS。

### B2. Manifest / API Types / Service

- [x] `packages/manifests/wc-core.json`（Phase 1: staging-only）→ v1.2 Section 9.4
- [x] `apps/api/src/types/manifest.ts` → v1.2 Section 9 manifest 規格
- [x] `apps/api/src/services/wp/wpFactory.ts`

> **待補**：`packages/manifests/wp-basic.json`（對應 v1.2 Section 9.2 完整 JSON 範例）
> **待補**：`packages/manifests/wp-business.json`（對應 v1.2 Section 9.3）

### B3. Workflows / DB Adapter

- [x] `packages/workflows/src/trigger/create-wp-site.ts` → 對應 v1.2 `provision_client_os`（命名說明見 I 區）
- [x] `packages/workflows/src/trigger/apply-manifest.ts` → 對應 v1.2 `apply_manifest`（命名說明見 I 區）
- [x] `packages/workflows/src/db/catalogIds.ts`
- [x] `packages/workflows/src/db/sql/workflowRunsSql.ts` → v1.2 Section 12
- [x] `packages/workflows/src/db/sql/packageInstallRunsSql.ts`
- [x] `packages/workflows/src/db/supabase/supabaseRestInsert.ts`（insert；**PATCH 終態**：同檔 `supabaseRestPatch`）

### B4. Governance / Agent / Policy

- [x] `packages/agents/src/configs/repair-agent.json` → v1.2 Section 14.3 repair-agent
- [x] `packages/agents/src/validators/repairAgentConfigValidator.ts`
- [x] `packages/agents/src/loaders/loadRepairAgentConfig.ts`
- [x] `packages/policies/approval/production-deploy-policy.json` → v1.2 Section 14.2（高風險 approval）
- [x] `packages/policies/tool/repair-agent-policy.json` → v1.2 Section 14.3
- [x] `packages/policies/src/validators/policiesValidator.ts`
- [x] `packages/policies/src/loaders/loadPoliciesFromFiles.ts`

> **待補**：`packages/policies/approval/risk-rules.json`（對應 v1.2 Section 14.1 風險分級）
> **待補**：`packages/policies/approval/rollout-policy.json`
> **待補**：`packages/policies/approval/rollback-policy.json`

### B5. Validation / Acceptance Gates

- [x] `scripts/bootstrap-validate.mjs`
- [x] `scripts/validate-manifests.mjs`
- [x] `scripts/validate-governance-configs.mjs`
- [x] `scripts/dryrun-apply-manifest.mjs`
- [x] `scripts/validate-dryrun-apply-manifest.mjs`（`--mode=strict|fast`）
- [x] `packages/workflows/src/executor/installManifestStaging.ts`（M3 shell 執行器）
- [x] `scripts/execute-apply-manifest-staging.mjs`（本機 staging 執行 CLI）
- [x] `scripts/validate-staging-manifest-executor.mjs`（結構閘道）
- [x] `templates/woocommerce/scripts/rollback-from-manifest.sh`（C2-3 baseline）→ v1.2 Section 14.2
- [x] `scripts/rollback-apply-manifest-staging.mjs`
- [x] `supabaseRestPatch`（`package_install_runs` / `workflow_runs` 終態更新）
- [x] `docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`（C3-1 固定欄位）
- [x] `scripts/run-staging-pipeline-regression.mjs`（C3-1 可重跑回歸）
- [x] `scripts/validate-workflows-integrations-baseline.mjs`（hosting 解析 + artifact sink 結構閘道）
- [x] `docs/hosting/HOSTING_ADAPTER_CONTRACT.md` + `providerStubAdapter` + `resolveStagingProvisioning` → v1.2 Section 10 ProviderAdapter（命名說明見 I 區）
- [x] `docs/operations/LOCAL_ARTIFACTS_SINK.md` + `localArtifactSink.ts` → v1.2 Section 30 artifact storage
- [x] `docs/operations/REMOTE_PUT_ARTIFACTS.md` + `artifactMode.ts` + `remotePutArtifactSink.ts` → v1.2 Section 30
- [x] `docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md` + `providers/httpJsonStagingAdapter.ts`
- [x] `packages/workflows/src/hosting/providers/`（`StagingProvisionAdapter` 合約 + README）
- [x] `scripts/print-create-wp-site-payload.mjs` + `npm run payload:create-wp-site`
- [x] `scripts/print-apply-manifest-payload.mjs` + `npm run payload:apply-manifest`
- [x] `npm run operator:sanity` + `docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`
- [x] `docs/e2e/OPERABLE_E2E_PLAYBOOK.md` + `scripts/validate-operable-e2e-skeleton.mjs`（A10-1）
- [x] `docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md`（A9 政策層）→ v1.2 Section 30
- [x] `docs/operations/ARTIFACTS_IAM_BOUNDARY.md` + `policies/artifacts/artifacts-governance-baseline.json` → v1.2 Section 22
- [x] `scripts/validate-artifacts-governance.mjs` + `scripts/audit-artifacts-governance.mjs`
- [x] `docs/operations/PRESIGN_BROKER_MINIMAL.md` + `templates/lobster/presign-response.success.example.json`（remote_put 整合輔助）
- [x] `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md` Step 7（Lobster／A10-2 銜接）→ v1.2 Section 8

---

## C) 尚未完成（下一步主線，避免重工）

### C1. 寫入鏈路（先小後大）✅ 全完成

- [x] C1-1. 先只開 `LOBSTER_ENABLE_DB_WRITES=true` 驗證 `workflow_runs` 寫入（execute PASS，`insertedId=1e53ec18-1c01-4547-9593-20feee6bdc2c`）
- [x] C1-2. 再接 `package_install_runs` 寫入與狀態流（execute PASS，`installRunId=206bd6ee-f5e0-4b6a-810c-bbb9914844f4`；`pending -> running -> completed`；**公司桌機複核**：`installRunId=ae8c6e48-fac9-4ac6-8721-d142c831c620`、`workflowRunId=73c91be3-3663-4977-aa9a-4c2b7e24dd97`）
- [x] C1-3. 補齊 DB 寫入錯誤處理（execute PASS，`traceId=resilience-4c1b0ea6-84a3-4a8a-8c01-5ce648dd6099`、`insertedWorkflowRunId=77f43da0-6fc6-4ce6-bc3b-f3d139fc783c`）

### C2. 執行鏈路（staging-only）✅ 全完成

- [x] C2-1. hosting adapter（`resolveStagingProvisioning`：`none`/`mock`/`provider_stub`/`http_json`/未知 blocked + async）
- [x] C2-2. WP 實際安裝步驟執行器
- [x] C2-3. rollback 實作（baseline）

### C3. 驗收與可運營 ✅ 全完成

- [x] C3-1. 標準 E2E 測試 payload
- [x] C3-2. 端到端演練並留存報告
- [x] C3-3. Release gate（`.github/workflows/release-gate-main.yml`）→ v1.2 Section 29

### C4. 規格差距補齊 ✅ 全完成

- [x] C4-1. `templates/woocommerce/scripts/install-from-manifest.sh`
- [x] C4-2. `templates/woocommerce/scripts/smoke-test.sh`
- [x] C4-3. `infra/github/workflows/validate-manifest.yml`
- [x] C4-4. `infra/n8n/exports/client-onboarding-flow.json` → v1.2 Phase 5
- [x] C4-5. `docs/ROUTING_MATRIX.md` → v1.2 Section 11

### C5. Enterprise 補強（工具層）

- [ ] **C5-1.** Observability：Sentry（錯誤追蹤）+ PostHog（產品分析）→ v1.2 Phase 7
- [ ] **C5-2.** Edge/Security：Cloudflare（WAF/CDN/Rate limit）→ v1.2 Section 3 + 22
- [ ] **C5-3.** Secrets：1Password Secrets Automation（或同級）→ v1.2 Section 3 Secrets Manager
- [ ] **C5-4.** Identity/Org：Clerk/WorkOS/Auth0（三選一）→ v1.2 Section 15.1
- [ ] **C5-5.** Cost/Decision：成本與決策引擎可觀測化（budget/ROI guardrails）→ v1.2 Section 25 + 36
- [ ] **C5-6.** 後續建議：Langfuse / Upstash / Stripe / Object Storage / Search

### C6. 制度治理層（v1.2 新增，v2.0 追加追蹤）

> 這些不是新工具，是系統能跑 30 年的制度底座。對應 v1.2 Section 28–39。

- [ ] **C6-1.** Canonical Naming Policy 文件 + 命名 audit script
  - 產出：`docs/CANONICAL_NAMING_POLICY.md`
  - 產出：`scripts/audit-naming-conventions.mjs`（掃描 table/API/workflow 命名是否符合規則）
  - 對應：v1.2 Section 28
  - **注意**：含修正現有代碼中 `approval_policy`（單數）→ `approval_policies` 的追蹤

- [ ] **C6-2.** Environment & Release Policy + Change Freeze 機制
  - 產出：`docs/ENVIRONMENT_RELEASE_POLICY.md`
  - 產出：`packages/policies/release/change-freeze-policy.json`
  - DB：`packages/db/migrations/0010_release_freezes.sql`（見 C7）
  - 對應：v1.2 Section 29
  - **注意**：`LOBSTER_ENABLE_DB_WRITES` 要在此文件中正式定義為 dev-only feature flag，Production 不可使用

- [ ] **C6-3.** Backup & DR Policy + restore 測試程序
  - 產出：`docs/BACKUP_DR_POLICY.md`（補強現有 `ARTIFACTS_LIFECYCLE_POLICY.md`）
  - 產出：`scripts/run-restore-test.mjs`（restore 測試執行器）
  - DB：`packages/db/migrations/0011_restore_runs.sql`（見 C7）
  - 對應：v1.2 Section 30
  - **注意**：整合現有 `localArtifactSink` / `remotePutArtifactSink` 為統一 backup 策略

- [ ] **C6-4.** Idempotency Keys + Resource Locking
  - 產出：`packages/workflows/src/idempotency/idempotencyKey.ts`
  - 產出：`packages/workflows/src/locking/resourceLock.ts`
  - DB：`packages/db/migrations/0012_idempotency_and_locks.sql`（見 C7）
  - 對應：v1.2 Section 31
  - **注意**：`create-wp-site` 和 `apply-manifest` 都必須加 idempotency key；site lock 防止並發 apply

- [ ] **C6-5.** Plugin Registry + Plugin License Governance
  - 產出：`docs/PLUGIN_GOVERNANCE_POLICY.md`
  - 產出：`packages/db/migrations/0013_plugin_registry.sql`（見 C7）
  - 產出：`scripts/validate-plugin-registry.mjs`
  - 對應：v1.2 Section 32
  - **注意**：manifest 中的所有 plugin slug 必須能在 plugin_registry 中查到

- [ ] **C6-6.** Domain / DNS / Email Deliverability Policy
  - 產出：`docs/DOMAIN_DNS_EMAIL_POLICY.md`
  - 產出：`packages/db/migrations/0014_domains_dns.sql`（見 C7）
  - 對應：v1.2 Section 33

- [ ] **C6-7.** Testing Strategy — Contract Tests for ProviderAdapters
  - 產出：`packages/workflows/src/hosting/__tests__/providerAdapterContract.test.ts`
  - 覆蓋：`httpJsonStagingAdapter`、`providerStubAdapter`、`manualTaskAdapter`
  - 對應：v1.2 Section 34.4
  - **注意**：這是補現有 adapter 的 contract test，不是全新開發

- [ ] **C6-8.** Client Data Lifecycle + Offboarding Workflow
  - 產出：`packages/workflows/src/trigger/client-offboarding.ts`
  - 產出：`packages/db/migrations/0015_client_offboarding.sql`（見 C7）
  - 產出：`docs/CLIENT_DATA_LIFECYCLE_POLICY.md`
  - 對應：v1.2 Section 35

- [ ] **C6-9.** Cost Allocation + Profitability Snapshots
  - 產出：`packages/billing/src/costAllocator.ts`
  - 產出：`packages/billing/src/profitabilitySnapshot.ts`
  - 確認：`packages/db/migrations` 中 `cost_entries` 表有 `billed_to` 欄位
  - 對應：v1.2 Section 36

- [ ] **C6-10.** Client Communication Policy + Notification Templates
  - 產出：`docs/CLIENT_COMMUNICATION_POLICY.md`
  - 產出：`templates/client-notifications/` 資料夾（8 個模板）
  - 對應：v1.2 Section 37

- [ ] **C6-11.** Architecture Decision Records（第一批 10 個）
  - 產出：`docs/adr/ADR-0001` 至 `ADR-0010`（對應 v1.2 Section 38.3 清單）
  - 對應：v1.2 Section 38
  - **推薦先寫**：ADR-0001（Supabase）、ADR-0009（payment gateway advisory）、ADR-0007（manifest 版本化）

- [ ] **C6-12.** Known Conflicts Log 文件（跨版本矛盾追蹤）
  - 產出：`docs/KNOWN_CONFLICTS_LOG.md`（對應 v1.2 Section 39 內容）
  - 對應：v1.2 Section 39

### C7. DB Migration 追蹤（v1.2 追加的新表）

> 以下 migration 對應 v1.2 新增的制度層表格，必須依序執行，不可跳號。

- [ ] **`0010_release_freezes.sql`**（C6-2）
  ```sql
  -- release_freezes: Change Freeze 記錄
  -- 對應 v1.2 Section 29.3
  ```

- [ ] **`0011_restore_runs.sql`**（C6-3）
  ```sql
  -- restore_runs: 還原測試記錄（RTO/RPO 追蹤）
  -- 對應 v1.2 Section 30.3
  ```

- [ ] **`0012_idempotency_and_locks.sql`**（C6-4）
  ```sql
  -- idempotency_keys: 冪等性保護
  -- resource_locks: 並發保護（site-level lock）
  -- 對應 v1.2 Section 31
  ```

- [ ] **`0013_plugin_registry.sql`**（C6-5）
  ```sql
  -- plugin_registry: plugin 分類與狀態管理
  -- plugin_licenses: 授權管理
  -- 對應 v1.2 Section 32
  ```

- [ ] **`0014_domains_dns.sql`**（C6-6）
  ```sql
  -- domains: 補強版（加 ssl_expires_at / spf_status / dkim_status / dmarc_status）
  -- dns_records: DNS record 追蹤
  -- 對應 v1.2 Section 33
  ```

- [ ] **`0015_client_offboarding.sql`**（C6-8）
  ```sql
  -- client_offboarding_runs: offboarding 步驟追蹤
  -- 對應 v1.2 Section 35
  ```

---

## D) 每次開工/收工要看什麼

> 事件流程單一真相：開工以 `agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md` 為準；收工以 `agency-os/docs/operations/end-of-day-checklist.md` + `agency-os/.cursor/rules/40-shutdown-closeout.mdc` 為準。

### 開工（AO-RESUME 後）

- [ ] 先看本檔 C 區（尚未完成），優先順序：**C5 → C6 → C7**（依序推進，不跳關）
- [ ] 對照 `agency-os/TASKS.md` 是否已有相同任務，避免重開重做
- [ ] 執行前先決定今天跑 `strict` 或 `fast` 驗收模式
- [ ] 確認今天的工作對應 v1.2 哪個 Section（參考 J 區）

### 收工（AO-CLOSE 前）

- [ ] 今日改動是否更新到本檔（B/C 區勾選）
- [ ] 今日證據是否回寫到 `agency-os/WORKLOG.md` 與 `memory/daily/YYYY-MM-DD.md`
- [ ] 今日是否已跑對應 gate（至少 `dryrun + validate`）
- [ ] 若有新命名決定，是否更新到 I 區命名對照表

### C1 專用流程

- [ ] 需要執行 C1 時，先照 `docs/C1_EXECUTION_RUNBOOK.md` 跑完整順序（dryrun -> execute -> acceptance）

---

## E) 驗收命令（直接可跑）

### E1. 現有驗收命令（保留）

```powershell
node D:\Work\lobster-factory\scripts\bootstrap-validate.mjs
node D:\Work\lobster-factory\scripts\validate-manifests.mjs
node D:\Work\lobster-factory\scripts\validate-governance-configs.mjs
node D:\Work\lobster-factory\scripts\validate-workflow-runs-write.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444
node D:\Work\lobster-factory\scripts\validate-package-install-runs-flow.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --workflowRunId=66666666-6666-6666-6666-666666666666
node D:\Work\lobster-factory\scripts\validate-db-write-resilience.mjs
node D:\Work\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="D:\Work\dummy" --environmentType=staging
node D:\Work\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=strict --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="D:\Work\dummy" --environmentType=staging
node D:\Work\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast
node D:\Work\lobster-factory\scripts\emit-staging-drill-report.mjs
node D:\Work\lobster-factory\scripts\print-create-wp-site-payload.mjs
node D:\Work\lobster-factory\scripts\print-apply-manifest-payload.mjs
cd D:\Work\lobster-factory; npm run operator:sanity
node D:\Work\lobster-factory\scripts\validate-operable-e2e-skeleton.mjs
```

### E2. v1.2 新增驗收命令（待建立，對應 C6）

> 以下腳本尚未存在，是 C6 各項目完成後要新建的 gate。

```powershell
# C6-1：命名規範稽核
node D:\Work\lobster-factory\scripts\audit-naming-conventions.mjs

# C6-4：Idempotency Key 結構驗證
node D:\Work\lobster-factory\scripts\validate-idempotency-keys.mjs

# C6-5：Plugin Registry 完整性驗證（manifest 中的 slug 是否都已登錄）
node D:\Work\lobster-factory\scripts\validate-plugin-registry.mjs

# C6-7：Provider Adapter Contract Tests
cd D:\Work\lobster-factory; npx vitest run packages/workflows/src/hosting/__tests__/providerAdapterContract.test.ts

# C6-3：Restore Test（staging 環境）
node D:\Work\lobster-factory\scripts\run-restore-test.mjs --siteId=44444444-4444-4444-4444-444444444444 --environment=staging

# C6-8：Client Offboarding Dry Run
node D:\Work\lobster-factory\scripts\dryrun-client-offboarding.mjs --clientId=CLIENT_UUID
```

---

## F) 本次重讀結論

### F1. 2026-03-25 重讀結論（保留）

- 已重讀：
  - `docs/spec/raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md`
  - `docs/spec/raw/CURSOR_PACK_V1.md`
  - `docs/spec/raw/ENTERPRISE_BASE_STACK.md`
- 已確認現況缺口（repo 尚未存在）：
  - （已完成）C4-1~C4-5 raw spec 差距第一輪補齊

### F2. 2026-05-03 v2.0 對齊結論（新增）

- 已對齊：`LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM v1.2`
- 確認衝突與解決方案：見 I 區（7 個命名/架構衝突全部有解）
- 確認新缺口：
  - `package_install_runs` 需補入 v1.2 Section 15.4（MASTER 文件待更新）
  - Artifact storage pattern (local/remote_put/presign) 需補入 v1.2 Section 30（MASTER 文件待更新）
  - `LOBSTER_ENABLE_DB_WRITES` 需正式定義為 dev-only feature flag（C6-2）
  - 需補 `wp-basic.json` 和 `wp-business.json` manifest（B2 缺口）
  - 需補 `risk-rules.json`、`rollout-policy.json`、`rollback-policy.json`（B4 缺口）

---

## G) 完工路線圖（v2）

- 主要執行文件：`docs/LOBSTER_FACTORY_COMPLETION_PLAN_V2.md`
- V3 整合文件：`docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`
- **Master 計畫文件**：`docs/spec/LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.2.md`（新增）
- 推進原則：依 **C5 → C6 → C7** 順序，不跳關。C5 工具層先到位，C6 制度層才有意義。
- 每個 milestone 完成後，回寫 `agency-os/WORKLOG.md` 與 `agency-os/memory/daily/YYYY-MM-DD.md` 證據。

---

## H) MASTER V3 整合追蹤（2026-03 啟用）

- [x] H1. 匯入來源文件：`D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md`
- [x] H2. 建立整合計畫：`docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`
- [x] H3. 依 V3 建立缺口模組骨架（Sales/Marketing/Partner/Media/Decision Engine/Merchandising；`0007_v3_skeleton_modules.sql` + `v3-skeleton.ts` + `v3-module-skeleton-workflows.ts` + `V3_MODULE_SKELETONS.md`）→ v1.2 Section 6.2
- [x] H4. 補 Decision Engine baseline（recommendations schema + workflow skeleton；`0008_decision_engine_recommendations.sql` + `decision-engine-baseline.ts`）→ v1.2 Section 25
- [x] H5. 補 CX retention/upsell workflow baseline（與 `workflow_runs` 串接；`0009_cx_retention_upsell_baseline.sql` + `cx-retention-upsell-baseline.ts`）→ v1.2 Section 6.2 CX OS
- [x] H6. 將 V3 合規/治理要求轉為可執行 gate（baseline：`v3-governance-gate-policy.json` + `run-v3-governance-gates.mjs` + bootstrap 整合）→ v1.2 Section 14
- [ ] **H7.** 對齊 v1.2 新增制度章節（Section 28–39）至 V3 整合計畫 → 確認 V3 Integration Plan 有納入 C6 項目
- [ ] **H8.** Decision Engine 評分邏輯實作（對應 v1.2 Section 25 完整評分演算法：`client_health_score`、`site_risk_score`、`upsell_score`、`churn_risk_score`）
- [ ] **H9.** Profitability Snapshot 定期計算 workflow（對應 v1.2 Section 36.3，每月計算一次）

---

## I) 命名對照表（v2.0 新增）

> **這是防止 Cursor 產生命名衝突的核心參考。** 所有 Trigger.dev job、DB table、workflow 文件之間的命名差異都在此解釋清楚。

### I1. Workflow 命名（Trigger.dev vs 文件層）

| 文件層名稱（v1.2） | Trigger.dev Job 名稱（實作） | 說明 |
| ----- | ----- | ----- |
| `provision_client_os` | `create-wp-site` | 高層業務名稱 vs Trigger.dev kebab-case 慣例；**不需改名**，兩個名稱在各自層次都正確 |
| `apply_manifest` | `apply-manifest` | 同上；DB/table 用 snake_case，Trigger.dev job 用 kebab-case |
| `install_mainwp_child` | （待實作） | — |
| `connect_mainwp` | （待實作） | — |
| `register_monitoring` | （待實作） | — |
| `run_smoke_tests` | （待實作） | — |
| `generate_handoff_report` | （待實作） | — |

### I2. Adapter 命名（介面 vs 實作）

| v1.2 介面名稱 | 實作名稱 | 說明 |
| ----- | ----- | ----- |
| `ProviderAdapter` (interface) | `StagingProvisionAdapter` (contract) | 同一概念；`ProviderAdapter` 是 v1.2 的標準名稱，`StagingProvisionAdapter` 是目前 repo 的實作名稱 |
| `createOrRegisterSite()` | `resolveStagingProvisioning()` | 同一功能；`resolveStagingProvisioning` 是 factory function，回傳 adapter 並執行；長期應統一到 `ProviderAdapter` 介面 |
| `generic-wordpress-adapter` | `providerStubAdapter` / `httpJsonStagingAdapter` | stub 是 mock，httpJson 是真正可接 API 的 generic adapter |
| `manual-task-adapter` | （待實作） | 產生 `operator_task` 的 fallback |

### I3. Table 命名（實作 vs v1.2）

| 實作中的 table | v1.2 Section | 狀態 |
| ----- | ----- | ----- |
| `workflow_runs` | Section 15.4 | ✅ 對齊 |
| `package_install_runs` | ⚠️ **Section 15.4 未列出** | 已實作但文件缺失；下次更新 v1.2 時補入 |
| `approvals`（若有使用） | ⚠️ **禁止使用** | 應改為 `approval_requests`（v1.2 Section 28） |
| `approval_policies` | Section 15.4 | ✅ 對齊 |
| `approval_requests` | Section 15.4 | ✅ 對齊 |

### I4. 命名規則快速參考（v1.2 Section 28）

```
DB table      → plural snake_case       (workflow_runs, approval_requests)
Trigger job   → kebab-case             (apply-manifest, create-wp-site)
TypeScript    → camelCase              (applyManifest, createWpSite)
API endpoint  → kebab-case REST        (/api/workflow-runs, /api/sites)
JSON file     → kebab-case            (wc-core.json, wp-basic.json)
Policy file   → kebab-case            (production-deploy-policy.json)
```

---

## J) v1.2 Master Plan 對齊進度表（v2.0 新增）

> 追蹤每個 v1.2 Phase/Section 的實作狀態。

| v1.2 | 說明 | 狀態 | 對應 Checklist |
| ----- | ----- | ----- | ----- |
| Phase 0 | 統一規格文件 | ✅ 完成 | F1 |
| Phase 1 | 資料地基（Supabase） | ✅ 完成 | B1 (0001-0006) |
| Phase 2 | Package / Manifest 系統 | ⚠️ 部分完成 | B2（wc-core ✅；wp-basic / wp-business ❌） |
| Phase 3 | Provider Adapter | ✅ 完成 | B5 (hosting adapters) |
| Phase 4 | One-click Client OS Workflow | ⚠️ 部分完成 | A7 ❌（shell provision 未完成）；A10-2 ❌ |
| Phase 5 | n8n 輕量自動化 | ⚠️ 部分完成 | C4-4 ✅（export）；實際串接 ❌ |
| Phase 6 | MainWP 維護層 | ❌ 未開始 | C5 前置 |
| Phase 7 | Observability OS | ❌ 未開始 | C5-1 |
| Phase 8 | Approval / Governance | ✅ baseline 完成 | B4；待補 C6-1 命名修正 |
| Phase 9 | Admin UI / Client Portal | ❌ 未開始 | — |
| Phase 10 | Decision Engine v1 | ⚠️ Schema 完成 | H4 ✅；評分邏輯 H8 ❌ |
| Section 22 | Security Baseline | ⚠️ 部分完成 | B4（policy）+ B5（IAM）；Secrets Manager ❌（C5-3）|
| Section 25 | Decision Engine 評分 | ❌ 實作未完成 | H8 |
| Section 28 | Canonical Naming | ❌ 未建文件 | C6-1 |
| Section 29 | Environment & Release | ❌ 未建文件 | C6-2 |
| Section 30 | Backup & DR | ⚠️ 部分完成 | A9（artifacts）；restore test ❌（C6-3）|
| Section 31 | Idempotency & Locking | ❌ 未實作 | C6-4 |
| Section 32 | Plugin Governance | ❌ 未建 | C6-5 |
| Section 33 | Domain / DNS / Email | ❌ 未建 | C6-6 |
| Section 34 | Testing Strategy | ⚠️ 部分完成 | B5（validate scripts）；Contract test ❌（C6-7）|
| Section 35 | Client Data Lifecycle | ❌ 未建 | C6-8 |
| Section 36 | Cost & Profitability | ❌ 未建 | C6-9；H9 |
| Section 37 | Client Communication | ❌ 未建 | C6-10 |
| Section 38 | ADR | ❌ 未建 | C6-11 |
| Section 39 | Known Conflicts Log | ❌ 未建文件 | C6-12 |
