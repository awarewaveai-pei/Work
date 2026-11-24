# K25 封面版型接上網站設定與發文流程（K10、K24 都併入後才派）

先讀 `briefs/COMMON.md`、`briefs/K10-article-images.md`、`briefs/K24-cover-template.md` 與兩張卡實際併入的程式（`lib/content/cover/*`、K10 存下的封面底圖／短標題／副標）。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。操作者 2026-11-24：所有文章封面同一個版型；設定在 `/tools/content/sites`；文字設定每個網站可設。

## 要的結果
1. **網站設定**：`SiteContentDefaults` 加 `cover`（K24 `CoverSettings`；讀取一律過 `parseCoverSettings`）。`app/(shell)/tools/content/sites/SiteManager.tsx` 加一區「文章封面」：色塊顏色、標題字色、副標字色、字型（按鈕／色票，不用下拉選單），旁邊即時預覽（呼叫 K24 的預覽路由，輸入變動後延遲再打，不要每個按鍵都打）。預設色：該客戶有品牌色就用品牌色（先查 Banner 的品牌選擇器從哪裡取：`app/(shell)/tools/banner/BannerStudio.tsx` 內 `GET /api/ops/clients` 那段），沒有就用 K24 的預設。
2. **自動產文**（`lib/content/topics/make.ts`）：精選圖片＝`renderCover(K10 的封面底圖, { title: 封面短標題, subtitle: 封面副標 }, 網站的 cover 設定)`，1200×900。沒有短標題（舊題目、模型沒照做）→ 用文章標題（版型自己會縮字／截斷）。`renderCover` 失敗 → 文章照樣存草稿，精選圖片用沒有字的底圖，並在題目的檢查項寫明「封面未套版」，不讓整篇失敗。
3. **手動文章頁**（`ContentStudio.tsx` 的精選圖片流程，約 `:1690-1713`；`app/api/content/image/route.ts:133-134`）：改用同一個 `renderCover`，帶入網站的 cover 設定與 AI 寫的短標題／副標（兩個欄位在頁面上可改）。
4. **刪掉舊的壓字**：`lib/content/image/make-image.ts` `toWebP` 的 `titleText` 疊字與 `buildTitleSvg`、`ContentImageInput.titleText/featuredImageFont/featuredImageTitlePosition`、網站設定頁的「精選圖片標題字型」「標題文字位置」兩個選項（`SiteManager.tsx:161-162`）。`featuredImageFont` 的既有值搬成 `cover.font`（讀取時相容，不改資料庫裡的舊資料）；`featuredImageTitlePosition` 不再使用（B 版型沒有位置選項）。grep 這三個識別符到 0 個使用點（測試一起清）。全站只剩一種封面做法。
5. **社群貼文的圖**：先查自動產文的社群草稿現在附的是哪一張圖（操作者截圖裡草稿有一張圖）。若附的是文章的精選圖片／第一張內文圖 → 改成附套好版型的封面；若現在不附圖 → 不在本卡加，回報現況。

## 既有資料
已發佈文章的精選圖片不重做。網站沒有 `cover` 設定 → 預設值。舊的 `featuredImageFont: "serif"` → 封面字型 serif；`"none"`（原意：不要壓字）→ 封面仍套版型（操作者要全站統一），在回報的 RISKS 寫明哪些網站受影響。

## 測試（只寫這些）
- 自動產文：精選圖片是 `renderCover` 的輸出（mock 它，驗傳入的短標題、副標、網站設定）；沒有短標題 → 傳文章標題；`renderCover` 丟錯 → 文章仍存、精選圖片是底圖、檢查項有「封面未套版」。
- 網站設定：存 `cover` 後讀回一致；非法顏色被擋。
- 舊欄位：`featuredImageFont: "serif"` → `cover.font` serif。
- `npx tsc --noEmit`＋`npx vitest run lib/content app/api/content "app/(shell)/tools/content"`。不打付費 API。

## 邊界
不改版型的排法（K24）、不改畫面描述與風格（K10）、不改預設生圖模型、不部署、不 push。不做無效益測試。commit（pathspec）。
回報（繁體中文）：FILES／TESTS／COMMITS／RISKS／刪掉了哪些東西的清單／一句結論。
