# SF-K 清掉假的狀態顯示

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0 I1、§1-5 全表（`:75` 起）、§3 的 SF-K 列（`:141`）。`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。模型 Opus 5.5。

## 目的
後台有幾處把「計畫要做」寫成「已完成」，或寫死打勾。不變量（I1）：頁面上任何「完成／正常」的顯示都來自即時觀測或紀錄，沒有來源的一律不顯示成完成。

## 要做
1. §1-5 表裡的每一列照表處理。`/onboard`、`/build` 兩頁的列不在本卡（SF-P 連頁一起刪）。動手前先 grep 確認每一列的檔案與行號仍然對得上（SF-J、SF-H、SF-I 已改過其中一些，例如客戶頁佈建分頁已換成 `SiteFlowSummary.tsx`）；已經被前面的卡處理掉的列，在回報標「已由 <卡> 處理」，不重做。
2. 第三批 RISKS 留給這張卡的一件：建站流程頁第 6 步，MainWP 有這個站但連線中斷時，頁面應顯示「請到 MainWP 按 Reconnect」；現在若先按過執行，顯示的是「失敗」而看不到這段說明（`NA/lib/site-flow/engine.ts` 的顯示順序，約 `:733`）。改成觀測到的具體原因優先於上一次執行的失敗字樣。
3. 掃一遍同類：`NA/app/(shell)/ops/**` 內寫死的完成狀態（固定的打勾圖示、固定字串「已完成」「已設定」「正常」而旁邊沒有資料來源）。只列出，不改；寫進回報，每條附 file:line，由監工決定。

## 驗收
- §1-5 每一列：改後 grep 確認表列的字串已不存在；改到畫面的各附一張截圖。
- 第 2 項有測試（假 MainWP 回「存在但中斷」→ 顯示重連說明）。
- `npx tsc --noEmit`；全套 `npx vitest run`；Playwright `--project sites` 全過。
- `critic` 一輪。

## 邊界
不改步驟的行為、不改主機腳本、不動 `/onboard` 與 `/build`。不 push。
