# Feature Plan: Content Studio 每篇文章費用追蹤

**狀態**: 待實作  
**建立日期**: 2026-06-18  
**影響頁面**: `/tools/content`, `/ops/costs`

---

## 問題陳述

Content Studio 支援 8 個文字模型（4 Claude + 4 OpenAI）+ 15 個圖片模型，費用差距高達 60 倍（haiku $0.003 vs Fable 5 $0.10+ 每篇）。目前使用者沒有任何方式知道「這篇文章花了多少錢」，只有 `/ops/costs` 顯示全域累計。

---

## 成功定義

生成完成後，UI 顯示：
```
本次費用 $0.0241  ▼
  文字 LLM     $0.0198
    article-generate  claude-sonnet-4-6   $0.0162
    outline           claude-haiku-4-5    $0.0004
    title             claude-haiku-4-5    $0.0003
    keywords          claude-haiku-4-5    $0.0003
    fetchRealSources  perplexity/sonar    $0.0026
  圖片           $0.0043
    hero              flux-dev            $0.0250  ← 若選 flux-dev
    placeholder ×2    flux-schnell        $0.0006
```

---

## 範圍

### 納入
- 主文章生成（所有 8 個文字模型）
- outline / title / keywords（haiku 固定）
- humanize / seo-fix / syndicate（若在同一次 session 觸發）
- market-analysis（Perplexity，補 logAiCall）
- fetchRealSources（Perplexity，補 logAiCall）
- 圖片生成費用（hero + auto-replace，15 個圖片模型）

### 排除
- brand-voice（setup 一次性，非每篇成本）
- trending keyword Perplexity fallback（非主流程）
- seo-check / publish / newsletter（非 AI 費用）
- 跨頁面 session（重整後 generation_id 不保留）

---

## 現況分析

### 已有的基礎
- `ai_call_logs` 表（migration 0043，今日上線）：text LLM 精確 token + cost_usd
- `logAiCall` 函式：8 個 content routes 已接入
- `cost-model.ts`：所有 provider 費率（Anthropic/OpenAI/Perplexity/圖片）
- `imageCostUsd(model)` 函式：可從 model id 算出圖片單價

### 缺口
1. **Perplexity 未記錄**：`market-analysis/route.ts` + `generate-core.ts::fetchRealSources()` 打 Perplexity API 但無 logAiCall
2. **無 generation_id 概念**：所有 call 都是獨立 row，無法串起「同一篇文章」
3. **圖片費用未記錄**：Content Studio image route 直接呼叫 `generateTarotImage()` 後返回 URL，不寫任何費用 log
4. **ai_image_jobs 與 Content Studio 無關**：該表由 Ops Console 流程寫入，Content Studio 圖片走另一條路

---

## 技術設計

### 核心概念：generation_id

前端每次點「Generate Article」產生一個 UUID（`generationId`），隨所有 sub-call 傳遞。後端把它存進：
- `ai_call_logs.metadata.generation_id`（文字 LLM）
- 新增 `ai_image_logs` 行或直接用 `ai_call_logs` 的 image row

**最簡設計**：圖片費用也寫進 `ai_call_logs`，用 `input_tokens=0, output_tokens=0, cost_usd=<flat_rate>` 區分，加 `metadata.type="image"` 標記。這樣只需查一張表。

### 查詢
```sql
SELECT route, model, vendor, cost_usd, metadata
FROM ai_call_logs
WHERE metadata->>'generation_id' = $1
ORDER BY created_at ASC
```

---

## 任務分解

### Task 1 — DB：`ai_call_logs` 加 GIN index（S）
```sql
-- migration 0044
CREATE INDEX ai_call_logs_generation_id_idx
  ON public.ai_call_logs ((metadata->>'generation_id'))
  WHERE metadata->>'generation_id' IS NOT NULL;
```
*無 schema 變更，只加 index。不可逆性：低。*

### Task 2 — 後端：`logAiCall` 加 `generationId` 參數（S）
`lib/ai/log-ai-call.ts`：`LogAiCallArgs` 和 `LogAiCallFromResponse` 兩個 interface 加 `generationId?: string`，寫入時放進 `metadata.generation_id`。

### Task 3 — 後端：8 個 content routes 傳遞 generation_id（S）
從 request header `X-Generation-Id` 讀取，傳入 `logAiCall`：
- `title`, `keywords`, `outline`, `humanize`, `seo-fix`, `syndicate`（6 個 route 各加 2 行）
- `generate/route.ts` → 傳給 `generate-core.ts` config，core 裡 logAiCall 帶入

### Task 4 — 後端：補 Perplexity logAiCall（S）
- `market-analysis/route.ts`：Perplexity response 有 `usage.prompt_tokens` + `completion_tokens`，加 `logAiCall({ route, model: "sonar", inputTokens, outputTokens, generationId })`
- `generate-core.ts::fetchRealSources()`：同上，從 Perplexity response body 讀 usage

### Task 5 — 後端：圖片費用寫入 ai_call_logs（S）
`app/api/content/image/route.ts`：`generateTarotImage` 成功後加：
```ts
void logAiCall({
  route: "content/image",
  model: requestedModel,      // e.g. "flux-dev"
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  generationId,               // 從 X-Generation-Id header
  metadata: { type: "image", aspect, count: 1 },
  // cost_usd 由 logAiCall 內部從 imageCostUsd(model) 計算
})
```
**注意**：`logAiCall` 目前用 `textCallCostUsd` 計算，需加一個 `imageCallCostUsd` 分支，或在 metadata 直接傳入 `cost_usd_override`。

### Task 6 — 後端：新 API `GET /api/content/generation-cost`（S）
```ts
// ?id=<generationId>
// 查 ai_call_logs WHERE metadata->>'generation_id' = id
// 回傳：{ totalUsd, textUsd, imageUsd, lines: [{route, model, vendor, costUsd}] }
```
使用 service-role client（RLS deny-anon）。

### Task 7 — 前端：generation_id 管理（S）
`ContentStudio.tsx`：
```ts
const [generationId, setGenerationId] = useState<string | null>(null);
const [sessionCost, setSessionCost] = useState<GenerationCost | null>(null);

// handleGenerate() 最前面：
const gid = crypto.randomUUID();
setGenerationId(gid);
setSessionCost(null);
```
所有 `fetch(...)` 加 header：`"X-Generation-Id": gid`

### Task 8 — 前端：生成完成後 fetch 費用（S）
Generate stream 結束後（`onGenerationDone`）：
```ts
const res = await fetch(`/api/content/generation-cost?id=${generationId}`);
const cost = await res.json();
setSessionCost(cost);
```

### Task 9 — 前端：費用 UI chip（S）
在 article output 區塊右上角或 Generate 按鈕下方顯示：
```tsx
{sessionCost && (
  <CostChip
    totalUsd={sessionCost.totalUsd}
    textUsd={sessionCost.textUsd}
    imageUsd={sessionCost.imageUsd}
    lines={sessionCost.lines}
  />
)}
```
`CostChip`：預設收合顯示 `本次費用 $0.024`，點展開顯示 per-call 明細表格（route / model / vendor / $）。

---

## 實作順序

```
Task 1 (DB index)
  → Task 2 (logAiCall 擴充)
    → Task 3 (8 routes 傳 gid)      ← 可並行
    → Task 4 (Perplexity logging)   ← 可並行
    → Task 5 (圖片 logging)         ← 需先解決 imageCost 分支
  → Task 6 (API endpoint)
    → Task 7 (前端 gid 管理)
      → Task 8 (fetch cost)
        → Task 9 (UI chip)
```

全部 S 任務，預計 1 天內可完成。

---

## 風險與不可逆決策

| 項目 | 風險 | 緩解 |
|---|---|---|
| `logAiCall` interface 擴充 | 改動 8 個 call site，漏改某一個 → 那條 call 沒有 generation_id | Task 2 完成後跑 grep 確認所有 call site |
| 圖片費用寫 ai_call_logs | 混用 text log 表存圖片記錄 | `metadata.type="image"` 明確標記；`/ops/costs` 查詢已按 route 分組不受影響 |
| migration 0044 | 只加 index，純 additive，rollback = DROP INDEX | 低風險 |
| fetchRealSources 取 Perplexity usage | Perplexity streaming response 的 usage 位置需確認 | Task 4 前先讀 market-analysis/route.ts 確認 response shape |

---

## 驗收標準

1. 生成一篇文章（Claude Sonnet），費用 chip 出現，金額與 `/ops/costs` 新增的那幾筆 row 一致
2. 換 GPT-5.5 生成，費用明顯更高，vendor 顯示 OpenAI
3. 開啟 Market Analysis + 圖片生成，費用 chip 包含 Perplexity + 圖片模型兩行
4. humanize 後費用累加（同一 generationId session）
5. 重整頁面 → 費用 chip 消失（generationId 是 React state，不持久化）
