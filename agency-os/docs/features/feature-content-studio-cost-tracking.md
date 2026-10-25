# Feature Plan: Content Studio 每篇文章費用追蹤

**狀態**: 已實作（`CostChip.tsx`）；下文是 2026-06-18 的原計畫，未回改  
**建立日期**: 2026-06-18  
**影響頁面**: `/tools/content`, `/ops/costs`

> **2026-10-25 現況**：Perplexity 已全面退役（`6cfcba142`，操作者不再使用）。下文提到 Perplexity 的地方現在是：`fetchRealSources` → Serper（`lib/content/article/generate-core.ts:194`）；`market-analysis` → Claude（`app/api/content/market-analysis/route.ts:14`）；trending 的 Perplexity fallback 已不存在。

---

## 問題陳述

Content Studio 支援 8 個文字模型（4 Claude + 4 OpenAI）+ 15 個圖片模型，費用差距高達 60 倍（haiku $0.003 vs Fable 5 $0.10+ 每篇）。目前使用者沒有任何方式知道「這篇文章花了多少錢」，只有 `/ops/costs` 顯示全域累計。

---

## 成功定義

sub-call 完成時即時累加，generate stream 結束後顯示完整明細：
```
本次費用 $0.0241  ▼
  文字 LLM     $0.0198
    article-generate  claude-sonnet-4-6   $0.0162
    outline           claude-haiku-4-5    $0.0004
    title             claude-haiku-4-5    $0.0003
    keywords          claude-haiku-4-5    $0.0003
    fetchRealSources  perplexity/sonar    $0.0026
  圖片           $0.0043
    hero              flux-dev            $0.0250
    placeholder ×2    flux-schnell        $0.0006
```

---

## 範圍

### 納入
- 主文章生成（所有 8 個文字模型）
- outline / title / keywords（haiku 固定）
- humanize / seo-fix / syndicate（同一 session 觸發則累加）
- market-analysis（Perplexity）
- fetchRealSources（Perplexity，generate 內部自動觸發）
- 圖片生成費用（hero + auto-replace，15 個圖片模型）

### 排除
- brand-voice（setup 一次性，非每篇成本）
- trending keyword Perplexity fallback（非主流程）
- seo-check / publish / newsletter（非 AI 費用）
- 跨頁面 session（重整後費用 state 不保留，屬預期行為）

---

## 現況分析

### 已有的基礎
- `ai_call_logs` 表（migration 0043，今日上線）：text LLM 精確 token + cost_usd
- `logAiCall`：8 個 content routes 已接入，費率覆蓋所有 provider
- `cost-model.ts` / `imageCostUsd(model)`：所有 provider 費率已定義
- 非 streaming routes 都回傳 JSON response，可直接附加 `cost_usd`

### 缺口
1. **Perplexity 費用未回傳**：market-analysis / fetchRealSources 有 Perplexity usage，但未計算後回傳
2. **圖片費用未回傳**：content/image route 成功後沒有 cost_usd 在 response
3. **streaming route 費用無法從 stream body 取得**：generate / humanize 需要 stream 結束後另行處理

---

## 技術設計：混合方案（client 累加）

### 核心原則

**DB 不是 UI 的 source of truth**。response 到達時費用就確定了，client 直接累加，無 race condition、無 async log 延遲問題。DB（`logAiCall`）只做 audit 用途，UI 不依賴它查費用。

### 三類處理

**A. 非 streaming routes（title / keywords / outline / market-analysis / humanize / seo-fix / syndicate）**

response JSON 加 `_cost: { usd: number, model: string, vendor: string }`，client 收到後立即累加。

```ts
// 後端 route 最後 return 前：
const cost = textCallCostUsd({ model, inputTokens, outputTokens, ... })
return NextResponse.json({ ...existing_response, _cost: { usd: cost, model, vendor } })
```

**B. Streaming route（generate / humanize streaming）**

stream 結束後，後端已在 `logAiCall` 內計算了 cost。在 stream 的最後一個 chunk 前，追加一個 JSON cost frame：

```
data: [COST_JSON]{"usd":0.0162,"model":"claude-sonnet-4-6","vendor":"Anthropic","route":"content/article-generate"}
```

client 的 stream reader 偵測這個 sentinel prefix，解析後累加，不顯示在 article body。

**C. 圖片 route（content/image）**

response JSON 已回傳 `{ ok, imageUrl }`，加 `cost_usd: imageCostUsd(requestedModel)`：

```ts
return NextResponse.json({ ok: true, imageUrl, cost_usd: imageCostUsd(model), model })
```

client 每次 image fetch 完成後累加。

### 前端 state

```ts
interface CostLine { route: string; model: string; vendor: string; usd: number }
interface SessionCost { lines: CostLine[]; totalUsd: number; textUsd: number; imageUsd: number }

const [sessionCost, setSessionCost] = useState<SessionCost | null>(null)

function addCostLine(line: CostLine) {
  setSessionCost(prev => {
    const lines = [...(prev?.lines ?? []), line]
    const textUsd = lines.filter(l => l.vendor !== "Image").reduce((s, l) => s + l.usd, 0)
    const imageUsd = lines.filter(l => l.vendor === "Image").reduce((s, l) => s + l.usd, 0)
    return { lines, totalUsd: textUsd + imageUsd, textUsd, imageUsd }
  })
}
```

每次 Generate 點擊時 `setSessionCost(null)` 重置。

---

## 任務分解

### Task 1 — 後端：非 streaming routes 加 `_cost`（S）
改動 7 個 route：`title`, `keywords`, `outline`, `market-analysis`, `seo-fix`, `syndicate`，以及非 streaming 的 `humanize`（已有 streaming 版，確認走哪條）。
每個 route 在 return 前計算 `textCallCostUsd` 並附加 `_cost` 欄位。

**market-analysis 額外**：Perplexity response body 有 `usage.prompt_tokens` + `completion_tokens`，讀出後傳入 `textCallCostUsd({ model: "sonar", ... })`。目前該 route 完全沒有 cost 計算，需補上。

### Task 2 — 後端：generate / humanize streaming 加 cost frame（S）
`generate-core.ts`：stream 結束、`logAiCall` 計算完 cost 後，在 generator 最後 yield 一個 cost sentinel：
```ts
yield `[COST_JSON]${JSON.stringify({ usd: costUsd, model, vendor, route })}`
```
`humanize/route.ts` 同理（streaming 路徑）。

**fetchRealSources Perplexity**：在 generate-core 內，`fetchRealSources` 完成後將其 cost 也附加進最終的 cost frame（合計到 generate 那行，或拆成獨立行）。

### Task 3 — 後端：圖片 route 加 `cost_usd`（S）
`app/api/content/image/route.ts`：成功 return 前加：
```ts
cost_usd: imageCostUsd(effectiveModel)
```
不需改 `logAiCall`，不需改 DB。

### Task 4 — 前端：client 累加邏輯（S）
`ContentStudio.tsx`：
- 每次 Generate 點擊 → `setSessionCost(null)`
- 所有 non-streaming fetch（title / keywords / outline / market-analysis / seo-fix / syndicate）→ `response._cost` 存在時 `addCostLine(...)`
- Stream reader 偵測 `[COST_JSON]` prefix → parse + `addCostLine(...)`
- Image fetch 成功 → `response.cost_usd` 存在時 `addCostLine({ route: "content/image", model, vendor: "Image", usd: cost_usd })`

### Task 5 — 前端：CostChip 元件（S）
新建 `components/content/CostChip.tsx`：
- 預設收合：`本次費用 $0.0241`（小字 chip，灰底，放在 Generate 按鈕下方或 article 輸出區右上）
- 展開：per-call 明細表（route / model / vendor / $USD）
- 文字 / 圖片分群顯示
- sessionCost 為 null 時不顯示（Generate 前、頁面重整後）

---

## 實作順序

```
Task 1 (非 streaming routes 加 _cost)  ← 可並行
Task 2 (streaming cost frame)           ← 可並行
Task 3 (圖片 route 加 cost_usd)        ← 可並行
  → Task 4 (前端 client 累加)
    → Task 5 (CostChip UI)
```

Task 1–3 無相依，可同時進行。Task 4 需 1–3 完成後整合，Task 5 需 Task 4 的 state shape 確定。

全部 S 任務，預計半天。

---

## 不需要的東西（vs 舊方案）

| 舊方案 B | 混合方案 | 原因 |
|---|---|---|
| migration 0044（GIN index）| ❌ 不需要 | UI 不查 DB |
| `logAiCall` 擴充 generationId | ❌ 不需要（audit 可選加） | UI 不依賴它 |
| 改 8 個 route 讀 X-Generation-Id header | ❌ 不需要 | |
| 新 API `GET /api/content/generation-cost` | ❌ 不需要 | client 已有資料 |
| 圖片費用塞進 ai_call_logs | ❌ 不需要 | 不污染 text log 統計 |

---

## 風險

| 項目 | 風險 | 緩解 |
|---|---|---|
| stream sentinel 被 markdown 渲染 | `[COST_JSON]` prefix 若顯示給使用者 | stream reader 在 display 前先過濾掉這行 |
| market-analysis Perplexity usage shape | response body 結構需確認 | Task 1 前先 console.log 一次確認 |
| humanize 走 streaming 還是 non-streaming | 兩條路需分開處理 | 讀 humanize/route.ts 確認 |
| 多張圖片並行 fetch | 每張完成時各自累加 | addCostLine 用 functional update，無 race |

---

## 驗收標準

1. Generate 點擊後，outline / title / keywords 完成時費用 chip 即時出現並累加
2. Generate stream 結束後，文字費用更新為完整金額（含 fetchRealSources Perplexity）
3. 圖片生成完成後，圖片費用累加進 chip
4. 換 GPT-5.5：費用明顯更高，vendor 顯示 OpenAI
5. 換 flux-kontext-pro 圖片：圖片費用從 $0.003 → $0.10
6. humanize → 費用繼續累加到同一個 chip
7. 重整頁面 → chip 消失（預期行為）
