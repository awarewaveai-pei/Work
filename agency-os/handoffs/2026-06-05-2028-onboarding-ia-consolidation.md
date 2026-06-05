---
slug: onboarding-ia-consolidation
created_utc: 2026-06-05T12:28:23Z
hint: "明天要接著完成 app.aware-wave onboarding/provisioning IA 重整 — Phase 1 退役 ops-console（已規劃完、Q1-Q3 已決、尚未動 code）+ 後續 Phase 2/3"
source_session_summary: "完成 app.aware-wave 12 問題大修 + 登入上線 + onboarding intake 重設計/去重複,並規劃 onboarding IA 重整 plan(Phase 1 待實作)"
---

## 1. 任務目標
完成 app.aware-wave onboarding/provisioning IA 重整 **Phase 1**（退役孤兒頁 `/ops-console` + IA 收斂），並確認 intake「觸發建站」端到端真的能建站。

## 2. 為什麼做
4 個建站相關頁職責重疊（操作者反映「亂七八糟」）；Phase 1 清掉確定的髒（ops-console 三重複製 + 壞 AiJobForm）。intake 的 trigger-build 已修 UX bug 但**後端是否真能建 org/派工尚未實測**。

## 3. 已試過
今日已上線：12 問題大修全部署（P1 Supabase 登入可用 / P2-P12）；intake 頁重設計（修 29 處壞 CSS 變數）+ 去重複（移除「建站主要目的」、預算改金額區間、商品類型去服務預約、加品牌輔色）；trigger-build 加固（失敗顯錯不跳第一步）。ops-console 退役已規劃、**Q1-Q3 已決**、grep 確認只 `layout.tsx:97` 引用 /ops-console。

## 4. 卡在哪
Phase 1 **尚未動任何 code**（今日收工前停在此）；trigger-build 後端成功與否未驗（需操作者重試看錯誤訊息，或直接測 API）。

## 5. 下一步指令
1. **先讀 plan**：`$WORK_ROOT/agency-os/docs/operations/APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md`（Phase 1 = §5、決策 = §6，**已決：Q1 redirect / Q2 先做 Phase 1 / Q3 redirect 退役整頁**）。
2. **Phase 1-a 退役 ops-console**：把 `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops-console/page.tsx` 改成
   ```tsx
   import { redirect } from "next/navigation";
   // /ops-console retired 2026-06-05 (IA consolidation — see APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md).
   export default function OpsConsolePage() { redirect("/ops/clients"); }
   ```
   原檔 git 可還原；**元件 DepartmentSelector/AiJobForm/TenantConfigForm 不刪**（/onboard 仍用 DepartmentSelector）。
3. **Phase 1-b sidebar**：`$WORK_ROOT/.../next-admin/app/layout.tsx:97` 移除 `<Link href="/ops-console">…Ops Console…</Link>` 那一行（System 區）。
4. **Phase 1-c 文件**：更新 `$WORK_ROOT/agency-os/docs/operations/APP_AWARE_WAVE_CURRENT_STATE.md` 加「客戶生命週期管線（canonical）」段（Intake→Spec→Review/Provision→Build→Live）+ 標 ops-console 已退役。
5. **驗證**：`cd $WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx tsc --noEmit 2>&1 | grep -viE "tarot|jszip|image-gen"` → `/review` critic → grep 全 `/ops-console` 引用確認已清 → 部署（**detached**：`ssh hetzner-sg 'setsid bash -c "/root/lobster-phase1/scripts/sg-deploy.sh next-admin > log 2>&1" < /dev/null &'`）→ curl `/ops-console` 期望 **307→/ops/clients**、`/onboard` + `/ops/onboarding` 仍 200、DepartmentSelector 在 /onboard 仍運作。
6. **trigger-build 端到端驗證**：請操作者重填 intake → 生規格 → 按「觸發建站」；若失敗會顯示具體錯誤（`org_create_failed` / `db_unavailable` / Trigger.dev 相關）→ 對症修 `$WORK_ROOT/.../next-admin/app/api/onboarding/trigger-build/route.ts`（多步驟建 org/workspace/project/site/environment + 派工，逐點查）。
7. **Phase 2/3（之後，各自另出 R0 設計，本批不做）**：P2 = intake 的 trigger-build 與 /onboard 的 `/api/ops/organizations` **兩條建 org 路徑收斂成一個 service**（中風險）；P3 = intake 生規格後**串接 /onboard 技術步驟（部門/服務）→ /build** 成單一導引流程（重用元件，**禁重寫 /onboard 1114 行**）。

## 6. 相關資源
- **plan（主）**：`agency-os/docs/operations/APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md`
- 現況：`agency-os/docs/operations/APP_AWARE_WAVE_CURRENT_STATE.md`；code 級：`…/APP_AWARE_WAVE_COMPLETE_REFERENCE.md`
- 改的檔：`app/ops-console/page.tsx`、`app/layout.tsx:97`、`app/api/onboarding/trigger-build/route.ts`
- **Landmines**：① SG build 時 SSH 常 reset → 用 `setsid` detached 部署再輪詢 ② 新 npm dep 要在 `/root/Work/lobster-factory/.../next-admin` 跑 `npm ci`（REPO_DIR=/root/Work，非 rsync 目標 /root/lobster-phase1/apps）③ smoke 探 `/login` 不探 `/`（首頁已 gate）④ DepartmentSelector 被 /onboard 用，**退役頁不可連元件一起刪** ⑤ `app/tools/tarot/*`+`lib/tarot/*` 型別錯是並行 session WIP，tsc 驗證要 grep 排除。
