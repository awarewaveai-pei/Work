# K26 文章配圖的來源可以選（手動與排程各自選）

先讀 `briefs/COMMON.md`。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。操作者 2026-11-25 看完 K13 實測（`agency-os/reports/model-bakeoff/2026-11-article-image/runs.json`）：測過的來源都留著讓她選；免費的 Codex 留著；排程也要能選。

## 現況（監工已讀）
- 文章能用的生圖模型寫死一份：`lib/content/image/article-image.ts` `ARTICLE_IMAGE_MODELS = ["flux-schnell","flux-dev","ideogram-v3-balanced","nano-banana-pro","flux-2-max"]`。K13 實測過、她判定沒出錯的三個裡，`openai-low` 和 `nano-banana-2` **不在這份清單**，網站選了也會被退回預設。
- 網站設定頁 `app/(shell)/tools/content/sites/SiteManager.tsx` 的「圖片模型」（`IMAGE_MODELS`）與手動文章頁 `ContentStudio.tsx` 的圖片模型選項，各有自己的清單。
- 網站只有一個 `imageModel`（`lib/content/brand-voice.ts`）：手動頁拿它當預設，排程（`lib/content/topics/make.ts`，K10）也讀它。`codex-image` 只能本人按、筆電開著（`lib/tarot/image-gen.ts` `codex_not_deferred`／`codex_operator_only`），排程用不了；網站若為了手動選 Codex，排程就悄悄退回預設。
- `/api/content/image` 本來就收任何 `isTarotModel`（K13 就是這樣測 `openai-low`、`nano-banana-2`、`flux-2-klein-4b`、`codex-image` 的，四個都成功）。

## 要的結果
1. **一份清單**（放 `article-image.ts`，三處選單都讀它，不各寫一份）＝K13 測過的六個：`openai-low`、`nano-banana-2`、`flux-dev`、`flux-schnell`、`flux-2-klein-4b`、`codex-image`。每個帶：顯示名稱與單價（讀 `public/editor-shared/image-models.js` 目錄，不重寫數字）、`schedule: boolean`（`codex-image` = false，其餘 true）。沒測過的三個（`ideogram-v3-balanced`、`nano-banana-pro`、`flux-2-max`）從文章的選單拿掉；正式資料監工已查（2026-11-25）：只有 Soulful 存 `flux-schnell`，其餘未設定，不用搬資料；讀取時仍相容：存到清單外的值 → 當成未設定。
2. **手動文章頁與網站的「圖片模型」**（手動的預設）：六個都能選，按鈕上看得到每張價錢（NT$，`usdToNtd`）；`codex-image` 標「免費，只限本人、筆電要開著」。
3. **排程另外選**：`SiteContentDefaults` 加 `scheduleImageModel`。網站設定頁在「排程文章的文字 AI」那一區旁邊加「排程文章的圖片來源」：按鈕＝清單裡 `schedule: true` 的五個＋「不配圖」；`codex-image` 不出現在這一排，下面一行說明「Codex 免費生圖要等主機常駐上線後才能給排程用」。`make.ts` 的排程讀取順序：`scheduleImageModel` → `imageModel`（若可排程）→ 預設；估價（`lib/content/topics/cost.ts`、`budget.ts`）跟同一個結果算。K25 加的那行「自動產文用不了這個模型…」說明改指向新的排程設定，不重複兩種說法。
4. **預設值不改**（`DEFAULT_IMAGE_MODEL` 仍是 `flux-schnell`）：換預設會改變沒設定網站的花費，等操作者指定。
5. 手動頁選 `codex-image` 時走既有的等待機制（`lib/studio/codex-wait.ts` `fetchAwaitingCodex`；先查手動文章頁的生圖呼叫是不是已經經過它，沒有就接上）。

## 既有資料
Soulful 的 `imageModel: "flux-schnell"` 行為不變（手動預設＝它；排程沒設 `scheduleImageModel` → 沿用它）。沒設定的網站行為不變。

## 測試（只寫這些）
- 清單是三處選單的唯一來源（結構測試：`SiteManager`／`ContentStudio` 不得再有自己的文章生圖模型陣列）。
- 排程讀取順序三種情況；`imageModel = codex-image` 且沒設排程來源 → 預設；估價與實際用的模型一致。
- 存到清單外的舊值 → 當成未設定。
- 網站設定存 `scheduleImageModel` 後讀回一致；`codex-image` 被排程欄位拒絕（400）。
- `npx tsc --noEmit`＋**全套** `npm test`（上一張卡只跑部分目錄漏掉三個結構測試）。不打付費 API。

## 邊界
不改預設模型、不動封面版型、不動畫面描述的指令、不改 `app/(shell)/tools/ai-models/MeasuredRuns.tsx`（監工自己寫實測紀錄）。不部署、不 push。commit（pathspec）。
回報（繁體中文）：FILES／TESTS（全套數字）／COMMITS／RISKS／一句結論。
