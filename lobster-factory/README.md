# Lobster Factory（Phase 1）— 多租戶骨架

「可長期擴充、先安全後上線」的 WordPress 工廠與 workflow 底座，支撐跨站營運自動化。

**路徑約定**：下文 **`lobster-factory/`** 指本目錄；**`<WORK_ROOT>`** 指 monorepo 根（含 `agency-os/`、`lobster-factory/`、`scripts/`）。在編輯器內對 Markdown 連結 **Ctrl+Click**（Mac：**Cmd+Click**）可開檔。

**與 Agency OS 分工**：治理、雙機、收工閘道、租戶 SOP → [`agency-os/docs/overview/OVERVIEW_INDEX.md`](../agency-os/docs/overview/OVERVIEW_INDEX.md)、[`agency-os/docs/operations/OPS_DOCS_INDEX.md`](../agency-os/docs/operations/OPS_DOCS_INDEX.md)。本 README 以 **龍蝦工程與 `lobster-factory/docs/`** 為主。

---

## 營運一鍵（推薦）

| 時機 | 動作 |
|:---|:---|
| 每日／接案前 | 在 **`lobster-factory/`** 執行 **`npm run operator:sanity`**（全閘道 + staging 管線 regression） |
| 完整操作步驟與環境變數 | [LOBSTER_FACTORY_OPERATOR_RUNBOOK.md](docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md) |

---

## Phase 1 已落地（工程摘要）

| 領域 | 位置 |
|:---|:---|
| Hetzner 全堆疊索引（Agency OS 文件） | [hetzner-stack-rollout-index.md](../agency-os/docs/operations/hetzner-stack-rollout-index.md) |
| Hetzner Phase1 compose／營運契約／維護曆 | [README.md](infra/hetzner-phase1-core/README.md)、[LONG_TERM_OPS.md](infra/hetzner-phase1-core/LONG_TERM_OPS.md)、[MAINTENANCE_CALENDAR.md](infra/hetzner-phase1-core/MAINTENANCE_CALENDAR.md) |
| Phase1 主機唯讀診斷（OOM／慢） | [diagnose-host-resources.sh](infra/hetzner-phase1-core/scripts/diagnose-host-resources.sh)（操作說明見 [hetzner-phase1-core/README.md](infra/hetzner-phase1-core/README.md)「主機資源診斷」） |
| Sentry 手動驗證（next-admin） | [sentry-test/route.ts](infra/hetzner-phase1-core/apps/next-admin/app/api/sentry-test/route.ts)；compose／DSN 見同目錄 `docker-compose.yml`、`.env.example`；**證據**見 `agency-os/WORKLOG.md` **`## 2026-04-12`** |
| `packages/workflows` 單元測試（Vitest） | `packages/workflows/`（`npm test`；[`vitest.config.ts`](packages/workflows/vitest.config.ts)、`src/hosting/*.test.ts`） |
| Supabase migrations + seeds | `packages/db/migrations/`（`0001_core.sql`～`0006_seed_catalog.sql`） |
| WP manifest（Phase 1：`wc-core`） | `packages/manifests/wc-core.json` |
| Durable workflow 骨架 | `packages/workflows/src/trigger/create-wp-site.ts`、`apply-manifest.ts`（adapter 合約見下表 **Hosting**） |
| 安全 | manifest schema 驗證、governance JSON 驗證（`npm run validate` 一併檢查） |

---

## 文件導覽（`lobster-factory/docs/`，連結文字即檔名）

### 與 Agency OS 交界

| 說明 | 檔案 |
|:---|:---|
| AO + 龍蝦事件與節奏（單一入口） | [ao-lobster-operating-model.md](../agency-os/docs/overview/ao-lobster-operating-model.md) |

### 總檢核／路線圖／架構

| 說明 | 檔案 |
|:---|:---|
| 主檢核清單 | [LOBSTER_FACTORY_MASTER_CHECKLIST.md](docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md) |
| M1～M5 路線圖 | [LOBSTER_FACTORY_COMPLETION_PLAN_V2.md](docs/LOBSTER_FACTORY_COMPLETION_PLAN_V2.md) |
| MASTER V3 落地整合 | [LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md](docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md) |
| V3 模組 skeleton 對照 | [V3_MODULE_SKELETONS.md](docs/V3_MODULE_SKELETONS.md) |
| H6 治理 gate | [V3_GOVERNANCE_GATES.md](docs/V3_GOVERNANCE_GATES.md) |
| 單一真實來源地圖 | [ARCHITECTURE_CANONICAL_MAP.md](docs/ARCHITECTURE_CANONICAL_MAP.md) |

### Routing（強制語意 + 人讀矩陣 + 機讀閘道）

| 說明 | 檔案 |
|:---|:---|
| MCP／task 路由規格（**最高**） | [MCP_TOOL_ROUTING_SPEC.md](docs/MCP_TOOL_ROUTING_SPEC.md) |
| 路由矩陣 | [ROUTING_MATRIX.md](docs/ROUTING_MATRIX.md) |
| 機讀政策（驗證腳本讀取） | [workflow-risk-matrix.json](workflow-risk-matrix.json) |

### E2E／Staging／演練

| 說明 | 檔案 |
|:---|:---|
| C3-1 標準 E2E payload | [STAGING_PIPELINE_E2E_PAYLOAD.md](docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md) |
| A10-1 營運劇本與證據順序 | [OPERABLE_E2E_PLAYBOOK.md](docs/e2e/OPERABLE_E2E_PLAYBOOK.md) |
| C3-2 演練報告範本 | [STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md](docs/e2e/STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md) |

### WordPress 工廠執行與一次性 Runbook

| 說明 | 檔案 |
|:---|:---|
| 固定執行通道 | [WORDPRESS_FACTORY_EXECUTION_SPEC.md](docs/WORDPRESS_FACTORY_EXECUTION_SPEC.md) |
| C1 一次性實戰流程 | [C1_EXECUTION_RUNBOOK.md](docs/C1_EXECUTION_RUNBOOK.md) |

### Hosting adapter（`create-wp-site`）

| 說明 | 檔案 |
|:---|:---|
| 合約總覽 | [HOSTING_ADAPTER_CONTRACT.md](docs/hosting/HOSTING_ADAPTER_CONTRACT.md) |
| Mock | [MOCK_HOSTING_ADAPTER.md](docs/hosting/MOCK_HOSTING_ADAPTER.md) |
| HTTP JSON | [HTTP_JSON_HOSTING_ADAPTER.md](docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md) |

### Artifacts（A9）與相關

| 說明 | 檔案 |
|:---|:---|
| 生命週期政策 | [ARTIFACTS_LIFECYCLE_POLICY.md](docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md) |
| IAM 邊界 | [ARTIFACTS_IAM_BOUNDARY.md](docs/operations/ARTIFACTS_IAM_BOUNDARY.md) |
| 本機 sink | [LOCAL_ARTIFACTS_SINK.md](docs/operations/LOCAL_ARTIFACTS_SINK.md) |
| Remote PUT／presign | [REMOTE_PUT_ARTIFACTS.md](docs/operations/REMOTE_PUT_ARTIFACTS.md) |
| Presign broker 最小說明 | [PRESIGN_BROKER_MINIMAL.md](docs/operations/PRESIGN_BROKER_MINIMAL.md) |
| R2→S3 遷移 Runbook | [R2_TO_S3_MIGRATION_RUNBOOK.md](docs/operations/R2_TO_S3_MIGRATION_RUNBOOK.md) |

### 本機 WordPress（Windows）

| 說明 | 檔案 |
|:---|:---|
| 本機 WP／MariaDB／WP-CLI | [LOCAL_WORDPRESS_WINDOWS.md](docs/operations/LOCAL_WORDPRESS_WINDOWS.md) |

---

## 建立／驗證（本機）

**路徑**：閘道腳本在 **monorepo 根** `<WORK_ROOT>`；`npm run …` 在 **`lobster-factory/`** 目錄執行。

| # | 做什麼 | 指令（摘） |
|:---:|:---|:---|
| 0 | 一鍵全閘道（Lobster + Agency OS） | `powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1`（於 `<WORK_ROOT>`） |
| 0b | 僅龍蝦工程閘道 | 同上，加 `-LobsterOnly` |
| 1 | 統整健檢（manifest／governance／doc 連結） | `npm run validate` 或 `node scripts/bootstrap-validate.mjs`（於 `lobster-factory/`） |
| 2 | 只驗 manifest | `node scripts/validate-manifests.mjs` |
| 3 | 只驗 governance configs | `node scripts/validate-governance-configs.mjs` |
| 4 | 只驗 workflow routing policy | `node scripts/validate-workflow-routing-policy.mjs` |
| 5 | V3 治理 gate（H6） | `node scripts/run-v3-governance-gates.mjs` |
| 6 | `workflow_runs` 寫入（預設 dryrun） | `node scripts/validate-workflow-runs-write.mjs`（參數見原腳本 `--help`） |
| 7 | 單庫 clone、無 `agency-os` | 設 `LOBSTER_SKIP_AGENCY_CANONICAL=1` 再跑 doc 完整性檢查 |
| 8 | `package_install_runs` 狀態流 | `node scripts/validate-package-install-runs-flow.mjs` |
| 9 | DB 寫入韌性 | `node scripts/validate-db-write-resilience.mjs` |
| 10 | Staging 管線回歸（C3-1） | `npm run regression:staging-pipeline` |
| 11 | 演練報告（C3-2） | `npm run drill:staging-report`（輸出至 `agency-os/reports/e2e/`） |
| 12 | `create-wp-site` payload JSON | `npm run payload:create-wp-site -- --help` |

<details>
<summary><strong>展開：含範例參數的長指令（workflow_runs／package_install／本機 apply-manifest）</strong></summary>

`workflow_runs` dryrun 範例（真寫入加 `--execute=1` 並設定 Supabase env）：

```text
node scripts/validate-workflow-runs-write.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444
```

`package_install_runs` 範例：見腳本內說明；`validate-package-install-runs-flow.mjs` 需對應 org／workspace／site／environment／workflowRunId。

本機 `apply-manifest` dry run（路徑請換成你的 `wp` 根目錄）：

```powershell
node scripts/execute-apply-manifest-staging.mjs `
  --organizationId=11111111-1111-1111-1111-111111111111 `
  --workspaceId=22222222-2222-2222-2222-222222222222 `
  --projectId=33333333-3333-3333-3333-333333333333 `
  --siteId=44444444-4444-4444-4444-444444444444 `
  --environmentId=55555555-5555-5555-5555-555555555555 `
  --wpRootPath="D:\path\to\wordpress" `
  --execute=0
```

</details>

---

## （可選）Supabase 真寫入

Phase 1 預設不寫 DB。需明確開關與 **vault 內**的 URL／service role（勿提交 repo）。

| 變數 | 用途 |
|:---|:---|
| `LOBSTER_ENABLE_DB_WRITES=true` | 允許 PostgREST insert |
| `LOBSTER_SUPABASE_URL` | API 根（Cloud 或自架反代） |
| `LOBSTER_SUPABASE_SERVICE_ROLE_KEY` | 僅受控環境 |

行為摘要：`apply-manifest` 寫 `workflow_runs`、`package_install_runs`；`create-wp-site` 寫 `workflow_runs`（staging 後續依 Phase 銜接）。

---

## M3：staging manifest 真執行（bash／wp-cli，預設關閉）

| 變數／主題 | 說明 |
|:---|:---|
| `LOBSTER_EXECUTE_MANIFEST_STEPS` | `true` 才跑 shell |
| `LOBSTER_MANIFEST_EXECUTION_MODE` | `dry_run`（預設）或 `apply` |
| `LOBSTER_REPO_ROOT` | 指向 `lobster-factory` 根（bundle 情境） |
| `LOBSTER_BASH` | 自訂 bash（Windows 常用 Git `bash.exe`） |
| `LOBSTER_MANIFEST_SHELL_TIMEOUT_MS` / `LOBSTER_MANIFEST_SHELL_MAX_ATTEMPTS` | 逾時與重試 |

Hosting 選型仍見 [HOSTING_ADAPTER_CONTRACT.md](docs/hosting/HOSTING_ADAPTER_CONTRACT.md)（`LOBSTER_HOSTING_ADAPTER`：`none`／`mock`／`provider_stub` 等）。

Artifacts：`LOBSTER_ARTIFACTS_MODE=local`／`remote_put` 等見 [LOCAL_ARTIFACTS_SINK.md](docs/operations/LOCAL_ARTIFACTS_SINK.md)、[REMOTE_PUT_ARTIFACTS.md](docs/operations/REMOTE_PUT_ARTIFACTS.md)。

DB 與 shell 同步：先 `running` 再 PATCH `completed`／`failed`；實作見 `packages/workflows/src/db/supabase/supabaseRestInsert.ts`（`supabaseRestPatch`）。

### C2-3 最小 rollback

- Shell：`templates/woocommerce/scripts/rollback-from-manifest.sh`
- CLI：`scripts/rollback-apply-manifest-staging.mjs`（`--execute=0|1`）
- 深度：`ROLLBACK_DEEP=1`（慎用）；完整還原仍依 hosting snapshot／backup。

---

## GitHub Actions（`packages/workflows`）

- **`main`** 上變更 `lobster-factory/packages/workflows/**` 可觸發 validate（見 repo `.github/workflows`）；**Trigger Cloud deploy 已自 CI 移除**；生產以自託管為準。
- 與 **AO-CLOSE**：純 `agency-os` 治理變更的 push **通常不**觸發龍蝦 workflow。
- 路徑與除錯 SSOT：[github-actions-trigger-prod-deploy.md](../agency-os/docs/operations/github-actions-trigger-prod-deploy.md)。

---

## 下一個最佳步驟（建議）

1. 關閉寫入下，用真實 payload 跑通「insert template + row payload」可觀測性。  
2. 再開 `workflow_runs` → 確認可追蹤 → 再加 `package_install_runs`。  
3. 文件變更時：**Routing 三件套**（`MCP_TOOL_ROUTING_SPEC.md`、`ROUTING_MATRIX.md`、`workflow-risk-matrix.json`）同 PR 更新，避免閘道漂移。

---

## 長期維護節奏（對齊治理）

| 頻率 | 做什麼 |
|:---|:---|
| 每次改 routing 語意 | 同步 spec + matrix + JSON + [`TOOLS_DELIVERY_TRACEABILITY.md`](../agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md) 若涉 TASKS |
| 每次改龍蝦 docs 索引 | 更新本 README 上表（本檔為 **lobster-factory 入口 SSOT**） |
| 收工／健康 | monorepo 根 `verify-build-gates`、Agency OS `system-health-check` 依你方 AO 流程 |
