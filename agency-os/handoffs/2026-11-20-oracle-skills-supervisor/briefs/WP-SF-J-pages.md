# SF-J 建站流程頁面

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §2 全節、§3 的 SF-J 列（`:140`）、§0 的 I1 與 I6。`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。整檔讀：`NA/lib/site-flow/types.ts`、`NA/lib/site-flow/engine.ts`、`NA/app/api/ops/site-flow/` 下兩支 route（API 合約，已在 main）、`NA/lib/site-flow/records.ts`。模型 Sonnet 5.5（先看既有頁面用的元件與 class，再動手）。

## 目的
操作者要能在一頁上從上到下把一個網站建完。一欄、一次一件事、每步顯示真實狀態。

## 介面規則（必守，違反即退回）
- 單欄由上到下；不用下拉選單，選項用看得到的按鈕或核取方塊。
- 只用全域 class 與主題 token，零 hex 色碼；沿用既有頁面的元件。
- 文字繁體中文、白話、一句一件事；不出現「我們」。
- 會動主機的步驟要按兩下：先「預覽要做什麼」，看過計畫再「確認執行」。

## 要做
照 SITE-FLOW §2 與 `:140`，一項不少。另加第一、二批 RISKS 帶進來的：
1. 查進度用 `POST {action:"poll"}`（不是 GET；引擎已定）。
2. 建立客戶時，回應的 `kept_keys`（沒被套用的欄位）要顯示成「這些值沒有套用，因為客戶已經有設定」。
3. 建立環境列時寫入 `environments.metadata.host_slug`（引擎讀這個鍵當主機上的網站代號）。
4. 步驟的 catalog 開關關著時，按鈕顯示「此步驟尚未開放」且不可按；步驟清單目前是空的（SF-H、SF-I 還沒做），頁面要能正常顯示九步的骨架與各自的說明。
5. 一次性的管理員密碼只在那次回應顯示一次，重新整理後不見；頁面不把它存進任何瀏覽器儲存。

## 驗收
- SITE-FLOW `:140` 的 Playwright 各條（假 gate）。
- 預覽實看：桌機與 375px 各一次，截圖附在回報。
- `npx tsc --noEmit`；`npx vitest run <受影響路徑>` 加結構檢查 `npx vitest run lib/portal lib/system-modes`（新頁面與新 route 要有所屬工具，否則全站測試會紅）。
- `critic` 一輪。

## 邊界
不改引擎與 API 的行為（要改先回報）；不寫步驟內容；舊頁 `/onboard`、`/build` 不動（SF-P）。不 push。
