# Staging pipeline — standard E2E payload (Phase 1)

> 用途：C3-1 固定欄位，供 dryrun、本機 CLI、Trigger `apply-manifest`、未來自動化共用。  
> 與 `scripts/dryrun-apply-manifest.mjs`、`validate-dryrun-apply-manifest.mjs` 預設 UUID 一致。

## Tenant context（範例 / 測試用）

| Field | UUID |
|--------|------|
| `organizationId` | `11111111-1111-1111-1111-111111111111` |
| `workspaceId` | `22222222-2222-2222-2222-222222222222` |
| `projectId` | `33333333-3333-3333-3333-333333333333` |
| `siteId` | `44444444-4444-4444-4444-444444444444` |
| `environmentId` | `55555555-5555-5555-5555-555555555555` |

## Environment

- `environmentType`: **`staging`**（必填；`production` 會被 apply-manifest 與 dryrun 拒絕）

## Paths

- `manifestPath`（相對 repo 根）: `packages/manifests/wc-core.json`
- `wpRootPath`: 本機 **WordPress 根目錄**（僅執行 install/rollback shell 時需要；dryrun 可用任意**存在**的目錄或專用 dummy 目錄）

## Trigger `create-wp-site` JSON body（範例）

```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111",
  "workspaceId": "22222222-2222-2222-2222-222222222222",
  "projectId": "33333333-3333-3333-3333-333333333333",
  "siteId": "44444444-4444-4444-4444-444444444444",
  "siteName": "demo-staging-site",
  "manifestSlug": "wc-core"
}
```

一鍵輸出（同欄位）：

```powershell
cd D:\Work\lobster-factory
npm run payload:create-wp-site -- --siteName=demo-staging-site
npm run payload:apply-manifest -- --wpRootPath="D:\Work\dummy"
```

## Trigger `apply-manifest` JSON body（範例）

```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111",
  "workspaceId": "22222222-2222-2222-2222-222222222222",
  "projectId": "33333333-3333-3333-3333-333333333333",
  "siteId": "44444444-4444-4444-4444-444444444444",
  "environmentId": "55555555-5555-5555-5555-555555555555",
  "wpRootPath": "D:\\\\path\\\\to\\\\wordpress",
  "manifestPath": "packages/manifests/wc-core.json",
  "environmentType": "staging"
}
```

## 相關環境變數（摘要）

- Hosting（`create-wp-site`）：`LOBSTER_HOSTING_ADAPTER=none|mock|provider_stub|http_json` — 見 `docs/hosting/HOSTING_ADAPTER_CONTRACT.md`、`HTTP_JSON_HOSTING_ADAPTER.md`
- Artifacts（`apply-manifest`）：`LOBSTER_ARTIFACTS_MODE=local`（本機目錄）或 `remote_put`（presigned PUT）— `LOCAL_ARTIFACTS_SINK.md` / `REMOTE_PUT_ARTIFACTS.md`
- DB 寫入：`LOBSTER_ENABLE_DB_WRITES`、`LOBSTER_SUPABASE_URL`、`LOBSTER_SUPABASE_SERVICE_ROLE_KEY`
- Shell：`LOBSTER_EXECUTE_MANIFEST_STEPS`、`LOBSTER_MANIFEST_EXECUTION_MODE`、`LOBSTER_REPO_ROOT`、`LOBSTER_BASH`

詳見 `lobster-factory/README.md`（M3 章節）。

## 一鍵回歸（不需 WP）

```powershell
node D:\Work\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast
```

## 含 shell 預覽（需 bash + 有效 `wpRootPath`）

```powershell
node D:\Work\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast --wpRootPath="D:\path\to\wordpress"
```
