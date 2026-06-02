---
slug: onboarding-staging-build
created_utc: 2026-06-02T14:35:00Z
hint: "剩下明天要處理的事：onboarding §7 staging build 設計 pass（reuse 既有 /build pipeline，不重造）+ §8 uptime_kuma；①debug log 已清未 deploy（隨下次部署搭車）；20 檔 scripts drift wrapper 化；今天系統已全綠"
source_session_summary: "AO-RESUME 救火（換機 churn 根因治本 + Claude sync drift 修復）後，接 onboarding packet：① debug log 清理交付，②③ R0 讀碼發現需設計 pass 而非 quick route。"
---

## 1. 任務目標

明天碰 onboarding §7 staging build 串接：把 intake→spec 餵進**既有 /build pipeline**（不重造）。

## 2. 為什麼做

§14 MVP 最後一哩；今天因 packet 舊假設錯誤（orchestrate 不建站）而改為先設計再實作。

## 3. 已試過

- ① debug log 清理已交付（commit `d3c7dd2`，tsc 0 + 168 tests + critic 0/0/0，**未 deploy**）。
- R0 讀碼已確認真實架構：`orchestrate-tenant-provisioning` 不建 WP 站；`create-wp-site` 需 4 UUID；**已有 `/build` console + `dispatch-action-run` + `ops/organizations` pipeline 在建站**。

## 4. 卡在哪

§7 需一次**設計 pass**（map website_spec → 既有 /build 契約）才能動手；尚未設計。非阻塞，是範圍決策。

## 5. 下一步指令

**主線（§7 設計 pass）— 完整步驟見既有詳細 packet：`$WORK_ROOT/agency-os/handoffs/2026-06-02-1735-onboarding-portal-e2e.md` §5（已於今日更正為正確前提）。** 摘要：

1. 讀 `$WORK_ROOT/agency-os/docs/architecture/client-onboarding-portal-spec.md` §7 + §8。
2. 讀既有建站契約：`$WORK_ROOT/.../next-admin/lib/build-console/contracts.ts`、`app/api/build/{provision-services,runs}/route.ts`、`lobster-factory/packages/workflows/src/trigger/dispatch-action-run.ts`。
3. **產出設計**：website_spec → 既有 /build 契約映射（package_slug→manifestSlug；org/site 從 `ops/organizations` 重用或建立），**不得平行造新 org/site 邏輯**。建議用 `/decide` 或正式 R0 設計開。
4. 設計核可後才實作 route + UI 按鈕；§8 `uptime_kuma` 走 create-wp-site 的 `integrations.uptimeKuma`（不另造）。

**旁支（可獨立排程，非今日卡點）：**
5. ① debug log 已清未 deploy → 隨下次任何 `sg-deploy.sh next-admin` 搭車生效（log 無害，無須單獨部署）。
6. **20 檔 `scripts/` vs `agency-os/scripts/` drift wrapper 化** → 已是獨立 TASKS 項（工具層分類，2026-06-02 開出），含 AO 生命週期關鍵腳本，高風險，需逐支 R0。

## 6. 相關資源

- **§7/§8 完整指令 + landmines**：`$WORK_ROOT/agency-os/handoffs/2026-06-02-1735-onboarding-portal-e2e.md`（今日已更正）
- **既有建站 pipeline（必 reuse）**：`app/build/` + `app/api/build/` + `lib/build-console/contracts.ts` + `dispatch-action-run.ts` + `create-wp-site.ts`
- ⚠️ **Landmine**：`orchestrate-tenant-provisioning` 不建 WP 站；勿照舊假設接它當建站入口。
- ⚠️ **Landmine**：EU Supabase 已有 `intake_forms`+`website_specs`(0034)，勿重跑 migration。
- **今日系統狀態**：health 100%、git 同步、Claude sync 已修；無待處理阻塞。
