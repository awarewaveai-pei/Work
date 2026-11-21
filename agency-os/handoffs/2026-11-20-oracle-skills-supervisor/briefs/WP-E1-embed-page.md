# E1 引擎嵌入版頁面

先讀：`COMMON.md`、`COMMON-WP.md`、`ORACLE-WP-SPEC.md` §1、§2-2、§2-4。專案 `Projects/internal/ziwei-doushu/`（Next 16，先讀其 `AGENTS.md`）。模型 Opus 5.5。

## 目的
WordPress 頁面會用 `<iframe src="/embed/<語言>/<工具>">` 載入同網域的引擎頁。做出這個頁面：只有工具本身，沒有引擎的工具列與語言鈕，高度等於內容。

## 已知事實
- 現有工具頁 12 個：`app/[lang]/<slug>/page.tsx`，各自寫一段標題再放 `<XxxTool dict={dict} locale={lang} />`（例 `app/[lang]/ziwei/page.tsx:15-40`；12 個元件都是這兩個 props）。slug 清單 `lib/site.ts:16` `PAGE_SLUGS`。
- 根版面 `app/[lang]/layout.tsx:65-74`：`<html class="… h-full">`、`<body class="min-h-full flex flex-col">`、`<SystemNav>`。工具頁 `<main class="relative flex-1 …">`。
- 試驗結果：在 iframe 裡這個版面讓 `documentElement.scrollHeight` 只增不減（量到 4157px，內容實際到 902px）；引擎工具列出現在框內。
- `proxy.ts:38-40` matcher 會把沒有語言前綴的路徑 308 到 `/<語言>/…`，`/embed/...` 會被它轉走。

## 要做
1. slug → 工具元件的單一對照（新檔，例 `components/toolRegistry.tsx`），鍵的型別用 `PageSlug`，少一個 tsc 會紅。現有 12 個 `page.tsx` 不改。
2. 新路由 `app/embed/[lang]/[slug]/page.tsx`＋自己的根版面 `app/embed/layout.tsx`（或 Next 16 文件建議的等價做法；先讀 `node_modules/next/dist/docs/`）。版面：沿用 `app/globals.css` 與同一組字型變數；`html`、`body` 不設 `h-full`／`min-h-full`／flex 撐滿；不放 `SystemNav`；工具外層一個固定 id 的根元素 `id="aw-oracle-root"`（外掛的父頁腳本量它的高度）。語言或 slug 不合法 → `notFound()`。
3. `proxy.ts` matcher 排除 `embed`。
4. 嵌入頁回應標頭：`X-Robots-Tag: noindex, indexifembedded`、`Content-Security-Policy: frame-ancestors 'self'`。只加在 `/embed/*`，不動其他路徑的標頭。
5. 工具內連到其他工具的連結（若有）在嵌入版要讓整個視窗換頁（`target="_top"`，或由嵌入版面統一處理）。先 grep 實際有哪些，沒有就不做。
6. 浮層：`components/PlaceField.tsx`、`components/TarotCardView.tsx`、`components/TarotTool.tsx` 若用固定定位顯示搜尋結果或放大圖，改成在原位置展開；獨立頁行為要一致。先 grep，沒有就寫進回報，不改。

## 檔案
新：`components/toolRegistry.tsx`、`app/embed/layout.tsx`、`app/embed/[lang]/[slug]/page.tsx`、測試一支（對照表涵蓋 `PAGE_SLUGS` 全部；不合法 slug 404）。改：`proxy.ts`；必要時第 6 點列的三個元件；`next.config.ts`（只有標頭需要時）。

## 驗收
- `npx tsc --noEmit` exit 0；`npx vitest run` 受影響路徑綠。
- 預覽實看 `/embed/zh-TW/ziwei`、`/embed/en/tarot` 與另外任兩個：沒有工具列；送出表單有結果；`#aw-oracle-root` 的高度等於內容高度，把視窗拉高後不變大。375px 寬無橫向捲動。
- `curl -sI http://localhost:<port>/embed/zh-TW/ziwei` 有上述兩個標頭；`/zh-TW/ziwei` 沒有 `frame-ancestors` 這條。
- 原有 12 頁逐頁打開與改前相同（工具列、標題都在）。

## 邊界
不做 CSP 的 `script-src`（E2）；不做轉向（E3）；不動 `app/api/**`、`lib/**`。
