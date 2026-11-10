# 影音工作台價目核對 2026-11-10（只查不改）

查詢日一律 2026-11-10。我們 = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/` 下 `lib/ai/cost-model.ts`（CM）或 `public/editor-shared/image-models.js`（IM）；工作台經 `video-workbench/backend/provider-cost.cjs:5` 與 `generation-policy.cjs:6-20` 讀 CM。
Replicate 價取自各模型頁內嵌 `billingConfig`（頁面原始碼；不是 UI 文字），URL = `https://replicate.com/<slug>`。✓ = 一致，✗ = 不一致，? = 查不到。

## 影片

| 項目 | 我們（file:line） | 官方 | 單位 | 差異 | 來源 |
|---|---|---|---|---|---|
| Runway gen4-turbo | 0.05/s CM:176 | $0.05 | 每輸出秒（Replicate）；Runway 直連 5 credit/s×$0.01 | ✓（對照實扣 5s=$0.25 ✓） | replicate.com/runwayml/gen4-turbo；docs.dev.runwayml.com/guides/pricing |
| Veo 3.1 Fast（generate_audio:false） | 0.10/s CM:177 | $0.10 無音訊／$0.15 有音訊 | 每輸出秒 | ✓ | replicate.com/google/veo-3.1-fast |
| Veo 3.1（generate_audio:false） | 0.20/s CM:178 | $0.20 無音訊／$0.40 有音訊 | 每輸出秒 | ✓ | replicate.com/google/veo-3.1 |
| Luma Ray 3.2（720p SDR 5s） | 0.06/s×5=0.30 CM:180 | $0.30（540p .15／1080p 1.20／HDR 720p .60） | 每支（解析度×動態範圍×秒數） | ✓ 僅 720p SDR 5s；工作台只開 5s（video-motion-models.ts:76） | replicate.com/luma/ray-3.2；docs.agents.lumalabs.ai/guides/pricing（720p 5s=100 credit，USD/credit 頁面未列） |
| Sora 2（720p） | 0.10/s CM:282 | $0.10 | 每輸出秒 | 價 ✓；**官方頁標「Shut down Sep 24, 2026」** | developers.openai.com/api/docs/models/sora-2 |
| Sora 2 Pro（720p） | 0.30/s CM:283 | $0.30（1024p .50／1080p .70） | 每輸出秒 | 價 ✓；同上標下線 | developers.openai.com/api/docs/models/sora-2-pro |

## 圖片生成／編輯（IM；Replicate 每張輸出）

| 項目 | 我們 | 官方 | 差異 | 來源 slug |
|---|---|---|---|---|
| flux-schnell | 0.003 IM:23 | $3/千張 | ✓ | black-forest-labs/flux-schnell |
| flux-dev | 0.025 IM:24 | 0.025 | ✓ | black-forest-labs/flux-dev |
| flux-kontext-dev | **0.045** IM:25 | **0.025** | ✗ 我們高 0.020 | black-forest-labs/flux-kontext-dev |
| flux-kontext-pro | 0.04 IM:26 | 0.04 | ✓ | black-forest-labs/flux-kontext-pro |
| flux-2-max | 0.07 IM:27 | $0.04/run + $0.03/輸出MP（+$0.03/輸入MP） | ✓ 僅 1MP 輸出、無參考圖；有輸入圖會更貴（maxRefs 0 故不會） | black-forest-labs/flux-2-max |
| flux-2-klein-4b | 0.001 IM:30 | $1/千 輸入MP + $1/千 輸出MP | ✗ 單位不同：按 MP 計且輸入也收；1MP 輸入+1MP 輸出=0.002（我們低估最多 2×） | black-forest-labs/flux-2-klein-4b |
| flux-kontext-fast | 0.01 IM:31 | 0.01 | ✓ | prunaai/flux-kontext-fast |
| ideogram-v2a-turbo | 0.025 IM:32 | 0.025 | ✓ | ideogram-ai/ideogram-v2a-turbo |
| ideogram-v3-balanced | 0.06 IM:33 | 0.06 | ✓ | ideogram-ai/ideogram-v3-balanced |
| ideogram-v4-turbo | 0.03 IM:34 | 0.03 | ✓ | ideogram-ai/ideogram-v4-turbo |
| ideogram-v4-quality | 0.10 IM:35 | 0.10 | ✓ | ideogram-ai/ideogram-v4-quality |
| ideogram-character | 0.15 IM:36 | TURBO .10／DEFAULT .15／QUALITY .20 | ✓ 僅 DEFAULT 檔；呼叫端未釘檔位則可能偏 | ideogram-ai/ideogram-character |
| nano-banana-2 | 0.067 IM:37 | 1K .067／2K .101／4K .151 | ✓ 僅 1K；Google 直連同價 | replicate.com/google/nano-banana-2；aistudio.google.com/docs/pricing |
| nano-banana-pro | 0.15 IM:38 | 1K/2K .15／4K .30（Google 直連 $0.134／$0.24） | ✓ 僅 1K/2K（Replicate 價） | replicate.com/google/nano-banana-pro |
| imagen-4 | 0.04 IM:39 | ? | ? Replicate `google/imagen-4`、`-fast` 皆 404；Gemini 定價頁未列 | — |
| ideogram-4-5-edit-low | 0.03 IM:63 | low .03（very_low .008／medium .06／high .22） | ✓ | ideogram-ai/ideogram-4-5-precise-edit |
| ideogram-4-5-edit（細） | 0.06 IM:64 | medium .06 | ✓（若實際呼叫 high=0.22 則差；未查呼叫端） | 同上 |
| flux-fill-pro | 0.05 IM:65 | 0.05 | ✓ | black-forest-labs/flux-fill-pro |
| bria-eraser / inpaint | 0.04 IM:66、CM:196 | 0.04 | ✓ | replicate.com/bria/eraser |
| bria-expand | 0.04 IM:67 | 0.04 | ✓ | replicate.com/bria/expand-image |
| openai-low/medium/high（gpt-image-2） | 0.02/0.07/0.19 IM:40-42 | ? 官方只列 token 價，無每張價 | ? 這三個是估算；實扣按 usage（見下） | — |
| gpt-image-2 token 價 | 5／8／30 per 1M CM:275 | text in $5／image in $8／image out $30 | ✓；頁面標 Deprecated（無日期） | developers.openai.com/api/docs/models/gpt-image-2 |
| gpt-image-2.5/2.6 sunburst/flare | 同 gpt-image-2 CM:278 | 官方列同費率 | ✓ | developers.openai.com/api/docs/pricing |
| openai-25-edit／26-edit | 0.06 IM:44,46 | ? 無每張官方價（token 計） | ? 估算 | — |

## 工具、語音、3D

| 項目 | 我們 | 官方 | 單位 | 差異 | 來源 |
|---|---|---|---|---|---|
| 去背 851-labs/background-remover | **0.002** CM:194（bg-remove.cjs:5） | ~$0.00044／run（T4 約 2s，依輸入而變） | 每 GPU 秒計，頁面「約」 | ✗ 我們約 4.5×；為 estimate:true，向使用者收 0.002 | replicate.com/851-labs/background-remover |
| 升頻 real-esrgan | 0.002 CM:195 | $2／千張 = 0.002 | 每輸出張 | ✓（每 pass） | replicate.com/nightmareai/real-esrgan |
| 3D SPAR3D | 0.04 CM:198 | 4 credit，1 credit=$0.01 → 0.04 | 每次呼叫 | ✓ | docs.stability.ai/pricing |
| 3D SF3D | 0.10 CM:199 | 10 credit → 0.10 | 每次 | ✓ | docs.stability.ai/pricing |
| 3D TRELLIS | 0.038（0.0014/s）CM:200 | 約 $0.038／run；A100 80GB $0.0014/s | 每 GPU 秒（約 28s） | ✓ | replicate.com/firtoz/trellis；replicate.com/pricing |
| Whisper whisper-1 | 0.006/min CM:189 | $0.006/min；頁面標 Deprecated（無日期） | 每音訊分 | ✓ | developers.openai.com/api/docs/pricing |
| tts-1 | 15/1M 字元 CM:289 | $15/1M 字元 | 每百萬字元 | ✓ | 同上 |
| tts-1-hd | 30/1M 字元 CM:290 | $30/1M 字元 | 每百萬字元 | ✓ | 同上 |
| gpt-4o-mini-tts | **15/1M 字元** CM:288 | text in $0.6/1M token + audio out $12/1M token；無每字元價 | token 計 | ✗ 單位不同、我們的 15 無官方依據；頁面標 Deprecated | developers.openai.com/api/docs/models/gpt-4o-mini-tts |
| Printful mockup／Pexels | 0 CM:203,95-96 | 未查（免費項，非付費 API） | — | — | — |

## 文字（TEXT_RATES，工作台文字功能讀）

| 項目 | 我們 | 官方 per 1M | 差異 | 來源 |
|---|---|---|---|---|
| gpt-5.4-mini | 0.75／4.5 CM:69 | 0.75／4.50 | ✓ | developers.openai.com/api/docs/pricing |
| gpt-5.4-nano | 0.2／1.25 CM:70 | 0.20／1.25 | ✓ | 同上 |
| gpt-5.4 | 2.5／15 CM:68 | 2.50／15（≤272K；>272K 5／22.5） | ✓ ≤272K | 同上 |
| gpt-5.5 | 5／30 CM:67 | 5／30（≤272K；>272K 10／45） | ✓ ≤272K | 同上 |
| text-embedding-3-small | 0.02 CM:78 | 0.02 | ✓ | 同上 |
| claude-opus-5-5 | 4／20，cache 讀 0.05× CM:61 | 4／20，cache 讀 $0.20（=0.05×） | ✓ | platform.claude.com/docs/en/about-claude/pricing |
| claude-sonnet-5-5 | 2／10 CM:60 | 2／10 | ✓ | 同上 |
| claude-haiku-5-5 | 0.1／0.5 CM:55 | $0.10／$0.50「prompts up to 100,000 tokens」 | ✓ ≤100K；頁面暗示超過 100K 另有較高檔，未取得數字 | 同上 |
| claude-fable-5-1 | 10／50，cache 讀 0.025× CM:65 | 10／50，cache 讀 $0.25 | ✓；官方另有 Fable 5.2（我們無此列，未查價） | 同上 |
| gemini-3.5-flash-lite | 0.3／2.5 CM:81 | 0.30／2.50 | ✓ | aistudio.google.com/docs/pricing |
| gemini-flash-latest（估） | 0.75／3.75 CM:84 | ? 別名官方不列 | ? | — |
| 舊列 gpt-4o／4o-mini／4.1-mini、claude 舊版 | CM:56-58,63-64,72-76 | 未逐筆查（legacy，只用於舊紀錄） | 未查 | — |

## 不一致（4 筆）與查不到（6 筆）

不一致：
1. flux-kontext-dev：我們 0.045（IM:25），官方 0.025；向使用者多收 $0.02/張。
2. 去背 bg-remove：我們 0.002（CM:194），官方約 0.00044/run；約 4.5×（標 estimate）。
3. gpt-4o-mini-tts：我們 $15/1M 字元（CM:288），官方改 token 計（text in $0.6、audio out $12 per 1M token）；單位不同，我們數字無官方依據。
4. flux-2-klein-4b：我們 0.001/張（IM:30），官方按 MP 計且輸入也收（$0.001/MP 入＋$0.001/MP 出）；有參考圖時低估至 2×。

另需決定（價對但產品面）：Sora 2／2 Pro 官方頁標 2026-09-24 已下線，工作台仍開放（generation-policy.cjs:17）；gpt-image-2、whisper-1、tts-1 系列、gpt-4o-mini-tts 頁面標 Deprecated（未列日期）。

查不到官方價：
1. imagen-4（IM:39）：Replicate 404、Gemini 定價頁未列。
2. openai-low／medium／high 每張價（IM:40-42）：官方只列 token 價，無每張價（實扣按 usage，僅估算顯示）。
3. openai-25-edit／26-edit 每張價（IM:44,46）：同上。
4. gemini-flash-latest（CM:84）：別名官方不列。
5. Luma 每 credit 的 USD（docs.agents.lumalabs.ai 未列；Replicate 直接給 USD 故不影響我們的價）。
6. Haiku 5.5 超過 100K token 的價與 Fable 5.2 價：頁面抓取文字不完整。

附註：Replicate 其餘「依 GPU 秒」的模型（bg-remove、TRELLIS）官方價是「約」，實扣依實際執行時間；S4b.2 實扣合計約 $0.755 無法分拆各項，未用來比對。未打任何付費 API；Replicate 頁面為公開頁面 GET。
