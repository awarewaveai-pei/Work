# Image-Gen Toolkit（15 模型組合包）使用說明

> SSOT：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts`
> 建立：2026-06-11（Tarot Studio 擴充）。所有 schema 均經 live Replicate API + 真實生成驗證（6/6 schema 家族 succeeded）。
> 共用層已存在（2026-06-11 P2b）：`lib/studio/image-provider.ts` = studio-neutral **facade**（delegation seam，零邏輯重複）。引擎本體仍在上方 SSOT 路徑；Studio/POD 呼叫端一律走 facade，引擎未來搬家只改 facade 一檔。

## 這是什麼

統一介面呼叫 15 個圖片生成模型（Replicate 13 + OpenAI 2），呼叫端只給 4 個欄位，
per-model `buildInput()` 自動轉成各模型專屬 API payload（避免 422）。

## 怎麼接（next-admin 內任何頁面/route）

```ts
import { generateTarotImage, TAROT_MODELS, isTarotModel, isAspectRatio,
         type TarotModel, type AspectRatio } from "../../lib/tarot/image-gen";

const result = await generateTarotImage({
  model: "nano-banana-2",          // TarotModel union（15 個）
  prompt: "english prompt here",   // 英文最準
  aspectRatio: "4:5",              // "2:3" | "3:2" | "4:5" | "1:1" | "9:16"
  seed: 42,                        // 可選；無 seed 的模型自動忽略
  referenceImages: [dataUrl],      // 可選；data URL 陣列
}, grant);                         // 呼叫端自己產品的 grant：withFeature 的 handler 參數，或 await grantFor("studio.image")
// result: { ok: true, image: "data:image/png;base64,...", seed } | { ok: false, error }
```

不在 next-admin 的服務（Trigger.dev / n8n）：呼叫 next-admin 的路由；`image-gen.ts` 依賴 `lib/ai/gateway`
（`providerUrl(grant, …)`）與 grant，不能單獨複製。環境需求：`REPLICATE_API_TOKEN` + `OPENAI_API_KEY`。

## 模型總表（2026-06-11 live schema 驗證）

| 模型 key | Replicate slug | seed | 參考圖 | 比例支援 | ~NT$/張 |
|---|---|---|---|---|---|
| flux-schnell | black-forest-labs/flux-schnell | ✅ | 0 | 全部原生 | 0.1 |
| flux-dev | black-forest-labs/flux-dev | ✅ | 1 | 全部原生 | 1 |
| flux-2-max | black-forest-labs/flux-2-max | ✅ | 0 | 全部原生 | 2.3 |
| ideogram-v2a-turbo | ideogram-ai/ideogram-v2a-turbo | ✅ | 0 | 4:5→3:4 映射 | 1 |
| ideogram-v3-balanced | ideogram-ai/ideogram-v3-balanced | ✅ | 0 | 全部原生 | 2 |
| ideogram-v4-turbo | ideogram-ai/ideogram-v4-turbo | ❌ | 0 | resolution 表映射 | 1 |
| ideogram-v4-quality | ideogram-ai/ideogram-v4-quality | ❌ | 0 | resolution 表映射 | 3 |
| ideogram-character | ideogram-ai/ideogram-character | ✅ | **1 必填** | 全部原生 | 5 |
| seedream-4.5 | bytedance/seedream-4.5 | ❌ | 0 | 全部原生（含 4:5）| 1.3 |
| nano-banana-2 | google/nano-banana-2 | ❌ | 14 | 全部原生 | 2.2 |
| nano-banana-pro | google/nano-banana-pro | ❌ | 8 | 全部原生 | 4.4 |
| imagen-4 | google/imagen-4 | ❌ | 0 | 3:2/4:5/2:3→最近比例 | 1.3 |
| openai-low/medium/high | （OpenAI gpt-image-1）| ❌ | 5 | 3 種 size 映射 | 0.5–5.5 |

## 重要坑（live schema 實測發現，web 資料不可信）

1. **seed 只有 FLUX 系 + ideogram v2a/v3/character 有** — v4/seedream/nano-banana/imagen-4 送 seed 會 422。
   風格一致性在無 seed 模型上靠 prompt + reference image。
2. **ideogram-character**：`character_reference_image` 是**單數 string 且必填**（無 ref → buildInput throw `character_reference_required`）。
3. **ideogram v4**：無 `aspect_ratio`，只吃 `resolution`（WxH enum）；無 seed。
4. **ideogram v2a**：aspect_ratio enum 無 4:5（真機 422 證實）→ buildInput 自動映射 3:4。
5. **flux-2-max**：`prompt_upsampling` 不存在（web 文件錯誤，送了會 422）；用原生 `aspect_ratio` + `resolution: "1 MP"`。
6. **imagen-4**：參數叫 `image_size`（1K/2K）不是 resolution；只有 5 種比例。
7. **連發 429**：Replicate 對連續 create 限流，多模型並行或批次間隔 10–15s（429 退避重試已在 UI 端 Promise.all 自然分散）。
8. **enum 大小寫**：ideogram optional enum 是 `Auto`/`Default`（不是 `AUTO`/`BALANCED`），不確定就省略用預設。

## 加新模型 SOP

1. 查 live schema：`GET https://api.replicate.com/v1/models/{owner}/{name}`，看 `latest_version.openapi_schema.components.schemas.Input`（enum 常在 allOf $ref，要解開）。
2. 在 `TAROT_MODELS` 加 entry：`provider: "replicate"` + `slug` + `buildInput()`。
3. `TarotModel` union 加 key；`TarotStudio.tsx` 的 `MODEL_OPTIONS` 加 UI 項。
4. **真機驗證**：用 buildInput 的確切 payload 打一張真實生成（不可只信 web 文件 — 本次 10 模型有 8 處 web 資料與真機不符）。

## 呼叫端現況

- Tarot Studio：`app/tools/tarot/TarotStudio.tsx`（chip 多選 + 多模型並行比較）
- API route：`app/api/tools/tarot/generate/route.ts`（驗證 model/aspectRatio/refs/seed）
- POD Studio（規劃中）：見 `POD_STUDIO_ROADMAP.md` §P2a — 計畫抽成 `ImageProvider` 介面
