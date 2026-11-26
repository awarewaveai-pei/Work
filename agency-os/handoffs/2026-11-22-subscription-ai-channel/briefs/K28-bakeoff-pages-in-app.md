# K28 實測的完整比較頁放進「AI 模型與成本 → 實測紀錄」

先讀 `briefs/COMMON.md`。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。操作者 2026-11-25：`/tools/ai-models?tab=measured` 只有文字表格，「沒有把文章和圖片測試頁面完整放上」。她要在那一頁就看得到完整的比較頁（文章全文、圖片並排），不是只有摘要列。**另一個工人同時在做 K27（`lib/content/**`、`lib/social/**`），你不要碰那些。**

## 現況（監工已讀）
- `app/(shell)/tools/ai-models/MeasuredRuns.tsx`：`GROUPS` 每組一張文字表（`Row`），可選一張靜態圖（`image`）。「文章生成」「文章配圖」兩組只有文字列。
- 完整比較頁是三份已做好的獨立 HTML（原本只發布成 claude.ai 的私人頁面，後台看不到）：
  - `agency-os/reports/model-bakeoff/2026-11-article/article-bakeoff.html`（12 篇盲測；會 `fetch("articles.json")`，同資料夾的 `articles.json` 184KB；對照表 `key.json`）
  - `agency-os/reports/model-bakeoff/2026-11-copy/copy-bakeoff.html`（八種文案；單檔 89KB）
  - `agency-os/reports/model-bakeoff/2026-11-article-image/image-bakeoff.html`（文章配圖；單檔 1.76MB，圖片以 base64 內嵌；產生器 `build_image_page.cjs`、資料 `runs.json`、縮圖 `img/`）
- `sg-deploy.sh` 只同步 `apps/next-admin`，`agency-os/reports/` 不會到主機：頁面要放進這個 app 才看得到。

## 要的結果
1. 三份頁面放進 app（建議 `content/model-bakeoff/<slug>/`，不要放 `public/`——`public/` 不經登入就能讀，這些是內部實測）。文章盲測頁改成不需要另外抓 `articles.json`（建置時內嵌，或路由一併提供——擇一並說明）。來源以 `agency-os/reports/model-bakeoff/` 為準：寫一支小腳本（`scripts/` 下）把三份複製／內嵌到 app 資料夾，之後重測只要重跑它；檔頭註明來源路徑與這支腳本。
2. 一條員工才能讀的路由（先讀 `app/(shell)/tools/ai-models/page.tsx` 與同區既有路由怎麼做身分檢查，抄同一套；`withFeature` 的路由要登記 `lib/entitlements/route-features.ts`——`lib/portal/__tests__/registry-code.test.ts` 會擋）回傳指定 slug 的 HTML；slug 只收固定清單（三個），不得拼路徑讀任意檔；回應加 `Content-Security-Policy: sandbox allow-scripts`（頁面自己的互動要能跑，但不能碰後台的 cookie／同源資源）與 `X-Content-Type-Options: nosniff`。
3. 「實測紀錄」分頁：三組各自在表格**上方**直接嵌入完整頁面（`<iframe sandbox="allow-scripts">`，寬度 100%，高度夠看——固定高度＋頁內捲動即可，不做巢狀自動伸縮），旁邊一個「另開完整頁面」連結（按鈕，不是下拉選單）。對應：文章生成 → article；文章配圖 → image；八種文案 → 若 `GROUPS` 裡沒有文案那一組，就新增一組「八種文案」只放嵌入頁與一句說明（數字不要手打重抄，頁面裡已經有）。
4. 文字表格保留在嵌入頁下方（那是摘要與出處）。
5. 外觀：iframe 外框用既有的卡片樣式與主題變數，不寫死顏色。三份 HTML 內部樣式不改（它們自己支援深淺色）。

## 測試（只寫這些）
- 路由：未登入／非員工 → 拒絕；清單外的 slug（含 `../`）→ 404；清單內 → 200、`text/html`、帶上述兩個標頭。
- 分頁：三組各有一個 iframe 指向對應 slug、各有「另開完整頁面」連結。
- 腳本跑完後 app 資料夾裡的三份與來源一致（文章頁不再含 `fetch("articles.json")`）。
- `npx tsc --noEmit`＋**全套** `npm test`。

## 邊界
不改三份頁面的內容與數字、不改 `lib/content/**`、不部署、不 push。建置後容器映像會多約 2MB，可接受；若 Next 的輸出追蹤（standalone）沒把 `content/` 帶進映像，要處理到正式容器讀得到（先查 `next.config` 的 `outputFileTracingIncludes` 與 Dockerfile 的 COPY；**不得改 Dockerfile 以外的主機設定**，需要改 Dockerfile 就停下回報）。commit（pathspec）。
回報（繁體中文）：FILES／TESTS（全套數字）／COMMITS／RISKS／正式容器讀得到檔案的依據／一句結論。
