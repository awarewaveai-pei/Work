# Operable E2E playbook（Phase 1 — staging）

> **A10 baseline**：從「本機可驗證」到「可留證據」的**固定順序**。  
> 欄位與 UUID 仍以 [`STAGING_PIPELINE_E2E_PAYLOAD.md`](STAGING_PIPELINE_E2E_PAYLOAD.md) 為準。  
> 真 Trigger 生產全鏈、新客戶商業驗收 → 見 **A10-2**（`LOBSTER_FACTORY_MASTER_CHECKLIST.md`）。  
> 新客戶導入時請與 Agency **`NEW_TENANT_ONBOARDING_SOP.md` Step 7** 一併執行（monorepo：`agency-os/tenants/…`）。

## 0) 一次綠燈（必跑）

在 `lobster-factory`：

```powershell
cd D:\Work\lobster-factory
npm run operator:sanity
```

或 monorepo 根（含 Agency health）：

```powershell
cd D:\Work
powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1
```

**證據**：終端 exit code **0**；Agency 時另存 `agency-os/reports/health/health-*.md` 路徑（可選）。

## 1) 產出 Trigger／手動測試用 JSON

```powershell
cd D:\Work\lobster-factory
npm run payload:create-wp-site -- --siteName=demo-staging-site
npm run payload:apply-manifest -- --wpRootPath="D:\Work\dummy"
```

**證據**：兩段 stdout 皆為合法 JSON（可貼 Trigger 測試面板或存成 artifact）。

## 2) Dryrun / 本機 staging（不開 DB、不開 shell）

已含在 `operator:sanity` 內之 regression。單獨重跑：

```powershell
node D:\Work\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast
```

**證據**：exit **0**；最後一行含 `PASSED` 或腳本慣例成功訊息。

## 3) 可選 — 真 shell 預覽（bash + 有效 `wpRootPath`）

```powershell
node D:\Work\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast --wpRootPath="D:\path\to\wordpress"
```

**證據**：同上；若有 `execute-apply-manifest-staging` DRY 輸出，保留 log 片段。

## 4) 可選 — DB 寫入（Supabase）

需 vault／env 注入 `LOBSTER_SUPABASE_*` 與 `LOBSTER_ENABLE_DB_WRITES=true`。順序與參數見 [`docs/C1_EXECUTION_RUNBOOK.md`](../C1_EXECUTION_RUNBOOK.md)。

**證據**：`workflow_runs` / `package_install_runs` 的 id 與終態；**勿**在文件中貼 service role key。

## 5) 可選 — 本機 artifacts

`LOBSTER_ARTIFACTS_MODE=local` + `LOBSTER_WORK_ROOT`（或 `LOBSTER_ARTIFACTS_BASE_DIR`）。見 [`LOCAL_ARTIFACTS_SINK.md`](../operations/LOCAL_ARTIFACTS_SINK.md)。

**證據**：`agency-os/reports/artifacts/lobster/apply-manifest/<workflowRunId>/` 目錄存在；DB 中 `logs_ref` 若有寫入則記錄其值。

## 6) 演練報告（C3-2 baseline）

等同執行 `scripts/emit-staging-drill-report.mjs`：

```powershell
cd D:\Work\lobster-factory
npm run drill:staging-report
```

**證據**：`agency-os/reports/e2e/staging-pipeline-drill-*.md` 新路徑；手動依 [`STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md`](STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md) 勾 checklist。

## 7) 收斂到 AO

- 將本輪 **證據路徑 / commit / 分支** 寫入 `agency-os/WORKLOG.md` 與 `memory/daily/YYYY-MM-DD.md`。
- 收工：`AO-CLOSE` → `scripts\ao-close.ps1`（以 `agency-os/docs/operations/end-of-day-checklist.md` + `agency-os/.cursor/rules/40-shutdown-closeout.mdc` 為單一真相）。

## 相關文件

- [`LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`](../operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md)
- [`WORDPRESS_FACTORY_EXECUTION_SPEC.md`](../WORDPRESS_FACTORY_EXECUTION_SPEC.md)
- [`HOSTING_ADAPTER_CONTRACT.md`](../hosting/HOSTING_ADAPTER_CONTRACT.md)
- [`REMOTE_PUT_ARTIFACTS.md`](../operations/REMOTE_PUT_ARTIFACTS.md)
