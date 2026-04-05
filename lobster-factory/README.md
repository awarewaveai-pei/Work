# Lobster Factory (Phase 1) - Multi-tenant Platform Skeleton

這是一套「可長期擴充、先安全後上線」的多租戶底座，用來支撐你要的跨國電商網站營運自動化。

## 營運一鍵（推薦）
- **每日／接案前**：在 `lobster-factory` 執行 **`npm run operator:sanity`**（= 全閘道 + staging 管線 regression）。
- **操作手冊（完整步驟與環境變數）**：[`docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`](docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md)

## Phase 1 目前已落地
- Supabase multi-tenant foundation（僅先提供 migration + catalog seeds）
  - `packages/db/migrations/0001_core.sql` ~ `0006_seed_catalog.sql`
- WP Factory manifest（目前 Phase 1 只支援 `wc-core`）
  - `packages/manifests/wc-core.json`
- Durable workflow（Trigger.dev 風格的 workflow 骨架）
  - `packages/workflows/src/trigger/create-wp-site.ts`（`LOBSTER_HOSTING_ADAPTER`：`mock` / `http_json` / `none` / `provider_stub` — `docs/hosting/HOSTING_ADAPTER_CONTRACT.md`）
  - `packages/workflows/src/trigger/apply-manifest.ts`
- 安全檢查
  - manifest schema 驗證（staging-only guardrail）
  - governance config（agent/policy JSON）驗證

## 全流程進度看板（建議每天先看）
- `../agency-os/docs/overview/ao-lobster-operating-model.md`（AO + 龍蝦跨系統運作模型，事件節奏單一入口）
- `docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`
- `docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`（C3-1 標準 E2E payload）
- `docs/e2e/OPERABLE_E2E_PLAYBOOK.md`（A10-1 營運劇本與證據順序）
- `docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md`（A9 留存／存取原則）
- `docs/C1_EXECUTION_RUNBOOK.md`（C1 一次性實戰流程）
- `docs/LOBSTER_FACTORY_COMPLETION_PLAN_V2.md`（M1~M5 路線圖）
- `docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`（MASTER_V3 落地整合）
- `docs/V3_GOVERNANCE_GATES.md`（H6 可執行治理 gate）
- `docs/ARCHITECTURE_CANONICAL_MAP.md`（單一真實來源地圖，避免重複與分散）
- `docs/MCP_TOOL_ROUTING_SPEC.md`（工具分工與強制 routing 規範）
- `docs/WORDPRESS_FACTORY_EXECUTION_SPEC.md`（WordPress Factory 固定執行通道）
- `docs/e2e/STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md`（C3-2）
- `docs/hosting/HOSTING_ADAPTER_CONTRACT.md`（`create-wp-site` 選型）
- `docs/hosting/MOCK_HOSTING_ADAPTER.md`（mock 細節）
- `docs/operations/LOCAL_ARTIFACTS_SINK.md`（A9 本機 artifacts）
- `docs/operations/REMOTE_PUT_ARTIFACTS.md`（A9 雲端／presigned PUT）
- `docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md`（hosting HTTP 控制面）

## 建立/驗證（本機可直接跑）
0. **一鍵全閘道（推薦，含 Lobster + Agency OS health）** — 在 `D:\Work`：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1`
   - 僅工程、略過治理健檢：`.\scripts\verify-build-gates.ps1 -LobsterOnly`
1. 統整健檢（會檢查檔案是否存在 + manifest/governance/**doc 連結**）
   - `npm run validate`（於 `lobster-factory` 目錄，需 Node 18+）
   - 或：`node scripts/bootstrap-validate.mjs`

2. 只驗 manifest
   - `node D:\Work\lobster-factory\scripts\validate-manifests.mjs`

3. 只驗 governance configs
   - `node D:\Work\lobster-factory\scripts\validate-governance-configs.mjs`

4. 只驗 workflow routing policy
   - `node D:\Work\lobster-factory\scripts\validate-workflow-routing-policy.mjs`

5. 跑 V3 治理 gate（H6）
   - `node D:\Work\lobster-factory\scripts\run-v3-governance-gates.mjs`
6. 驗證 `workflow_runs` 寫入（預設 dryrun，不寫 DB）
   - `node D:\Work\lobster-factory\scripts\validate-workflow-runs-write.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444`
   - 真寫入時加 `--execute=1`，並先設好 `LOBSTER_SUPABASE_URL` / `LOBSTER_SUPABASE_SERVICE_ROLE_KEY`

7. 僅 clone `lobster-factory`、沒有同層 `agency-os` 時：doc 檢查可設 `LOBSTER_SKIP_AGENCY_CANONICAL=1` 再跑 `validate-doc-integrity.mjs`（CI 單庫情境）

8. 驗證 `package_install_runs` 狀態流（預設 dryrun，不寫 DB）
   - `node D:\Work\lobster-factory\scripts\validate-package-install-runs-flow.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --workflowRunId=66666666-6666-6666-6666-666666666666`
   - 真寫入時加 `--execute=1`（會執行 pending -> running -> completed）

9. 驗證 DB 寫入韌性（重試/補償/可觀測，預設 dryrun）
   - `node D:\Work\lobster-factory\scripts\validate-db-write-resilience.mjs`
   - 真寫入時加 `--execute=1`（會帶 `x-lobster-trace-id` 並套用 retry policy）

10. **Staging 管線回歸（C3-1，可重跑）**
   - `npm run regression:staging-pipeline`（或 `node scripts/run-staging-pipeline-regression.mjs --mode=fast`）
   - 加真 WP 根目錄可多跑一步：`--wpRootPath="D:\path\to\wordpress"`（`install-from-manifest` 的 DRY_RUN 預覽）

11. **演練報告產出（C3-2）**
   - `npm run drill:staging-report` → 寫入 `../agency-os/reports/e2e/staging-pipeline-drill-*.md`（預設會跑一回 regression 取 exit code；`--runRegression=0` 可略過）

12. **`create-wp-site` Trigger payload（JSON）**
   - `npm run payload:create-wp-site`（可選 `--siteName=`、`--siteId=` 等，見 `--help`）

## （可選）開啟 Supabase 真寫入：完全靠環境變數
Phase 1 預設「不會真的寫入 DB」。  
只有在你明確打開開關時，`apply-manifest`（以及 `create-wp-site`）才會透過 Supabase PostgREST insert 寫入。

### 需要設定的環境變數（示例，用你的實值替換）
- `LOBSTER_ENABLE_DB_WRITES=true`
- `LOBSTER_SUPABASE_URL=https://<project-ref>.supabase.co`
- `LOBSTER_SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`

### 寫入行為說明（Phase 1）
- `apply-manifest`
  - 預先 seed/參照：`wc-core` 的固定 catalog IDs
  - insert：`workflow_runs`、`package_install_runs`
- `create-wp-site`
  - insert：`workflow_runs`（Phase 1 staging 的後續環節還未接滿）

> 注意：我沒有把任何金鑰寫死在程式或檔案裡；你只要用環境變數提供即可。

## M3：staging manifest 真執行（bash / wp-cli，預設關閉）
`apply-manifest` Trigger 任務與本機 CLI 可呼叫 `templates/woocommerce/scripts/install-from-manifest.sh`。**預設不會跑 shell**；僅在明確開啟時執行，且仍受 `environmentType=staging` + manifest `staging-only` 約束。

### Trigger / 程式內（`apply-manifest`）
- `LOBSTER_EXECUTE_MANIFEST_STEPS=true`：啟用 shell 步驟。
- `LOBSTER_MANIFEST_EXECUTION_MODE=dry_run`（預設）：`DRY_RUN=1`，可比對 dryrun JSON 與實際將執行的 wp-cli 列印。
- `LOBSTER_MANIFEST_EXECUTION_MODE=apply`：真寫入 WP（需該執行環境有 `bash` + `wp` + 有效 `wpRootPath`）。雲端 Worker 若無 WP，請勿設為 `apply`，或改設 `LOBSTER_REPO_ROOT` 並在自架 Runner 上跑。
- `LOBSTER_REPO_ROOT`：指向 `lobster-factory` 根目錄（bundle/無法向上尋找 `wc-core.json` 時必填）。
- `LOBSTER_BASH`：自訂 bash 路徑（Windows 常用 Git `bash.exe`）。
- `LOBSTER_MANIFEST_SHELL_TIMEOUT_MS` / `LOBSTER_MANIFEST_SHELL_MAX_ATTEMPTS`：逾時與重試（預設 120000ms、2 次）。

### 本機一鍵（與 dryrun 相同 tenant 參數）
```powershell
node D:\Work\lobster-factory\scripts\execute-apply-manifest-staging.mjs `
  --organizationId=11111111-1111-1111-1111-111111111111 `
  --workspaceId=22222222-2222-2222-2222-222222222222 `
  --projectId=33333333-3333-3333-3333-333333333333 `
  --siteId=44444444-4444-4444-4444-444444444444 `
  --environmentId=55555555-5555-5555-5555-555555555555 `
  --wpRootPath="D:\path\to\wordpress" `
  --execute=0
```
`--execute=1` 為真套用；預設 `--execute=0` 等同 dry run。

### Hosting 選擇（`create-wp-site`）
- 預設 **`LOBSTER_HOSTING_ADAPTER=none`**（或未設）→ 維持 TODO 占位。
- **`mock`**：合成 staging 參照（見 `docs/hosting/MOCK_HOSTING_ADAPTER.md`）。
- **`provider_stub`**：檢查 `LOBSTER_HOSTING_PROVIDER_BASE_URL`、`LOBSTER_HOSTING_API_TOKEN` 後回 **`blocked_hosting_configuration`**（Phase 1 無 HTTP 實作）。
- 合約總覽：`docs/hosting/HOSTING_ADAPTER_CONTRACT.md`

### 本機 artifacts（A9 baseline，`apply-manifest`）
- `LOBSTER_ARTIFACTS_MODE=local` + `LOBSTER_WORK_ROOT` 或 `LOBSTER_ARTIFACTS_BASE_DIR` → 寫入 `agency-os/reports/artifacts/lobster/apply-manifest/<workflowRunId>/`，並 PATCH **`logs_ref`**。
- `LOBSTER_ARTIFACTS_MODE=remote_put` + presign URL 或 inline descriptor → HTTP PUT 至 R2/S3 presigned（無 SDK），見 `docs/operations/REMOTE_PUT_ARTIFACTS.md`。
- 說明：`docs/operations/LOCAL_ARTIFACTS_SINK.md`

### DB 與 shell 同步（`LOBSTER_ENABLE_DB_WRITES=true` 且啟用 shell）
- 寫入時若會跑 shell：先 insert `workflow_runs` / `package_install_runs` 為 **`running`**，shell 成功後 **PATCH** 為 **`completed`** 並寫入 `output_snapshot` / `result_summary`（含 `shellExecution` 摘要）；失敗則 PATCH 為 **`failed`** 並附錯誤訊息。
- Adapter：`packages/workflows/src/db/supabase/supabaseRestInsert.ts` 的 **`supabaseRestPatch`**。

### C2-3：最小 rollback（本機）
- Shell：`templates/woocommerce/scripts/rollback-from-manifest.sh`（依 manifest **反向**處理；plugin `deactivate`；theme 僅提示需手動或快照）。
- CLI：`scripts/rollback-apply-manifest-staging.mjs`（`--execute=0|1`，與 install 相同 tenant 參數形狀）。
- 深度解除安裝（**慎用**）：環境變數 `ROLLBACK_DEEP=1` 會對 plugin 加跑 `uninstall`。
- **完整還原**仍建議依 hosting **snapshot / backup**（見 manifest `rollback.strategy`）。

## 下一個最佳步驟（建議）
- 先在不開寫入的狀態下，拿你實際的 payload 跑出「db insert template + row payload」
- 再逐步開啟 DB 寫入（先寫 `workflow_runs`，確認可追蹤，再加 `package_install_runs`）

