---
slug: add-tarot-models
created_utc: 2026-06-10T18:36:01Z
hint: "明天增加模型 ideogram-ai/ideogram-character, ideogram-v4-turbo, ideogram-v3-balanced, ideogram-v2a-turbo(design), ideogram-v4-quality, bytedance/seedream-4.5, google/nano-banana-2, google/imagen-4, black-forest-labs/flux-2-max"
source_session_summary: "Tarot Studio session: rewrote 103 style prompts, added flux quality params + guidance + painter-name injection; operator now wants more image models added to the model picker."
---

# Tarot Studio — 增加 9 個圖像模型到模型選單

## 1. 任務目標
把 9 個新 Replicate 模型加進 Tarot Studio 模型選單，操作者可選用生圖。

## 2. 為什麼做
擴充風格/品質選項（操作者點名清單）；不同模型對人物風格化/中文/速度各有強項。

## 3. 已試過
本 session 已建立模型框架：`TAROT_MODELS`（image-gen.ts）+ `MODEL_OPTIONS`（TarotStudio.tsx）+ flux/openai 兩 provider 路徑。新模型沿用這套擴充，**勿重寫框架**。

## 4. 卡在哪
尚未開始。**核心難點**：9 個模型各有不同 Replicate input schema，不能共用 flux 的 `go_fast/megapixels/guidance/num_inference_steps`（送了會 422）。每個要先查 schema。

## 5. 下一步指令
1. **查每個模型的 input schema**（逐一）：`https://replicate.com/<owner>/<model>/api/schema` 或 `GET https://api.replicate.com/v1/models/<owner>/<model>`（用 `REPLICATE_API_TOKEN`，已在 SG container env）。清單：
   - `ideogram-ai/ideogram-character`（**需角色參考圖** → img2img 類，走 referenceImages）
   - `ideogram-ai/ideogram-v4-turbo` / `ideogram-v3-balanced` / `ideogram-v2a-turbo` / `ideogram-v4-quality`
   - `bytedance/seedream-4.5` / `google/nano-banana-2` / `google/imagen-4` / `black-forest-labs/flux-2-max`
2. **重構 image-gen.ts provider**：把 `provider: "flux"` 泛化為 per-model input builder。建議在 `ModelConfig` 加 `buildInput?(prompt, seed, opts) => Record<string,unknown>`，flux/各家各自的 builder；保留 flux 既有 builder（go_fast=false/guidance 等）不動。generic Replicate 路徑共用 `POST /v1/models/${slug}/predictions` + `Prefer: wait` + 輪詢 + `urlToDataUrl`（output 多為 `[url]`，已支援 replicate.delivery allowlist）。
3. **TAROT_MODELS（image-gen.ts:26）** 每個加一筆（slug + provider + maxRefs + 對應 buildInput）。
4. **MODEL_OPTIONS（TarotStudio.tsx:43）** 每個加 UI 列：`{ value, label: "<名稱> · ~NT$X/張（整套約 NT$Y）", costNt, maxRefs }`，cost 依各模型 Replicate 定價查實價填。
5. **驗證**：`npx tsc --noEmit`(next-admin) → `/verify-recent` → `/check-drift` → `/sg-deploy next-admin` → 每個新模型在 app 真生一張確認不 422、output 正常顯示。
6. R0 四動作 + WORKLOG；改 `image-gen.ts`/`TarotStudio.tsx` 屬 code 改動，走 verify-gate。

## 6. 相關資源
- **Files**：
  - `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts`（`TAROT_MODELS`:26 / `generateFlux`:86 / `generateTarotImage`:207 / `urlToDataUrl`+SSRF allowlist:64-83）
  - `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/tarot/TarotStudio.tsx`（`MODEL_OPTIONS`:43 / `modelOption`:51）
  - 輸出渲染：`$WORK_ROOT/.../app/tools/tarot/cards.ts`（buildCardPrompt）— prompt 組裝不變，模型只換生圖端
- **Known landmines**：
  - **各模型 input schema 不同** → 絕不可把 flux 的 `go_fast/megapixels/guidance/num_inference_steps` 套到 ideogram/imagen/seedream（→ 422）。逐一查 schema。
  - `aspect_ratio` enum 各家格式不同（flux "2:3"、ideogram 可能 "9:16"/"3:4"、imagen 另一套）— 用各模型 schema 允許值。
  - `ideogram-character` 需角色參考圖（不是純 text2img）；UI maxRefs 要設對。
  - `output` 解析：多為 `string[]`（取 [0]），但個別模型可能回 `{ url }` 物件 → 解析要容錯（沿用 image-gen.ts `urlToDataUrl` + replicate.delivery allowlist，非 replicate.delivery host 會被擋）。
  - SG next-admin container 已有 `REPLICATE_API_TOKEN`（本 session 驗過）；OpenAI 路徑不受影響。
  - 部署只 rebuild next-admin；wp-bridge 由平行 session 處理，勿碰。
