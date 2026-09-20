# 🧩 積木契約（Block Convention）— 前後端共用 SSOT

讓內容引擎的每個能力（搜尋源 / 生成 / 發佈…）變成**可抽換、可移植、可增刪**的積木。
每個積木**自我註冊**、**只透過 `ctx` 溝通**、**整段可複製**、**刪掉那段即關閉**，不影響其他。

> 本檔是契約正本。前端 canvas 積木實作見 [`public/vector-editor.html`](../../../public/vector-editor.html)（`AB.registerBlock`）；
> 後端積木骨架見同目錄 [`registry.ts`](./registry.ts)，搜尋積木家族見 [`../trending-sources.ts`](../trending-sources.ts)。

## 先看這裡

- [完整積木目錄](#完整積木目錄)
- [後端 registry 積木](#後端-registry-積木)
- [生圖 / 影像生成積木](#生圖--影像生成積木)
- [AI / Prompt 積木](#ai--prompt-積木)
- [影像處理 / 設計工具積木](#影像處理--設計工具積木)
- [POD / Printful / WooCommerce 積木](#pod--printful--woocommerce-積木)
- [前端 UI 積木](#前端-ui-積木)

---

## 核心真相：一套契約、兩個 registry

跨 runtime（瀏覽器 JS / Next.js 後端 / Python）**不可能共用同一個記憶體物件**，
所以不是「一個 registry」，而是**同一套規矩、按 runtime 落兩個 registry**：

| | 前端 UI 積木 | 後端資料積木 |
|---|---|---|
| 註冊 | `AB.registerBlock({...})` | `register({...})`（`registry.ts`） |
| 進入點 | `mount(ctx, body=DOM)` | `run(ctx)` |
| `ctx` | fabric canvas（`canvas/add/snapshot/render`） | 執行資料（`geo`…） |
| 用途 | 畫布工具（QR / 調色 / 物件效果） | 搜尋源 / 文章 / 影片 / 發佈 |
| 契約 | id・icon・title・自註冊・ctx-only・刪即關 | **同上** |

**規則**：積木只透過 `ctx` 互動，不直接碰全域 → 才能整段複製到別的專案，只要對方提供同樣的 `ctx` 介面。

---

## 後端 Block 形狀（`registry.ts`）

```ts
register({
  id:    "search/google-news",   // 唯一代號，建議 "<kind>/<name>"
  title: "Google News",          // 顯示名
  icon:  "📰",                    // 可省
  kind:  "search",               // search | article | video | quality | publish | product | image | ai
  geos:  "*",                    // 選用地區閘；"*" 或 ["TW",...]，省略視為 "*"
  enabled: true,                 // 預設 true；false = 註冊但跳過（刪整段 = 徹底移除）
  run: async (ctx) => { /* 只讀 ctx，回傳該 kind 約定的輸出 */ },
});
```

編排器只做一件事——跑某個 kind 註冊好的積木，永遠不必認識任何單一積木：

```ts
for (const b of byKind("search").filter(b => geoMatch(b, geo))) {
  // ...b.run({ geo })
}
```

`registry.ts` 提供：`register()` / `byKind<TOut>()` / `listAll()`（manifest）/ `geoMatch()`。
`register()` 以 `id` 為鍵 → 重複註冊即取代（dev HMR 安全）。

---

## 怎麼「增 / 刪」一個搜尋積木（4 法）

| 方式 | 做法 | 免部署? |
|---|---|---|
| ① 內建開關 | 該 block 加 `enabled:false`（刪整段 = 徹底移除） | ❌ |
| ② 加任意 RSS/Atom | `trending-sources.ts` 內 `rssSearchBlock({ id, title, url, geos })` 一行 | ❌ |
| ③ 免改 code | env `CONTENT_TRENDING_FEEDS`（見下） | ❌（改 env 需重啟） |
| ④ 未來 DB/UI | 讓管理層呼叫 `register()` 把 DB rows 注入（介面已就緒） | ✅ |

env 範例（營運自訂 feed，受信任營運者輸入）：

```bash
CONTENT_TRENDING_FEEDS='[{"id":"hn","title":"Hacker News","url":"https://hnrss.org/frontpage","geos":"*"}]'
```

> **安全**：非寫死的 feed URL 一律過 `isSafePublicHttps()`（https-only、擋私有/迴圈/ULA/link-local/CGNAT/IPv4-mapped）。
> 限制：只比對字面 host，**擋不住 DNS rebinding** → env 視為受信任營運者輸入；未來開放任意使用者貼 feed 時，必須在 fetch 前加 DNS 解析後比對或 allowlist。

---

## 怎麼「抽出來」給別的專案用

1. 複製該 `register({...})` 整段（或整個 block 檔）。
2. 確認它只用到 `ctx` 與外部函式庫。
3. 對方專案有 `register` + 相同 `ctx` 介面即可貼上即用。

---

## 完整積木目錄

本節盤點 **目前已存在的積木**，不只列 `lib/content/blocks/registry.ts` 內的 content blocks。
狀態欄意義：

| 狀態 | 意義 |
|---|---|
| `registered` | 已用後端 `register({...})` 自註冊，可由 `byKind()` 取用 |
| `pipeline` | 已被 `lib/content/pipeline.ts` side-effect import，會進 headless 編排器 |
| `toolkit` | 已是共用核心能力，但尚未包成 `register()` block |
| `route/action` | HTTP route 內已有獨立 action，行為上是積木，尚未抽成 registry block |
| `UI block` | 前端 `AB.registerBlock(...)` 或 React 工具面板積木 |
| `planned` | 路線圖，尚未落地 |

### 後端 registry 積木

| id | kind | 狀態 | 入口 / 檔案 | 外部依賴 | 說明 |
|----|------|------|-------------|----------|------|
| `search/google-news` | search | `registered` | `lib/content/trending-sources.ts` | 無（RSS） | Google News RSS 趨勢來源 |
| `search/reddit` | search | `registered` | `lib/content/trending-sources.ts` | 無（Atom RSS，需描述性 UA） | Reddit 搜尋 / 趨勢來源 |
| `search/ptt` | search | `registered` | `lib/content/trending-sources.ts` | 無（HTML scrape） | TW PTT 趨勢來源 |
| `search/serper` | search | `registered` | `lib/content/trending-sources.ts` | `SERPER_API_KEY` | Serper 即時 Google News 趨勢來源（取代原 Perplexity 即時 block） |
| `search/<env feed>` | search | `registered` | `CONTENT_TRENDING_FEEDS` → `trending-sources.ts` | `CONTENT_TRENDING_FEEDS` | 營運設定的 RSS/Atom feed |
| `search/db/<id>` | search | `route/action` | `buildDbSearchBlocks()` | DB row + safe URL | 由 UI/DB 暫時注入，傳給 `runTrending(..., extraBlocks)` |
| `article/generate` | article | `registered` + `pipeline` | `lib/content/blocks/article-generate.ts` | `ANTHROPIC_API_KEY` | 長文 SEO/GEO/RankMath 文章生成，包 `generate-core.ts` |
| `quality/check` | quality | `registered` + `pipeline` | `lib/content/blocks/seo-check.ts` | 無 | RankMath/SEO 22 點檢測，包 `seo-check-core.ts` |
| `publish/wordpress` | publish | `registered` + `pipeline` | `lib/content/blocks/publish-wordpress.ts` | wp-bridge (`WPBRIDGE_*`) | 發佈到 WordPress draft；draft-first 紅線在 core |
| `product/copy` | product | `registered` | `lib/content/blocks/product-copy.ts` | `ANTHROPIC_API_KEY` | POD 商品文案 + SEO/GEO/AEO + RankMath 商品版評分 |

> `product` 是商品頁分類（短文、答案膠囊式），與 `article`（長文部落格）區隔：同一套 RankMath 引擎，
> 但商品頁把長文專屬檢查（字數/內外鏈/多 H2 AEO/日期訊號）標 N/A，分數只計商品適用項（見 `product-copy.ts`）。

### 已接線 headless pipeline

| pipeline | 狀態 | 接線檔 | 階段 |
|---|---|---|---|
| `runContentPipeline()` | `pipeline` | `lib/content/pipeline.ts` | `article/generate` → `quality/check` → `publish/wordpress` |
| `runTrending()` | `registered` 聚合入口 | `lib/content/trending-sources.ts` | 跑所有 enabled `search/*`，回 `TrendingItem[]`，再由 caller 選題餵進內容管線 |

### 生圖 / 影像生成積木

這批是實際已存在、跨 Tarot / Studio / Content / Mockup 共用的生圖能力。`registry.ts` 目前已新增 `image` kind；
`image/style-design-workbench` 已先正式註冊，其餘生圖能力仍標 `toolkit` / `route/action`，等待逐步抽成 registry block。

| id / 名稱 | 狀態 | 入口 / 檔案 | 外部依賴 | 說明 |
|---|---|---|---|---|
| `image/generate` | `toolkit` | `lib/tarot/image-gen.ts` → `generateTarotImage()` | `REPLICATE_API_TOKEN`, `OPENAI_API_KEY` | 共用 17 模型 combo-pack，輸出統一 data URL |
| `image/model-options` | `toolkit` | `lib/studio/model-options.ts` | 無 | Studio/Mockup 模型選單與 `maxRefs` SSOT |
| `image/style-design-workbench` | `registered` + 萬用 `UI block` + `route/action` | `lib/content/blocks/image-style-design-workbench.ts`、`lib/studio/style-design-workbench.ts`；目前 UI 宿主：`app/tools/tarot/TarotStudio.tsx` Step 1 | 生圖 provider keys, `ANTHROPIC_API_KEY` for prompt help | 萬用生圖風格積木；後端 block 產出 `styleAnchor`，Tarot / POD / Studio 都應共用 |
| `image/tarot-generate` | `route/action` | `app/api/tools/tarot/generate/route.ts` | 生圖 provider keys | Tarot Studio 單張 / 預覽生圖入口 |
| `image/tarot-batch` | `route/action` | `app/api/tools/tarot/batch/*` | Trigger.dev + 生圖 provider keys | Tarot 專用整副牌背景批次生成；78 張是 Tarot 卡數，不屬於一般生圖 / POD 工作台 |
| `image/studio-generate` | `route/action` | `app/api/tools/studio/generate/route.ts` | 生圖 provider keys | Studio/POD 商品圖生圖入口，走 `generateImage()` facade |
| `image/content-image` | `route/action` | `app/api/content/image/route.ts` | 生圖 provider keys | Content Studio Media Hub 生圖入口 |
| `image/suggest-prompt` | `route/action` | `app/api/tools/tarot/suggest-prompt/route.ts` | `ANTHROPIC_API_KEY` | 中文/英文 brief → 英文 art-direction prompt |

目前模型 family（core 支援 17；Tarot Step 1 風格設計 UI 暴露 15；Studio/Mockup 用 `STUDIO_MODEL_OPTIONS` 暴露 17）：

| family | model ids |
|---|---|
| BFL / FLUX | `flux-schnell`, `flux-dev`, `flux-kontext-dev`, `flux-kontext-pro`, `flux-2-max` |
| Ideogram | `ideogram-v2a-turbo`, `ideogram-v3-balanced`, `ideogram-v4-turbo`, `ideogram-v4-quality`, `ideogram-character` |
| Google / Replicate | `seedream-4.5`, `nano-banana-2`, `nano-banana-pro`, `imagen-4` |
| OpenAI | `openai-low`, `openai-medium`, `openai-high` (`gpt-image-1`) |

### AI / Prompt 積木

AI prompt 是獨立積木，不併進 `image/style-design-workbench`。改圖流程是：

`image/style-design-workbench` → `image/studio-generate` / `image/tarot-generate` → `ai/image-edit-prompt` → `image/studio-generate` / `image/inpaint` / `image/genfill`

| id / 名稱 | 狀態 | 入口 / 檔案 | 外部依賴 | 說明 |
|---|---|---|---|---|
| `ai/image-edit-prompt` | `registered` + `route/action` + 共用 UI | `lib/content/blocks/ai-image-edit-prompt.ts`、`lib/studio/image-edit-prompt.ts`、`app/api/tools/studio/edit-prompt/route.ts`、`components/tools/ImageEditPromptPanel.tsx` | `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` | 已生成圖片 + 修改意圖 → Claude/OpenAI 寫英文 edit prompt；共用 UI 已接 Tarot / Studio / Mockup，輸出可接 img2img / inpaint / genfill |

文字 AI 工具組與 SEO Content Studio 共用 `lib/ai/text-model-options.ts`，目前分組如下：

| group | model ids |
|---|---|
| Claude | `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-8`, `claude-fable-5` |
| OpenAI | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-4o` |

#### `image/style-design-workbench` 詳細

這是 **萬用生圖風格積木**。目前 UI 宿主在 Tarot Studio 截圖中的 **Step 1 · 風格設計**，但它不應只屬於 Tarot：它不是單純生一張圖，而是一個完整的風格決策積木，輸出可重用的風格錨點；Tarot 工具可把它套到整副牌，POD / Studio 則重用同一套風格與模型策略。

目前狀態：已正式抽成 `registry.ts` 後端積木，`register({ id: "image/style-design-workbench", kind: "image" })` 在 `lib/content/blocks/image-style-design-workbench.ts`；`lib/content/blocks/register-all.ts` 會 side-effect import 它。後端輸出契約是 `styleAnchor`（model/mode/stylePrompt/subject/refs/seed/providerOptions），UI 宿主仍先由 Tarot Step 1 使用。

| 子積木 / 能力 | 入口 / 檔案 | 說明 |
|---|---|---|
| 模型矩陣 | `TarotStudio.tsx` `MODEL_OPTIONS` | 15 個 UI 模型，依 BFL / Ideogram / Google+ / OpenAI 分組；每顆 chip 顯示估算 NT 成本與 `maxRefs` |
| 生成模式 | `mode: "text" \| "image"` | 文字生圖或以圖生圖；參考圖依模型 `maxRefs` gate |
| 參考圖壓縮 | `downscaleImageFile()` | 上傳圖縮到 1024px JPEG，避免 request body 超過 10MB |
| 角色 / 主角描述 | `subjectText` | 可指定人物、動物、物件或角色；若上傳真人/角色照可留空，讓模型照圖 |
| 風格 chip catalog | `STYLE_CATALOG` / `STYLE_PRESETS` | 103 個風格 chip；中文顯示、英文 prompt 進模型 |
| 風格分類 | `tarotStyles.ts` | 西方畫家 29、亞洲畫家 26、媒材 16、風格 32 |
| 英文 prompt 解析 | `resolveStylePrompt()` | zh label → 英文 prompt；畫家類會 lead with `In the style of <name>.` |
| Prompt 組裝 | `buildCardPrompt()` | style + subject + RWS faithful scene；style capped at 1200 chars，避免模型吃掉牌面 scene |
| AI prompt 建議 | `/api/tools/tarot/suggest-prompt` | brief → 英文 art-direction prompt；使用者可手動覆寫最終英文 |
| 多模型比較 | `generateCompare()` | 依序跑選中的模型，避免 Replicate 429；結果可點選放大 / 選定 |
| 風格鎖定 | `lockStyle()` | 鎖定模型、prompt、seed、參考圖策略；後續生成可重用同一風格，Tarot 才套到整副牌 |
| 預覽與圖庫 | `generatePreview()`, `saveToGallery()` | 預覽圖寫入 My Designs / R2 gallery，不阻塞 UI |
| Tarot 專用批次延伸 | Step 2 / background batch | Tarot 專用：鎖定後可分組生成或 Trigger.dev 背景批次整副牌；一般 POD / Studio 不需要 78 張批次 |

風格 catalog 正本是 `app/tools/tarot/tarotStyles.ts`。`cards.ts` 只負責把風格轉成生圖 prompt 並保留 Tarot/RWS 的牌面場景；風格 prompt 不應描述「畫什麼」，只描述「怎麼畫」。

### 影像處理 / 設計工具積木

| id / 名稱 | 狀態 | 入口 / 檔案 | 外部依賴 | 說明 |
|---|---|---|---|---|
| `image/process` | `route/action` | `app/api/tools/image/process/route.ts` | Sharp / Ghostscript gate | web / print bake；套色彩調整，輸出 WebP/PDF 目的地 |
| `image/color-grade` | `toolkit` + `UI block` | `components/tools/ColorGradePanel`, `lib/studio/color-grade.ts` | 無 | 色彩/色階/銳利度；Tarot/Studio/Canvas 共用 |
| `image/product-image` | `toolkit` + `route/action` | `lib/studio/to-product-image.ts`, publish `action:"productimage"` | Sharp | 商品頁 web-square WebP |
| `image/print-file` | `toolkit` + `route/action` | `lib/studio/print-file.ts`, `to-print-file.ts`, `upscaler.ts`, publish `action:"upscale"` | Sharp / optional Real-ESRGAN path | POD 印刷檔 / upscale |
| `image/flatlay` | `toolkit` + `route/action` | `lib/studio/flatlay.ts`, publish `action:"flatlay"` | Sharp | 真設計圖 faithful 平拍合成 |
| `image/remove-bg` | `route/action` | `app/api/tools/studio/remove-bg/route.ts`, `lib/studio/bg-remover.ts` | Replicate/背景移除 provider | 去背 |
| `image/genfill` | `route/action` | `app/api/tools/studio/genfill/route.ts`, `lib/studio/generative-fill.ts` | Replicate FLUX Fill | 生成填色 / outpaint |
| `image/inpaint` | `route/action` | `app/api/tools/studio/inpaint/route.ts`, `lib/studio/inpaint.ts` | Replicate inpaint provider | 物件移除 / 局部重繪 |
| `designs/gallery` | `route/action` | `app/api/tools/designs/route.ts` | R2 + Supabase | My Designs 儲存、讀取、刪除；可保存 Printful mockup CDN 圖 |

### POD / Printful / WooCommerce 積木

| id / 名稱 | 狀態 | 入口 / 檔案 | 外部依賴 | 說明 |
|---|---|---|---|---|
| `pod/product-plan` | `toolkit` | `lib/studio/pod-product.ts` | 無 | Color x Size variant plan、SKU/price 規則、Woo payload 前置 |
| `pod/product-copy` | `registered` + `route/action` | `product/copy`, publish `action:"copy"` | `ANTHROPIC_API_KEY` | 商品文案 / SEO/GEO/AEO / RankMath |
| `pod/woo-create` | `route/action` | publish `action:"create"`, `wp-bridge-client.ts` | wp-bridge | 建 Woo draft variable product |
| `pod/printful-sync-status` | `route/action` | publish `action:"status"`, `print-provider.ts` | `PRINTFUL_API_KEY`, `PRINTFUL_STORE_ID` | 查 Printful plugin sync 狀態 |
| `pod/printful-link` | `route/action` | publish `action:"link"`, `print-provider.ts` | Printful + designs bucket | 綁 synced variant → catalog variant + print file |
| `pod/printful-native-create` | `route/action` | publish `action:"pfcreate"`, `print-provider.ts` | `PRINTFUL_NATIVE_STORE_ID` | Native/API store 建 Printful sync product + variant binding |
| `pod/printful-draft-order` | `route/action` | publish `action:"pforder"`, `createDraftOrderOnNative()` | Printful Native/API store | Woo order → Printful DRAFT order；不 confirm、不送印 |
| `pod/woo-webhook-reader` | `toolkit` | `lib/studio/woo-webhook.ts` | Woo webhook secret | 驗簽與解析 Woo order line items |
| `pod/printful-sync-api` | `route/action` | `app/api/tools/printful/sync/route.ts` | Printful | list/get/catalog/link sync API 入口 |
| `mockup/printful` | `route/action` | `app/api/tools/studio/mockup/route.ts`, `printful-mockup.ts` | Printful | Printful mockup generation |

### 前端 UI 積木

| id / 名稱 | 狀態 | 入口 / 檔案 | 說明 |
|---|---|---|---|
| `qr` | `UI block` | `public/vector-editor.html` | QR Code（向量） |
| `adjust` | `UI block` | `public/vector-editor.html` | 調色 / 修圖（選圖片） |
| `obj-fx` | `UI block` | `public/vector-editor.html` | 物件效果 |
| `bg-remove` | `UI block` | `public/vector-editor.html` | 去白底 / 去背 |
| `smart-guides` | `UI block` | `public/vector-editor.html` | 智慧磁吸對齊 |
| `arc-text` | `UI block` | `public/vector-editor.html` | 環形 / 弧形文字 |
| `crop-marks` | `UI block` | `public/vector-editor.html` | 出血 + 裁切標記 |
| `templates` | `UI block` | `public/vector-editor.html` | 範本庫（尺寸預設） |
| `ai-bg` | `UI block` | `public/vector-editor.html` | AI 去背（雲端） |
| `mockup` | `UI block` | `public/vector-editor.html` | 商品 Mockup 預覽 |
| `batch-export` | `UI block` | `public/vector-editor.html` | 批次多尺寸匯出 |
| `barcode` | `UI block` | `public/vector-editor.html` | 條碼 Barcode（向量） |
| `text-path` | `UI block` | `public/vector-editor.html` | 文字沿路徑 |
| `simplify` | `UI block` | `public/vector-editor.html` | 路徑簡化 |
| `canvas/shape` | `UI block` | `app/tools/canvas/CanvasEditor.tsx` | 基本形狀（rect/circle/line） |
| `canvas/object-lock` | `UI block` | `app/tools/canvas/CanvasEditor.tsx` | 鎖定/解鎖物件移動、縮放、旋轉 |
| `canvas/image-effects` | `UI block` | `app/tools/canvas/CanvasEditor.tsx` | 自然飽和/高斯模糊/雜訊/色溫（vibrance/blur/noise/temp）|
| `canvas/adjustments` | `UI block` | `app/tools/canvas/CanvasEditor.tsx` | PS 調整：對比/陰影/高光 + 自動對比/色彩/色調（pixel analysis）|
| `canvas/camera-raw` | `UI block` | `app/tools/canvas/CanvasEditor.tsx` | Camera RAW 效果：曝光/清晰度/去霧（exposure/clarity/dehaze）|
| `canvas/color-grade` | `UI block` | `app/tools/canvas/CanvasEditor.tsx` | PS 色階/調色：hue/sat/bri/black/white/gamma/sharpen/colorBalance（共用 ColorGradePanel seam）|
| `canvas/download` | `UI block` | `app/tools/canvas/CanvasEditor.tsx` | 下載 PNG（全尺寸）或 WebP（自動壓縮至 200KB）|
| `ai/image-edit-prompt-panel` | `UI block` | `components/tools/ImageEditPromptPanel.tsx` | 共用 AI 修圖 prompt 面板；Tarot / Studio / Mockup 都掛這顆，不各寫一套 |
| `tarot/output-track` | `UI block` | `app/tools/tarot/TarotStudio.tsx` | Tarot print/export outputs |
| `studio/output-track` | `UI block` | `app/tools/studio/StudioWorkbench.tsx` | Studio web/export outputs |

## 路線圖（待註冊成積木，各自一批、零改編排器）

- `image/generate` — 把現有 `generateTarotImage()` shared toolkit 包成正式 registry block（建議新增 `kind:"image"` 或獨立 image registry）。
- `image/style-design-workbench/ui-adapter` — 讓 Tarot / POD / Studio UI 直接消費已註冊 block 的 `styleAnchor`，移除各頁面自己的風格狀態重複邏輯。
- `video/pipeline` — 影片生成（圖 + TTS + ffmpeg）。
- `quality/*` — 抄襲 / 內鏈 / FAQ / Alt / A-B。
- `publish/youtube` · `publish/postiz`（社群層）。
- `pod/woo-meta` — Woo product / variation meta 寫入完整 POD 履約資料。
- `pod/fulfillment-record` — Woo order ↔ Printful draft order 對帳 ledger。
- `pod/tracking-update` — Printful tracking webhook → WooCommerce 回寫。
