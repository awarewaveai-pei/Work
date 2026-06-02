---
slug: onboarding-portal-e2e
created_utc: 2026-06-02T09:35:00Z
hint: "onboarding portal E2E 完整通過，prompt 修好，UI 頁面上線，下一步是讓 /ops/onboarding 頁面顯示生成的規格，並開始 §7 staging build 串接"
source_session_summary: "Client Onboarding Portal MVP 完整實作：TypeScript types + package selector + spec generator + API routes + DB migration + nginx + UI 頁面，E2E 驗收通過（intake 201 + generate-spec 200 + valid WebsiteSpec）。"
---

## 1. 任務目標

Client Onboarding Portal：讓 `/ops/onboarding` 頁面在生成規格後能直接顯示結果（目前 UI 已有基礎表單），並接入 §7 staging WP 建站流程。

## 2. 為什麼做

§14 MVP DoD 最後一哩：表單 → spec → **staging build** 完整閉環；目前停在 spec 生成成功，build 尚未串接。

## 3. 已試過

- `lib/onboarding/intake-form.ts` — IntakeForm + WebsiteSpec TypeScript interfaces（完成）
- `lib/onboarding/package-selector.ts` — selectPackage() 5 規則（完成）
- `lib/onboarding/spec-generator.ts` — Claude API 呼叫 + validateSpec() + AbortController + prompt 修正（完成，commit `8fa40926`）
- `packages/manifests/wc-custom.json` — 新 manifest（完成）
- `packages/db/migrations/0034_intake_forms.sql` — EU Supabase 已 apply（完成）
- `app/api/onboarding/submit/route.ts` + `generate-spec/route.ts`（完成）
- `app/ops/onboarding/page.tsx` — intake 表單 UI + spec 結果顯示（完成，commit `35914449`）
- nginx `/api/onboarding/` location block + Basic Auth + role=admin（完成，SG 已 deploy）
- E2E 驗證：intake 201 ✅，generate-spec `website_spec_id: 0f099182-396a-418f-95dd-437a39355c62` ✅

## 4. 卡在哪（2026-06-02 更新 — R0 讀碼後修正前任假設）

debug logs **已清**（commit 見下）。真正的卡點是 **§7 的 packet 原假設與 code 不符**：

- packet 原寫「呼叫 orchestrate-tenant-provisioning（已有 create-wp-site + apply-manifest）」→ **不成立**。`orchestrate-tenant-provisioning.ts` 實際只 `runProviderStep` fan-out 佈建整合服務（github/sentry/uptime_kuma/posthog/n8n/supabase）+ 寫 webhook，**沒建任何 org/site 記錄、沒觸發 create-wp-site**。
- `create-wp-site`（`packages/workflows/src/trigger/create-wp-site.ts:89-112`）的 payload 要 **4 個已存在 UUID**：`organizationId / workspaceId / projectId / siteId` + `siteName` + `manifestSlug`（`wp-basic|wp-business|wc-core`）。website_spec 只有 `spec_data`，沒有這些。
- **已存在一整條建站 pipeline**：`/build` console（`app/build/BuildConsole.tsx` + `app/api/build/{provision-services,runs}` + `lib/build-console/contracts.ts`）→ `dispatch-action-run`（`ops.profile-b.create-wp-site → create-wp-site`）→ create-wp-site；org/site 記錄走 `app/api/ops/organizations`、`ops/clients`。

→ **結論：②③ 不能另造一套 org/site 建立 + create-wp-site 觸發（會重複既有 /build pipeline，違反 R0）。正解是把 intake→spec 餵進既有 /build/dispatch pipeline。這需要一次設計 pass，不是一條 quick route。**

## 5. 下一步指令

### ① debug logs — ✅ 已完成（2026-06-02）

`spec-generator.ts` 9 行 debug `console.error` 已移除（只刪 log、保留所有 guard + return）；`tsc --noEmit` 0 errors、vitest **168/168 pass**、critic Deep 0/0/0。**尚未 sg-deploy**（log 清理零急迫，隨下次實質部署搭車）。

### ② §7 staging build 串接 — 需先設計（不要直接寫 route）

1. 讀 `$WORK_ROOT/agency-os/docs/architecture/client-onboarding-portal-spec.md` §7。
2. 讀 **既有建站契約** `$WORK_ROOT/.../next-admin/lib/build-console/contracts.ts` + `app/api/build/provision-services/route.ts` + `app/api/build/runs/route.ts`（搞懂 /build 怎麼建 org/site + 怎麼 dispatch）。
3. 讀 `$WORK_ROOT/lobster-factory/packages/workflows/src/trigger/dispatch-action-run.ts`（`ops.profile-b.create-wp-site` 映射 + payload）。
4. **設計**：onboarding `website_spec` → 既有 /build 契約的映射（package_slug → manifestSlug；org/site 記錄怎麼從既有 ops/organizations 建或重用）。輸出方案再實作，**不得平行造新 org/site 邏輯**。
5. 實作 route（觸發既有 pipeline，回 run_id）+ UI「觸發建站」按鈕。

### ③ §8 per-tenant monitoring（§7 後）

6. `uptime_kuma` 已是 orchestrate 的 provider enum + create-wp-site 的 `integrations.uptimeKuma`（`create-wp-site.ts:82`）→ §8 應在建站 payload 帶 uptimeKuma 設定，不需另造。

## 6. 相關資源

- **規格 SSOT**：`$WORK_ROOT/agency-os/docs/architecture/client-onboarding-portal-spec.md`（§7 + §8）
- **既有建站 pipeline（②③ 必須 reuse，勿重造）**：`/build` console（`app/build/`）+ `app/api/build/{provision-services,runs}` + `lib/build-console/contracts.ts` + `dispatch-action-run.ts` + `create-wp-site.ts` + `apply-manifest.ts`
- **org/site 記錄**：`app/api/ops/organizations/route.ts`、`app/api/ops/clients/route.ts`
- **已建 onboarding routes**：`$WORK_ROOT/.../next-admin/app/api/onboarding/`（submit + generate-spec）；route 慣例 = `resolveOpsRole` role gate → `getSupabaseWriteClient` → `NextResponse.json`
- **UI 頁面**：`$WORK_ROOT/.../next-admin/app/ops/onboarding/page.tsx`
- ⚠️ **Landmine**：`orchestrate-tenant-provisioning` **不建 WP 站**（只佈建整合服務）；§7 真正建站是 `create-wp-site`，且需 org/workspace/project/site 4 UUID。packet 舊版「已有 create-wp-site wired」是**錯的**，已於本次更正。
- ⚠️ **Landmine**：EU Supabase 已有 `intake_forms` + `website_specs`（0034 applied），勿重跑 migration。
- **測試用 intake_form_id**：`db0bc0a0-becb-46d7-943c-65e62b47fdfb`（AwareWave client-zero，spec 已生成）
