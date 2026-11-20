# R3：橫幅工具當積木——橫幅字卡當影片片頭

操作者 2026-11-20：「或是可以套版？像 /tools/banner」「他是一個積木」「我真是天才」。

前置：R2、R4 已在 main（片頭樣式清單 `next-admin/public/editor-shared/intro-styles.js`，`kind`＝來源種類；封面開場走「圖片 → Remotion 做成短片 → 片頭接合」那條路；轉場模組 `transitions.js`）。

共通規則：repo `D:\Work`，在自己的 worktree 分支工作。先讀 `CLAUDE.md`、`agency-os/AGENTS.md`。先 `git fetch origin && git rebase origin/main`。在 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`；部署不是你的事；不對正式站發布任何東西；回報操作者一律繁體中文。VW＝`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`；NA＝`…/apps/next-admin/`；RS＝`…/apps/remotion-service/`。

## 已有的（先讀，沿用）
- 橫幅工具：`NA/app/(shell)/tools/banner/BannerStudio.tsx`（`PRESETS` 12 種尺寸含 16:9、9:16、4:5；`TEMPLATES`:281 六個版型；瀏覽器 canvas `exportToPng`；`saveDesign` 存進「我的設計」）。
- 我的設計：`NA/app/(shell)/tools/designs/DesignsGallery.tsx`、`NA/app/api/tools/designs/route.ts`（N15 已按組織過濾）。
- 封面開場：`VW/backend/cover.cjs`、`RS/src/compositions/Cover.tsx`（多於一格時動畫：放大＋標題滑入；`CoverOpener`）。

## 要做
1. **片頭樣式多一種「橫幅字卡」**（`kind: "still"`）：在 `intro-styles.js` 登記一次；剪輯器片頭選擇器與網站設定都讀這份。
2. **動畫**：靜態圖做成 N 秒開場（預設 2 秒，2–5 秒）：慢慢放大，最後接轉場（轉場模組的清單，預設溶解 0.5 秒）。走封面開場同一條路（Remotion 吃一張圖、不疊標題字），不另寫一套。比例不符的圖：置中放大鋪滿（cover），不變形；選擇器上比例不同的設計標「會裁切」。
3. **手動（剪輯器）**：選「橫幅字卡」後兩個按鈕：
   - 「從我的設計挑」：列出同組織的設計縮圖格（有圖卡片，`aria-pressed`，不用下拉），選一張。
   - 「開橫幅工具做一張」：新分頁開 `/tools/banner`，帶參數：比例＝這支影片的比例、標題先填好（影片標題）、版型預設片頭用的。做完按「存到我的設計」後，剪輯器的清單重新整理就看得到（不做跨視窗即時傳回）。
4. **自動（網站設定）**：自動影片片頭樣式的複選裡多「橫幅字卡」，勾了要再挑一張或多張存好的設計當這個網站的固定品牌開場，跟其他勾選的樣式一起依序輪流（規則照 R2：以已做影片數取餘）。設計被刪了 → 那一輪跳過、記原因在工作上，不擋出片。
5. **橫幅工具加片頭版型**：`TEMPLATES` 加至少三個「片頭」版型（大標題置中／標題＋副標／左對齊大字＋品牌色條），沒有價格、沒有購買按鈕，16:9、9:16、4:5 都排得好（標題在安全區）。沿用 globals class 與主題 token，零 hex。
6. **舊資料**：已存的片頭樣式與網站設定照舊；沒有這個欄位＝不用橫幅字卡。舊資料測試一支。
7. **失敗不擋**：圖讀不到、Remotion 失敗或逾時 → 出沒有開場的片，原因記在工作上。

## 不要做
- 不在影片端重畫橫幅（圖就是圖）。不用 AI。費用 NT$0。不改橫幅工具既有的版型與匯出。
- 不做無效益測試：只寫本卡點名的——still 開場末格＝原圖（裁切後）、網站輪流含字卡、設計被刪跳過、舊資料；突變只做在「別組織的設計不可選」這個擁有權守衛，一次。

## 驗收
- VW `node tests/gate.cjs`（另跑一次 `AWAREWAVE_APP_DIR=.awarewave`）、RS `npm test`、NA `npx tsc --noEmit`＋受影響的 vitest。
- 實跑（筆電）：用新片頭版型在橫幅工具做三個比例各一張，存進我的設計，剪輯器挑來當片頭各出一次片，看開場與轉場；截圖或檔案路徑寫進回報。
- 審查一輪（Codex 有額度 `/codex-review`，沒有就 critic，commit 寫 `ORACLE_WAIVED`）。

## 回報
`FILES:`／`TESTS:`／`RISKS:` 三行加一句結論；要部署的服務各列出來。
