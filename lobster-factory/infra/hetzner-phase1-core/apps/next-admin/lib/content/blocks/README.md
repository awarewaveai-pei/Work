# 🧩 積木契約（Block Convention）— 前後端共用 SSOT

讓內容引擎的每個能力（搜尋源 / 生成 / 發佈…）變成**可抽換、可移植、可增刪**的積木。
每個積木**自我註冊**、**只透過 `ctx` 溝通**、**整段可複製**、**刪掉那段即關閉**，不影響其他。

> 本檔是契約正本。前端 canvas 積木實作見 [`public/vector-editor.html`](../../../public/vector-editor.html)（`AB.registerBlock`）；
> 後端積木骨架見同目錄 [`registry.ts`](./registry.ts)，搜尋積木家族見 [`../trending-sources.ts`](../trending-sources.ts)。

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
  kind:  "search",               // search | article | video | quality | publish | product
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

## 現有積木（manifest）

| id | kind | 地區 | 外部依賴 |
|----|------|------|----------|
| `search/google-news` | search | * | 無（RSS） |
| `search/reddit` | search | * | 無（Atom RSS，需描述性 UA） |
| `search/ptt` | search | TW | 無（HTML scrape） |
| `search/perplexity` | search | * | `PERPLEXITY_API_KEY` |
| `search/<env feed>` | search | 依設定 | `CONTENT_TRENDING_FEEDS` |
| `publish/wordpress` | publish | * | wp-bridge（`WPBRIDGE_*`） |
| `product/copy` | product | * | `ANTHROPIC_API_KEY`（包 `lib/studio/product-copy.ts`；商品 SEO/GEO/AEO/RankMath 文案） |
| `article/generate` | article | * | `ANTHROPIC_API_KEY`（包 route 的生成 core `lib/content/article/generate-core.ts`；長文 SEO/GEO/RankMath 部落格） |
| `quality/check` | quality | * | 無（純函式；包 route 的檢測 core `lib/content/quality/seo-check-core.ts` → `lib/seo/rankmath-checker.ts` 16 點 RankMath） |

> `product` 是商品頁分類（短文、答案膠囊式），與 `article`（長文部落格）區隔：同一套 RankMath 引擎，
> 但商品頁把長文專屬檢查（字數/內外鏈/多 H2 AEO/日期訊號）標 N/A，分數只計商品適用項（見 `product-copy.ts`）。

## 路線圖（待註冊成積木，各自一批、零改編排器）

- `video/pipeline` — 影片生成（圖 + TTS + ffmpeg）
- `quality/*` — 抄襲 / 內鏈 / FAQ / Alt / A-B
- `publish/wordpress` · `publish/youtube` · `publish/postiz`（社群層）
