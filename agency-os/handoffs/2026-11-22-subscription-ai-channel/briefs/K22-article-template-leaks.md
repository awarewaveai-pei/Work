# K22 文章範本三個小問題（不含配圖）

先讀 `briefs/COMMON.md`。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。來源：K12 十二篇盲測的審稿（`agency-os/reports/model-bakeoff/2026-11-article/editor-review.md`、`drafts.jsonl`、`metrics.json`）。配圖不在本卡（等操作者談）。

## 1. 內部註記寫進正文
症狀：正文出現「（年份未核）」「（年份未確認）」「（無固定出版年）」這類給編輯看的註記（例：`drafts.jsonl` 多篇的來源連結後方；K16 `results.json` humanize 兩筆也帶著）。操作者規定：內部標記不得出現在讀者看得到的文字（同類前例 `[COST_JSON]`、`NEEDS_FACT_CHECK`，已有 `lib/content/internal-markers.ts` `scrubInternalMarkers`）。
做法：先查這些字是哪一段提示詞要求寫的（grep `年份|出版年|year` 於 `lib/content/article/generate-core.ts` 的來源／引用規則）。治本＝提示詞不再要求把查不到年份的事寫進正文（查不到年份就不寫年份）；守門＝`scrubInternalMarkers` 是唯一的清除點，確認發佈路徑（`lib/content/publish/wordpress-core.ts`）與存草稿路徑都經過它，並把這一類註記納入（以明確的樣式清單，不要寬鬆到吃掉正文裡正常的括號）。

## 2. 連結以原始碼的樣子露出
症狀：`gpt-5.4-mini` 那篇正文出現字面的 `<a href=…>`（見 `metrics.json` 該模型的 `html` 與 `drafts.jsonl` 的 markdown）。
做法：先判定是模型在 markdown 裡直接寫 HTML，還是轉換器（`lib/content/markdown-to-blocks.ts` 或發佈前的轉換）把它轉義了。附 `file:line` 證據再修：模型寫的 → 提示詞明定連結只用 markdown 語法，且轉換器對 `<a href="…">文字</a>` 的處理要有定義（轉成正常連結或去標籤留文字，擇一並寫測試）；轉換器的錯 → 修轉換器。

## 3. 文章頁「本次費用」顯示美金
操作者規定她看到的金額一律 NT$。grep `本次費用` 於 `app/(shell)/tools/content/`，改用 repo 既有的換算（`lib/ai/cost-calculator.ts` `usdToNtd`），不自己寫匯率。同頁其他給她看的美金一起改；不要動帳本存的 usd。

## 測試（只寫這些）
- 1：`scrubInternalMarkers` 清掉三種註記樣式、不動正常括號（各一例）。
- 2：依判定結果的一個測試。
- 3：一個顯示測試（或既有測試跟著改）。
- `npx tsc --noEmit`＋相關 vitest。不需要打付費 API。

## 邊界
不動配圖、不動預設模型、不改已發佈的文章、不部署、不 push。任何一項查出來根因與上面假設不同：照實回報並照根因修，不要硬套。commit（pathspec）。
回報（繁體中文）：FILES／TESTS／每項根因一行（附 file:line）／COMMITS／RISKS／一句結論。
