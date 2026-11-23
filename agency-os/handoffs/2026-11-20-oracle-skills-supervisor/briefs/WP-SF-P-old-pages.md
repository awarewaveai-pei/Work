# SF-P 舊的建站頁退場

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §1 第 2 列（`:28`）、§1-5、§3 的 SF-P 列（`:142`）。`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。整檔讀：`/onboard` 與 `/build` 兩頁及它們用到的元件與 API、`NA/app/(shell)/ops/clients/[slug]/` 下的客戶頁與分頁、`NA/app/sidebar-sections.ts`、`NA/app/__tests__/sidebar-coverage.test.ts`、`NA/lib/portal/products.ts` 與 `staff-tools.ts`（頁面與 API 的歸屬登記）。模型 Opus 5.5（完成後 `critic` 一輪）。

## 目的
建站只留一條路（`/ops/sites/*`）。舊的兩頁還在用的兩塊設定（部門選型、外部服務）搬到客戶頁，然後把舊頁與它們的入口移除。不變量：既有客戶在舊頁存過的設定，搬家後在新位置原樣讀得到、改得動；全站沒有任何連結或選單指向已移除的頁面。

## 要做
照 SITE-FLOW `:28` 與 `:142`，一項不少。加上前幾批 RISKS 留給這張卡的：
1. `NA/app/sidebar-sections.ts` 的「建站第 1／2／3 步」（約 `:41-43`，連到 `/onboard`、`/build`）改成指向新流程：側欄要有 `/ops/sites/new` 的入口；`sidebar-coverage.test.ts` 的 `REACHED_ELSEWHERE` 裡 `/ops/sites/new` 那一列在側欄有了之後移除。
2. `NA/app/api/build/runs/route.ts:100-230` 那份重複的「建立客戶上游資料」邏輯（SF-B 回報）：頁面刪掉後若已無呼叫端就一併刪除；仍有呼叫端就改用 `lib/site-flow/records.ts` 的同一條路，不留兩份。
3. `/ops/onboarding`（AI 需求問卷）保留；它的「觸發建站」改為帶著這份規格去 `/ops/sites/new`（計畫 `:28`）。
4. 刪除前盤點：列出兩個舊頁上的每個控制項與每條進出路徑（從哪裡連進來、按了會去哪、寫到哪張表的哪個欄位），逐項標「搬到 <新位置>」「由新流程取代」「刪除（理由）」。這份表放在回報裡；沒有列到的控制項不得刪。
5. 刪掉的 API route 若還被別處呼叫（grep 全 repo，含 `lobster-factory/packages/workflows`）就不能刪；只刪確定沒有呼叫端的。

## 驗收
- 舊資料測試：既有客戶的部門選型與外部服務設定，在客戶頁的兩個新分頁讀得到、存得回去，欄位與值不變。
- `grep -rn 'href="/build"\|href="/onboard"' NA/app` 0 筆；兩個舊網址回 308 到 `/ops/sites/new`。
- `npx tsc --noEmit`；全套 `npx vitest run`（側欄涵蓋、頁面與 API 歸屬這幾支全站測試會被這張卡動到）；Playwright `--project sites` 全過。
- 預覽實看客戶頁兩個新分頁與側欄，截圖各一張。

## 邊界
不改建站流程的步驟與 API；線3 同時在做 SF-I2（改 `app/api/tools/publish/`、`lib/content/`、`lib/crm/`、`lib/outreach/`），不要碰那些檔。不 push。
