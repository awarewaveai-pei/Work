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

## 4. 卡在哪

§7 staging build 串接尚未開始；debug 用的 `console.error` log 仍在 spec-generator.ts（可清理）。

## 5. 下一步指令

### 先清理 debug logs（5 分鐘）

1. 讀 `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/onboarding/spec-generator.ts`
2. 移除所有 `console.error("[spec-validator]...")` 和 `console.error("[spec-generator]...")` 行
3. `npx tsc --noEmit` 確認 0 errors，`npm test` 確認 168 pass
4. `/verify-recent --trivial` → commit + push → `sg-deploy.sh next-admin`

### §14 MVP Step 7：staging build 串接

5. 讀 `$WORK_ROOT/agency-os/docs/architecture/client-onboarding-portal-spec.md` §7（staging build 流程）
6. 讀 `$WORK_ROOT/lobster-factory/packages/workflows/src/trigger/orchestrate-tenant-provisioning.ts`（現有 orchestration）
7. 建 API route `app/api/onboarding/trigger-build/route.ts`：
   - 接收 `website_spec_id`（從 website_specs 查 form_data）
   - 呼叫 existing `orchestrate-tenant-provisioning` Trigger.dev task（已有 create-wp-site + apply-manifest）
   - 回傳 `workflow_run_id`
8. 更新 `app/ops/onboarding/page.tsx` — spec 顯示後加「觸發建站」按鈕，POST `/api/onboarding/trigger-build`，顯示 run_id

### §8 per-tenant monitoring（§14 MVP Step 7 後）

9. 讀 `$WORK_ROOT/agency-os/docs/architecture/client-onboarding-portal-spec.md` §8
10. 擴充 `orchestrate-tenant-provisioning.ts` providers 清單加 `uptime_kuma`（自動建 monitors per tenant）

## 6. 相關資源

- **規格 SSOT**：`$WORK_ROOT/agency-os/docs/architecture/client-onboarding-portal-spec.md`（§7 staging build + §8 monitoring）
- **已建 API routes**：`$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/onboarding/`
- **UI 頁面**：`$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/onboarding/page.tsx`
- **Trigger.dev task**：`$WORK_ROOT/lobster-factory/packages/workflows/src/trigger/orchestrate-tenant-provisioning.ts`
- **Landmine**：spec-generator.ts 還有 debug `console.error` → 先清再做其他事（不然 log 雜訊多）
- **Landmine**：EU Supabase 已有 `intake_forms` + `website_specs` tables（0034 applied），不要重跑 migration
- **測試用 intake_form_id**：`db0bc0a0-becb-46d7-943c-65e62b47fdfb`（AwareWave client-zero，spec 已生成）
