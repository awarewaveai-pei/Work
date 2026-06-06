# 把「一鍵租機 + 硬化」嵌進 app.aware-wave.com（Phase 5 — READY，未做）

> **狀態（2026-06-06）**：機層 provisioning 程式**已寫好 + 真機驗證通過**（cpx12@sin 實測：IPv4+IPv6 防火牆、key-only SSH、無孤兒）。
> **這份文件 = 之後要把它接進 app 一鍵架站按鈕時的精確 recipe。不要重做，直接呼叫現成函式。**

## 1. 現成的東西（已驗證，直接用）
- **核心函式**：`provisionClient()` — `lobster-factory/packages/workflows/src/provision/provisionClient.ts`
  租 Hetzner 主機 → cloud-init day-1 硬化 → Cloudflare DNS。內建冪等 + M9 rollback（失敗自動刪 server+IP，無孤兒）。
- **adapter 工廠**：`buildServerAdapterFromEnv()` — `src/provision/serverAdapterFactory.ts`（tier→cpx 機型、env→adapter）
- **同款已被 CLI 用**：`src/provision/cli.ts`（Slash Command `/provision-client` 走這條）。**按鈕走同一個函式 = 零重寫。**

## 2. 嵌入點（app 既有流程）
- 建站起點：`apps/next-admin/app/api/onboarding/trigger-build/route.ts`（按鈕→這裡）
- 既有站層 hosting bridge：`app/api/internal/hosting/provision-staging/route.ts`（WP staging）
- **機層要接在站層「之前」**：先 `provisionClient()` 拿到 `ref.sshHost/ipv4` → 再餵給既有站層建 WP。

## 3. 怎麼接（新增一條，不改既有邏輯）
```ts
// 新檔：app/api/provision/route.ts（或在 trigger-build 內插一段）
import { provisionClient } from "@workflows/provision/provisionClient";       // 路徑視 monorepo 解析
import { buildServerAdapterFromEnv, serverTypeForTier } from "@workflows/provision/serverAdapterFactory";

export async function POST(req: Request) {
  const { siteId, siteName, organizationId, tier, region = "sin", domain } = await req.json();
  // 安全閘：billable 開機要 approval（沿用 build/runs 的 approval_required 機制）
  const serverAdapter = buildServerAdapterFromEnv({ region });
  const result = await provisionClient(
    { siteId, siteName, organizationId, region, serverType: serverTypeForTier(tier), domain },
    { serverAdapter, dns: domain ? { config: { apiToken: process.env.CLOUDFLARE_API_TOKEN!, zoneId: process.env.CLOUDFLARE_ZONE_ID! } } : undefined }
  );
  // result.status: idle|mock|dry_run|provisioned|reused|blocked|rolled_back
  return Response.json(result);
}
```

## 4. 上線前必備（env，預設全 OFF = 安全）
- `LOBSTER_SERVER_ADAPTER=hetzner_cloud`（預設 none）
- `LOBSTER_SERVER_PROVISION_ENABLED=true`（預設 OFF→dry-run 不花錢）
- `HETZNER_STAGING_TOKEN`（lobster-staging project 的 token；見 `AWARE_WAVE_CREDENTIALS.md §十三`）
- secretStore putSecret sink（私鑰持久化到 vault/worker — 見 `secretStore.ts createVaultSecretStore`）
- `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID`（DNS）

## 5. 不要做的事
- ❌ 不要重寫租機/硬化邏輯 —— 已寫好真機驗過，直接 `import provisionClient`。
- ❌ 不要在 production Hetzner project 測 —— 用 `lobster-staging` 隔離專案。
- ❌ billable 開機不要繞過 approval gate（沿用 `build/runs/route.ts` 既有 approval_required）。

## 6. SSOT
計畫全貌：`HETZNER_HOSTING_LAYER_PLAN.md`（決策0 雙觸發 = 為了讓你能這樣嵌）；硬化驗收：`HETZNER_PROVISIONING_HARDENING_SOP.md`。
真機驗收紀錄：`agency-os/WORKLOG.md` 2026-06-06「Phase 4」。
