# Card 10 — 影片 ④ 重新生成：真的換、每個比例都換

回報操作者一律繁體中文、極精簡。不做無效益測試：只寫本卡點名的測試。
背景：`agency-os/docs/video_generator/VIDEO_TOOL_OPERATOR_FINDINGS_2026-10-26.md` M7、M8。路徑縮寫 `NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## Decision
不變量：**場景的「重新生成」與「上傳自己的素材」要改到成片會用的每一個比例，而且重新生成的結果不能等於舊的那張。**

1. Pexels 永遠取第一筆（`NA/lib/content/video/pexels.ts:55-69` 照片、`:85-` 影片）→ 兩個函式各加第 5 個選用參數 `exclude?: readonly string[]`。`exclude` 為空或未給：行為完全不變（`per_page=5`、取第一個合格結果）。`exclude` 非空：`per_page=15`，先照原本規則篩出合格 URL，去掉 `exclude` 裡的，剩下的隨機取一個；全被排除就回 `null`（buildSceneAsset 既有的失敗路徑會處理）。
2. `NA/lib/content/blocks/video-pipeline.ts:300` `buildSceneAsset` 的 `opts` 加 `excludeAssets?: readonly string[]`，原封傳給 `:329`、`:332`、`:339` 三個 Pexels 呼叫。AI 生圖路徑不用它（同 prompt 本來就會出新圖）。
3. `NA/app/api/video/regenerate-image/route.ts`：有 `oldImageUrl` 時把 `[oldImageUrl]` 當 `excludeAssets` 傳入（`:55-69` 的 `buildSceneAsset` 呼叫）。其餘不變（含刪舊 R2 圖、計費 `withFeature`）。
4. `NA/app/(shell)/tools/video/VideoStudio.tsx`：
   - `handleRegenerateImage`（`:513-552`）：對 `draftFormats` 裡**每個**比例各打一次 `/api/video/regenerate-image`（`format` 帶該比例；`oldImageUrl` 帶 `draftFormatUrls[fmt]?.[sceneIndex]`，正在看的比例用 `scene.imageUrl`），`Promise.all` 並行；成功的比例各自更新 `draftFormatUrls[fmt][sceneIndex]`，正在看的比例同時更新 `draftScenes`；有比例失敗時 `setGenError` 寫明哪個比例失敗，成功的照樣套用。`draftFormats` 為空時退回只做正在看的比例（現行行為）。
   - `handleUploadAsset`（`:555-` 起）：上傳成功後把同一個 URL 寫進**每個**比例的 `draftFormatUrls[fmt][sceneIndex]`（不只 `activeFormat`）。
   - 「🔄 重新生成」按鈕的 `title`（`:1381`）改成：多比例時「重新生成這一場（N 個比例各生一張，費用 ×N）」，單比例維持「不喜歡這張圖？重新生成一張」。

## Constraints
- 首次生成（`/api/video/draft`、`/api/video/generate`）結果不得改變：`exclude` 未給的路徑逐字等同現行。
- 不改計費、不改 R2 刪除規則、不改 render-draft。
- 不新增依賴。

## Files
- `NA/lib/content/video/pexels.ts`
- `NA/lib/content/video/__tests__/pexels-exclude.test.ts`（新）
- `NA/lib/content/blocks/video-pipeline.ts`
- `NA/app/api/video/regenerate-image/route.ts`
- `NA/app/(shell)/tools/video/VideoStudio.tsx`

## Acceptance
- `pexels-exclude.test.ts`（mock `fetch`，5 張合格照片 A–E）：(a) 不給 exclude → 回 A，且請求 URL 含 `per_page=5`；(b) exclude=[A] → 回值 ≠ A 且屬於 B–E，請求含 `per_page=15`；(c) exclude=[A,B,C,D] → 回 E；(d) 影片函式同 (a)(b) 各一條。
- `npx tsc --noEmit` 綠。
