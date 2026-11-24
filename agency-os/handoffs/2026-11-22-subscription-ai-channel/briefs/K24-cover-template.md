# K24 文章封面版型：一個 renderer（只新增檔案；接線是 K25）

先讀 `briefs/COMMON.md`。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。操作者 2026-11-24 定案：所有文章封面同一個排版（底圖＋標題＋副標），文字設定每個網站可設。**K10 同時在改 `make.ts`、`generate-core.ts`、`ContentStudio.tsx`、`SiteManager.tsx`、`brand-voice.ts`、`make-image.ts`——本卡不得碰這些檔。**

## 現況（監工已讀）
- 文章封面的壓字只有手動頁有：`lib/content/image/make-image.ts:54` `toWebP`（Sharp＋SVG：標題一行、過長截斷加「…」、壓在圖上、沒有副標）。自動產文沒有壓字。
- 正式容器已裝中文字型給 Sharp 的 SVG 用：`Dockerfile:46-48`（`fontconfig font-noto font-noto-cjk`）。所以走 Sharp＋SVG 不需要新套件、不需要改 Dockerfile。**不新增 npm 依賴**（要加就停下回報）。
- 版型概念可參考 `app/(shell)/tools/banner/BannerStudio.tsx` 的 `TEMPLATES`（`:286`）與文字換行／縮字（`:513-518`、`:796`），但它用瀏覽器 canvas，主機上不能用；不要改它。

## 要做（新檔，放 `lib/content/cover/`）
1. `settings.ts`：`CoverSettings { bandColor; titleColor; subtitleColor; font: "sans" | "serif" }`＋預設值＋`parseCoverSettings(unknown)`（顏色只收 `#rrggbb`，其餘退回預設——之後會從網站設定讀，不能信任輸入）。
2. `layout.ts`（純函式，無 I/O）：B 版型＝上圖下字。輸入 `{ width, height, title, subtitle? }`，輸出圖區與色塊的矩形、標題各行、字級、副標字級與位置。規則：
   - 色塊在下方，高度約畫面 25%（4:3，1200×900）；之後會有直式 4:5，所以規則以寬高計算，不寫死像素。
   - 標題最多 2 行，副標 1 行；放不下先縮字到下限，仍放不下才在第 2 行尾截斷加「…」；副標放不下就截斷。左右留安全邊距。
   - 斷行寬度用估算（全形字 1em、半形約 0.55em，照 `make-image.ts` 現有估法並留 8% 餘裕）；中文不得把標點放行首；英文在空白斷。
3. `render.ts`：`renderCover(background: Buffer, text: { title: string; subtitle?: string }, settings: CoverSettings, size = { width: 1200, height: 900 }): Promise<{ buffer: Buffer; mime: "image/webp" }>`。底圖 cover-fit 裁進圖區（不變形、不壓暗、文字不蓋到圖）；色塊純色；字用 SVG 疊上（字型族照 `make-image.ts` 現有的 Noto 名稱）；文字一律 XML 轉義；輸出 WebP ≤200KB（照 `toWebP` 的兩段品質）。沒有標題 → 丟錯（呼叫端決定退路）。
4. `app/api/content/cover-preview/route.ts`：POST `{ title, subtitle?, settings?, imageUrl? }` → 回這張封面（`image/webp`）。授權照 `app/api/content/image/route.ts` 同一套（先讀它，抄同樣的身分與組織檢查，不自創）。沒給 `imageUrl` → 用程式產生的中性底圖（Sharp 產純色或漸層，不放檔案進 repo）。`imageUrl` 只允許 `data:` 或本系統自己的儲存網域（先查 `make-image.ts` 的 R2 網域判斷；不得成為任意網址抓取器）。不計費、不呼叫 AI。

## 測試（只寫這些）
- `layout`：短標題一行；長中文標題兩行且字級縮小；超長 → 第 2 行以「…」結尾；副標過長截斷；英文在空白斷行；行首無標點；4:5 尺寸下色塊仍在下方、矩形不重疊。
- `render`：輸出 1200×900 的 WebP；`<`、`&`、引號的標題不破壞 SVG；圖區那一塊的像素來自底圖（色塊區是 `bandColor`）——取兩個像素驗證文字區不蓋圖。
- `parseCoverSettings`：非法顏色退回預設。
- 預覽路由：未授權 → 拒絕；外部網址的 `imageUrl` → 拒絕。
- `npx tsc --noEmit`＋`npx vitest run lib/content/cover app/api/content/cover-preview`。
- 另外真的出三張圖存到 `$env:TEMP`（短標題、長標題、英文標題各一，底圖用中性底圖），回報路徑；本機字型可能與正式容器不同，看到缺字就照實寫，不要為了本機好看改字型設定。

## 邊界
只新增上述檔案（＋測試）。不接到發佈流程、不改網站設定頁、不刪舊的 `toWebP` 壓字（K25 做）。不部署、不 push。不做無效益測試。commit（pathspec）。
回報（繁體中文）：FILES／TESTS／COMMITS／RISKS／三張樣張的路徑／一句結論。
