# S1 單一來源：系統／頁面清單＋干支五行規則表

先讀 `COMMON.md`。純重構：行為不變，既有測試全綠。

## 問題（批 1 併入後的 `main`；行號以 `git grep -n` 重新確認）
A. 加一個系統要改 6 處，`lib/divination/types.ts` 檔頭宣稱「新增＝實作＋register」不成立：
- `lib/divination/types.ts` `SystemId` union、`app/api/interpret/route.ts` `SYSTEM_IDS`（同一份清單寫兩次）
- `components/SystemNav.tsx:8` `SYSTEMS`、`app/sitemap.ts:5` `PAGES`、`app/[lang]/page.tsx:11` `SYSTEMS`（頁面清單寫三次）
B. 干支五行規則寫在多檔：`WuXing` 型別在 `lib/baziAnalysis.ts:14` 與 `lib/daily.ts:16`；`GAN_WUXING` 在 `lib/baziAnalysis.ts:17` 與 `lib/daily.ts:32`；`SHENG`／`KE` 在 `lib/baziAnalysis.ts:23,27` 與 `lib/hehun.ts:79-80`；天干地支字串在 `lib/hehun.ts:72-73`、`lib/fengshui/feixing.ts:78`；地支六合／六沖／三合／刑／害在 `lib/baziRelations.ts:31-48` 與 `lib/hehun.ts` `branchRelations`（約 122-150 行，用索引算）各一份。

## 要做的
1. `lib/divination/types.ts`：`export const SYSTEM_IDS = [...] as const; export type SystemId = (typeof SYSTEM_IDS)[number];`。`route.ts` 改 import，刪掉自己的清單。更新檔頭註解成實況（新增系統＝`SYSTEM_IDS` 一項＋`FRAMING` 一項＋register；後兩者漏了 tsc 會紅）。
2. `lib/site.ts`：`export const PAGE_SLUGS = [...] as const`（含順序；`daily`、`astrology` 是頁不是註冊系統，照現況保留）。`SystemNav`、`sitemap`、首頁都由它產生；首頁每項的 `glyph`／`descKey` 改成 `Record<PageSlug, …>`（漏一項 tsc 紅）。
3. 新測試 `lib/site.test.ts`：每個 `PAGE_SLUGS` 都有 `app/[lang]/<slug>/page.tsx`，且 `messages/zh-TW.json`、`en.json` 都有 `nav.<slug>`。
4. 新檔 `lib/ganzhi.ts`：`STEMS`、`BRANCHES`、`WuXing`、`STEM_WUXING`、`BRANCH_WUXING`、`SHENG`、`KE`、天干五合、地支六合／三合／六沖／三刑／相害的規則表與兩兩判定函式。`baziAnalysis.ts`、`daily.ts`、`hehun.ts`、`baziRelations.ts`、`fengshui/feixing.ts` 改 import，刪掉各自的副本（`WuXing` 型別從原位置 re-export 會留下第二個來源，不要留；把 import 路徑一次改完）。

## 檔案
上列各檔＋`lib/ganzhi.ts`、`lib/site.test.ts`（新）。

## 既有資料
無。對外輸出（facts 的 label／value、頁面文字、sitemap 順序、導覽順序）逐字不變。

## 測試
只新增第 3 點。其餘靠既有測試：做完跑一次**全套** `npx vitest run`（本卡是跨檔重構，例外允許全套）＋`npx tsc --noEmit`，再開首頁與任一系統頁看導覽。

## 不要做
不改任何演算法與口徑；不動 `FRAMING` 內容；不合併 `messages` 結構；不做 U1（`BirthForm`）的事；同批的 Q1、M1 會各在 `SystemId` 與 `FRAMING` 加一項，監工併入時處理。
