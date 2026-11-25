# K29 文章封面按頻道出不同尺寸（K27 併入後才派）

先讀 `briefs/COMMON.md`、`briefs/K24-cover-template.md`、`briefs/K27-global-people-and-social-cover.md` 與它們併入後的程式（`lib/content/cover/*`、`lib/content/topics/make.ts` 的封面與附圖那幾段）。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。操作者 2026-11-25「要，開卡」。

## 依據（監工 2026-11-25 查證）
- Instagram 貼文：官方發文說明與 Graph API 文件都是 1.91:1 到 4:5 → 直式用 4:5（1080×1350）。
- Facebook 貼文：無官方明文，多份整理一致並引用 Meta 建議 → 4:5。
- Bluesky：無官方說明；圖片照上傳比例顯示、太長才裁（未證實）→ 先用 4:5，上線後看第一則實際貼文。
- Pinterest：官方 2:3（1000×1500）。YouTube 不收圖片貼文（只收影片）。
- 正式資料目前連著的頻道：facebook、instagram、youtube、bluesky。

## 要的結果
1. **一張對照表**（新檔 `lib/content/cover/sizes.ts`，唯一來源）：平台 → 封面尺寸。
   - 網站精選圖片：1200×900（現狀，不變）。
   - `facebook`、`instagram`、`instagram-standalone`、`bluesky`、`threads`、`linkedin`、`linkedin-page`：1080×1350。
   - `x`：1200×675。`pinterest`：1000×1500。
   - 表上沒有的平台 → 用網站那一張（1200×900）。`youtube` 不附圖（K27 已如此）。
   每列帶一句來源註記（官方／第三方／未證實），以後加平台只加一列。
2. **底圖**：直式封面的圖區不是 16:9（K24 的排法：色塊佔 25% 高，1080×1350 的圖區是 1080×1012，接近 1:1）。用同一句 `COVER_SCENE` 另外畫一張底圖，比例取圖區最接近的生圖比例（由 `layoutCover` 算出圖區再對應，不寫死）；同一種圖區只畫一次，各頻道共用。只在這個題目的社群草稿裡真的有需要該尺寸的頻道時才畫（沒有連 FB／IG／Bluesky 的網站不多花錢）。估價（`lib/content/topics/cost.ts`、`budget.ts`）跟著實際會畫的張數算。
3. **套版與附圖**：每則草稿附上它的頻道對應尺寸的封面（K27 的附圖流程，改成按草稿取尺寸）。Facebook 一則、Instagram 一則各拿直式；「其餘頻道」共用的那一則：裡面的頻道需要同一種尺寸就用那一種；混了不同尺寸 → 用其中最多頻道需要的那一種，同數時用直式，並在題目的檢查項寫明哪些頻道拿到的不是自己的尺寸。
4. **退路**：直式底圖畫不出來 → 拿橫的底圖 cover-fit 裁進直式圖區照樣套版，檢查項寫明；套版失敗 → 附網站那一張；都沒有 → 不附（K27 既有行為）。
5. 題目的 artifacts 記下每種尺寸的封面網址與底圖網址（接在 K25 的 `cover` 物件上，不另開欄位名稱風格）。

## 既有資料
K29 上線前做好的題目：到附圖那一步時若只有橫式封面 → 附橫式（不回頭補畫直式）。

## 測試（只寫這些）
- 對照表：每個列出的平台回傳的尺寸；未知平台 → 網站尺寸。
- 有 FB＋IG＋Bluesky：直式底圖只畫一次；三則草稿都附直式封面且是對應尺寸；網站精選圖片仍是 1200×900。
- 只有 YouTube 或沒有社群頻道：不畫直式底圖，估價不含它。
- 直式底圖失敗 → 用橫的裁、有檢查項。
- 共用草稿混尺寸 → 選多數、有檢查項。
- `npx tsc --noEmit`＋**全套** `npm test`。不打付費 API、不真的發文。

## 邊界
不改封面排法（K24）、不改網站精選圖片的尺寸、不新增網站設定欄位、不動手動文章頁、不部署、不 push。不做無效益測試。commit（pathspec）。
回報（繁體中文）：FILES／TESTS（全套數字）／COMMITS／RISKS／一句結論。
