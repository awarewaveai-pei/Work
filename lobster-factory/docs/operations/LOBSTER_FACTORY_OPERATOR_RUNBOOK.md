# Lobster Factory — Operator Runbook（Phase 1）

> 目標：每日／接案前用**最少指令**確認管線與產物一致；出事時有固定排查順序。  
> 單一真實來源仍為 `docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md` 與 `docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`。

## 1) 每日健康檢查（本機）

在 **`lobster-factory`** 目錄：

```powershell
npm run operator:sanity
```

等同：`npm run validate`（bootstrap 全閘道，**含** `validate-operable-e2e-skeleton.mjs`）+ `npm run regression:staging-pipeline`。

- **PASS**：代表結構、manifest/governance、dryrun 合約、hosting/artifact 閘道、**A10 E2E 劇本骨架**、regression 皆綠。
- **FAIL**：先看最後一段錯誤訊息；常見為某檔被刪、doc 連結斷、或 dryrun 合約與 catalog UUID 不一致。

全 monorepo（含 Agency health）在 `D:\Work`：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1
```

## 2) Trigger payload 一鍵產生

| 任務 | 指令 |
|------|------|
| `create-wp-site` | `npm run payload:create-wp-site`（可 `--siteName=`） |
| `apply-manifest` | `npm run payload:apply-manifest`（可 `--wpRootPath=`、`--manifestPath=`） |

輸出為 **JSON**，可直接貼 Trigger 測試或存成 CI artifact。

## 3) 演練報告（C3-2）

```powershell
npm run drill:staging-report
```

寫入 `agency-os/reports/e2e/staging-pipeline-drill-*.md`（預設內嵌跑 regression）。加證據欄請手動編輯該 md。

## 4) 環境變數速查（Worker / 本機）

| 目的 | 變數 |
|------|------|
| Hosting 模式 | `LOBSTER_HOSTING_ADAPTER=none\|mock\|provider_stub\|http_json`（`http_json` 見 `docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md`） |
| DB 寫入 | `LOBSTER_ENABLE_DB_WRITES` + `LOBSTER_SUPABASE_*` |
| Manifest shell | `LOBSTER_EXECUTE_MANIFEST_STEPS` + `LOBSTER_MANIFEST_EXECUTION_MODE` |
| 本機 log 檔 | `LOBSTER_ARTIFACTS_MODE=local` + `LOBSTER_WORK_ROOT` 或 `LOBSTER_ARTIFACTS_BASE_DIR` |
| 遠端 log（presigned PUT） | `LOBSTER_ARTIFACTS_MODE=remote_put` + `LOBSTER_ARTIFACTS_PRESIGN_URL` 或 `LOBSTER_ARTIFACTS_PUT_DESCRIPTOR_JSON`（見 `docs/operations/REMOTE_PUT_ARTIFACTS.md`） |
| Repo 根（bundle） | `LOBSTER_REPO_ROOT` |

細節：

- Hosting：`docs/hosting/HOSTING_ADAPTER_CONTRACT.md`
- Artifacts：`docs/operations/LOCAL_ARTIFACTS_SINK.md`、`REMOTE_PUT_ARTIFACTS.md`、`ARTIFACTS_LIFECYCLE_POLICY.md`
- Staging shell：`lobster-factory/README.md`（M3 章）

## 5) 可運營 E2E 劇本（A10-1）

固定順序（證據欄、可選步驟）：[`docs/e2e/OPERABLE_E2E_PLAYBOOK.md`](../e2e/OPERABLE_E2E_PLAYBOOK.md)

## 6) 真 WordPress 預覽（可選）

本機有 WP 與 bash 時：

```powershell
npm run regression:staging-pipeline -- --wpRootPath="D:\path\to\wordpress"
```

會多跑 `execute-apply-manifest-staging --execute=0`（DRY_RUN）。

## 7) 下一步（尚未自動化）

- A10-2：新客戶商業閉環 + 生產 Trigger 全鏈證據
- 專屬 hosting vendor SDK（`providers/<name>.ts`）或強化 presign broker
- 與 Agency `AO-CLOSE` 一併 **git** 收斂（依你的推送節奏）

---

_Last updated: operable E2E playbook + artifacts lifecycle policy + operator bundle._
