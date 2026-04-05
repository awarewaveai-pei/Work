# Lobster Factory Master Checklist

> 用途：集中追蹤「一人跨國公司底座」的完整建置流程、目前進度、未完成項目，避免遺漏與重工。  
> 單一真實來源：本檔 + [`agency-os/TASKS.md`](../../agency-os/TASKS.md)（跨系統任務板）。

## A) 全流程總覽（由上到下）
- [x] A1. 定義 Phase 1 範圍（先安全可驗證，再逐步開啟真寫入）
- [x] A2. 建立多租戶 DB migration 基礎（core/factory/governance/RLS/seeds/catalog）
- [x] A3. 建立 manifest 規格與 `wc-core` 範本
- [x] A4. 建立 durable workflow 骨架（`create-wp-site`、`apply-manifest`）
- [x] A5. 建立結構驗證與 fail-fast gate（bootstrap/manifests/governance/dryrun validate）
- [x] A6. 串接 hosting provider adapter（`none` / `mock` / `provider_stub` / **`http_json`**；**專屬 vendor SDK** 仍可待 `providers/<name>.ts`）
- [ ] A7. 串接 WordPress 真正 provision/shell execution（仍須 guardrails；**manifest 套用 shell 已具備**，全站自動建站仍待 hosting adapter）
- [x] A8. 打通 DB 真寫入完整流程（`apply-manifest`：`workflow_runs` / `package_install_runs` insert + shell 時 `running`→PATCH 終態；**不含** `create-wp-site` 端到端建站）
- [x] A9. artifacts／rollback／錯誤回復（**技術 baseline**：rollback + DB `failed` + `local`／`remote_put` + `logs_ref`；**治理 baseline**：`ARTIFACTS_LIFECYCLE_POLICY` + `ARTIFACTS_IAM_BOUNDARY` + `validate/audit-artifacts-governance`；雲廠商實際 bucket/IaC 可在後續迭代）
- [x] A10-1. E2E **營運劇本 + 結構閘道**（`docs/e2e/OPERABLE_E2E_PLAYBOOK.md` + `scripts/validate-operable-e2e-skeleton.mjs` → `bootstrap-validate`）
- [ ] A10-2. **商業閉環**：新客戶從建立→驗收 + 生產 Trigger 全鏈固定證據（對齊 `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md` 實跑）

## B) 目前已完成（依現況勾選）
### B1. DB / Catalog
- [x] `packages/db/migrations/0001_core.sql`
- [x] `packages/db/migrations/0002_factory.sql`
- [x] `packages/db/migrations/0003_agents_approvals_observability.sql`
- [x] `packages/db/migrations/0004_rls_helpers.sql`
- [x] `packages/db/migrations/0005_seed_minimum.sql`
- [x] `packages/db/migrations/0006_seed_catalog.sql`（固定 catalog IDs）

### B2. Manifest / API Types / Service
- [x] `packages/manifests/wc-core.json`（Phase 1: staging-only）
- [x] `apps/api/src/types/manifest.ts`
- [x] `apps/api/src/services/wp/wpFactory.ts`

### B3. Workflows / DB Adapter
- [x] `packages/workflows/src/trigger/create-wp-site.ts`
- [x] `packages/workflows/src/trigger/apply-manifest.ts`
- [x] `packages/workflows/src/db/catalogIds.ts`
- [x] `packages/workflows/src/db/sql/workflowRunsSql.ts`
- [x] `packages/workflows/src/db/sql/packageInstallRunsSql.ts`
- [x] `packages/workflows/src/db/supabase/supabaseRestInsert.ts`（insert；**PATCH 終態**：同檔 `supabaseRestPatch`）

### B4. Governance / Agent / Policy
- [x] `packages/agents/src/configs/repair-agent.json`
- [x] `packages/agents/src/validators/repairAgentConfigValidator.ts`
- [x] `packages/agents/src/loaders/loadRepairAgentConfig.ts`
- [x] `packages/policies/approval/production-deploy-policy.json`
- [x] `packages/policies/tool/repair-agent-policy.json`
- [x] `packages/policies/src/validators/policiesValidator.ts`
- [x] `packages/policies/src/loaders/loadPoliciesFromFiles.ts`

### B5. Validation / Acceptance Gates
- [x] `scripts/bootstrap-validate.mjs`
- [x] `scripts/validate-manifests.mjs`
- [x] `scripts/validate-governance-configs.mjs`
- [x] `scripts/dryrun-apply-manifest.mjs`
- [x] `scripts/validate-dryrun-apply-manifest.mjs`（`--mode=strict|fast`）
- [x] `packages/workflows/src/executor/installManifestStaging.ts`（M3 shell 執行器）
- [x] `scripts/execute-apply-manifest-staging.mjs`（本機 staging 執行 CLI）
- [x] `scripts/validate-staging-manifest-executor.mjs`（結構閘道）
- [x] `templates/woocommerce/scripts/rollback-from-manifest.sh`（C2-3 baseline）
- [x] `scripts/rollback-apply-manifest-staging.mjs`
- [x] `supabaseRestPatch`（`package_install_runs` / `workflow_runs` 終態更新）
- [x] `docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`（C3-1 固定欄位）
- [x] `scripts/run-staging-pipeline-regression.mjs`（C3-1 可重跑回歸）
- [x] `scripts/validate-workflows-integrations-baseline.mjs`（hosting 解析 + artifact sink 結構閘道）
- [x] `docs/hosting/HOSTING_ADAPTER_CONTRACT.md` + `providerStubAdapter` + `resolveStagingProvisioning`
- [x] `docs/operations/LOCAL_ARTIFACTS_SINK.md` + `localArtifactSink.ts`
- [x] `docs/operations/REMOTE_PUT_ARTIFACTS.md` + `artifactMode.ts` + `remotePutArtifactSink.ts`
- [x] `docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md` + `providers/httpJsonStagingAdapter.ts`
- [x] `packages/workflows/src/hosting/providers/`（`StagingProvisionAdapter` 合約 + README）
- [x] `scripts/print-create-wp-site-payload.mjs` + `npm run payload:create-wp-site`
- [x] `scripts/print-apply-manifest-payload.mjs` + `npm run payload:apply-manifest`
- [x] `npm run operator:sanity` + `docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`
- [x] `docs/e2e/OPERABLE_E2E_PLAYBOOK.md` + `scripts/validate-operable-e2e-skeleton.mjs`（A10-1）
- [x] `docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md`（A9 政策層）
- [x] `docs/operations/ARTIFACTS_IAM_BOUNDARY.md` + `policies/artifacts/artifacts-governance-baseline.json`
- [x] `scripts/validate-artifacts-governance.mjs` + `scripts/audit-artifacts-governance.mjs`
- [x] `docs/operations/PRESIGN_BROKER_MINIMAL.md` + `templates/lobster/presign-response.success.example.json`（remote_put 整合輔助）
- [x] `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md` Step 7（Lobster／A10-2 銜接）

## C) 尚未完成（下一步主線，避免重工）
### C1. 寫入鏈路（先小後大）
- [x] C1-1. 先只開 `LOBSTER_ENABLE_DB_WRITES=true` 驗證 `workflow_runs` 寫入（execute PASS，`insertedId=1e53ec18-1c01-4547-9593-20feee6bdc2c`）
- [x] C1-2. 再接 `package_install_runs` 寫入與狀態流（execute PASS，`installRunId=206bd6ee-f5e0-4b6a-810c-bbb9914844f4`；`pending -> running -> completed`；**公司桌機複核**：`installRunId=ae8c6e48-fac9-4ac6-8721-d142c831c620`、`workflowRunId=73c91be3-3663-4977-aa9a-4c2b7e24dd97`）
- [x] C1-3. 補齊 DB 寫入錯誤處理（execute PASS，`traceId=resilience-4c1b0ea6-84a3-4a8a-8c01-5ce648dd6099`、`insertedWorkflowRunId=77f43da0-6fc6-4ce6-bc3b-f3d139fc783c`）

### C2. 執行鏈路（staging-only）
- [x] C2-1. hosting adapter（`resolveStagingProvisioning`：`none`/`mock`/`provider_stub`/`http_json`/未知 blocked + async；`create-wp-site` 回傳 `vendor_staging_provisioned`／`mock_staging_provisioned`；**專屬** vendor SDK 仍可待 `providers/<name>.ts`）
- [x] C2-2. WP 實際安裝步驟執行器（對應 manifest steps；`install-from-manifest.sh` + `execute-apply-manifest-staging.mjs` + `apply-manifest` 可選 env 串接；預設關閉 shell）
- [x] C2-3. rollback 實作（baseline：`rollback-from-manifest.sh` + `rollback-apply-manifest-staging.mjs`；plugin 反向 deactivate／可選 uninstall；theme 手動；**完整還原**仍依 hosting snapshot）

### C3. 驗收與可運營
- [x] C3-1. 建立一套標準 E2E 測試 payload（真實欄位；`docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md` + `npm run regression:staging-pipeline`）
- [x] C3-2. 完成一次端到端演練並留存報告（**baseline**：`emit-staging-drill-report.mjs` + 模板 + `agency-os/reports/e2e/`；實跑後請補證據欄位與人工 checklist）
- [x] C3-3. 設計 release gate（PR gate：`.github/workflows/release-gate-main.yml` + prod deploy 前 `gate` job）

### C4. 規格差距補齊（raw spec 對齊）
- [x] C4-1. 建立 `templates/woocommerce/scripts/install-from-manifest.sh`
- [x] C4-2. 建立 `templates/woocommerce/scripts/smoke-test.sh`
- [x] C4-3. 建立 `infra/github/workflows/validate-manifest.yml`
- [x] C4-4. 建立 `infra/n8n/exports/client-onboarding-flow.json`
- [x] C4-5. 建立 `docs/ROUTING_MATRIX.md`（或 `002_ROUTING_MATRIX.md`）

### C5. Enterprise 補強（工具層）
- [ ] C5-1. Observability：Sentry（錯誤追蹤）+ PostHog（產品分析）
- [ ] C5-2. Edge/Security：Cloudflare（WAF/CDN/Rate limit）
- [ ] C5-3. Secrets：1Password Secrets Automation（或同級）
- [ ] C5-4. Identity/Org：Clerk/WorkOS/Auth0（三選一）
- [ ] C5-5. Cost/Decision：成本與決策引擎可觀測化（budget/ROI guardrails）
- [ ] C5-6. 後續建議：Langfuse / Upstash / Stripe / Object Storage / Search

## D) 每次開工/收工要看什麼
> 事件流程單一真相：開工以 `agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md` 為準；收工以 `agency-os/docs/operations/end-of-day-checklist.md` + `agency-os/.cursor/rules/40-shutdown-closeout.mdc` 為準。

### 開工（AO-RESUME 後）
- [ ] 先看本檔 C 區（尚未完成）只挑 1 條主線
- [ ] 對照 `agency-os/TASKS.md` 是否已有相同任務，避免重開重做
- [ ] 執行前先決定今天跑 `strict` 或 `fast` 驗收模式

### 收工（AO-CLOSE 前）
- [ ] 今日改動是否更新到本檔（B/C 區勾選）
- [ ] 今日證據是否回寫到 `agency-os/WORKLOG.md` 與 `memory/daily/YYYY-MM-DD.md`
- [ ] 今日是否已跑對應 gate（至少 `dryrun + validate`）

### C1 專用流程
- [ ] 需要執行 C1 時，先照 `docs/C1_EXECUTION_RUNBOOK.md` 跑完整順序（dryrun -> execute -> acceptance）

## E) 驗收命令（直接可跑）
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

## F) 本次重讀結論（2026-03-25）
- 已重讀：
  - `docs/spec/raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md`
  - `docs/spec/raw/CURSOR_PACK_V1.md`
  - `docs/spec/raw/ENTERPRISE_BASE_STACK.md`
- 已確認現況缺口（repo 尚未存在）：
  - （已完成）C4-1~C4-5 raw spec 差距第一輪補齊

## G) 完工路線圖（v2）
- 主要執行文件：`docs/LOBSTER_FACTORY_COMPLETION_PLAN_V2.md`
- V3 整合文件：`docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`
- 推進原則：依 M1 -> M5 順序，不跳關。
- 每個 milestone 完成後，回寫 `agency-os/WORKLOG.md` 與 `agency-os/memory/daily/YYYY-MM-DD.md` 證據。

## H) MASTER V3 整合追蹤（2026-03 啟用）
- [x] H1. 匯入來源文件：`D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md`
- [x] H2. 建立整合計畫：`docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`
- [x] H3. 依 V3 建立缺口模組骨架（Sales/Marketing/Partner/Media/Decision Engine/Merchandising；`0007_v3_skeleton_modules.sql` + `v3-skeleton.ts` + `v3-module-skeleton-workflows.ts` + `V3_MODULE_SKELETONS.md`）
- [x] H4. 補 Decision Engine baseline（recommendations schema + workflow skeleton；`0008_decision_engine_recommendations.sql` + `decision-engine-baseline.ts`）
- [x] H5. 補 CX retention/upsell workflow baseline（與 `workflow_runs` 串接；`0009_cx_retention_upsell_baseline.sql` + `cx-retention-upsell-baseline.ts`）
- [x] H6. 將 V3 合規/治理要求轉為可執行 gate（baseline：`v3-governance-gate-policy.json` + `run-v3-governance-gates.mjs` + bootstrap 整合）

