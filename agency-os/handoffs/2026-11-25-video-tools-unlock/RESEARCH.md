# R1 選型查證結果（查詢日 2026-11-25；價格＝美元原價）

路徑縮寫：`VW/`＝`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`，`NA/`＝同層 `next-admin/`。
「排除」＝中國公司／機構主導，或授權不可商用。未執行任何付費模型、未下載模型檔；CPU 速度、畫質、穩定度全部**未實測**。

## 0. 動工前必看

- F1 現有 sfx 在 ElevenLabs **免費方案**下價格算 0、列為可用（`VW/backend/audio-tools.cjs:31`、`provider-cost.cjs:83`），目前只被畫面鎖擋住（`VW/scripts/tools-0.js:443-446`）。X1 解鎖即可跑。
- F2 ElevenLabs 免費方案**不可商用**且需署名（[Terms of Use](https://elevenlabs.io/terms-of-use)、[billing](https://elevenlabs.io/docs/overview/administration/billing)）。
- F3 `soundEffect` 沒帶 `model_id`（`VW/backend/elevenlabs.cjs:80`）；官方：預設的 `eleven_text_to_sound_v2` **2027-03-01 移除**，改 `eleven_text_to_sound_v3`（[docs](https://elevenlabs.io/docs/overview/capabilities/sound-effects)）。官方時長 0.1–30 秒，程式寫 22（`elevenlabs.cjs:77`）。
- F4 `VW/backend/gemini-video.cjs` 只**生成**影片，不能看影片。看影片需新寫；可仿 `transcribe.cjs:199-209`（Interactions API 送 inline base64 音訊）。

## A. 深度影片（≤30 秒）

| 名稱／出處 | 程式授權 | 權重授權／可商用 | 怎麼跑 | 價格 | 限制 | 時間一致性 | 判定 |
|---|---|---|---|---|---|---|---|
| MiDaS 2.1 small／3.x DPT，Intel（美） | [MIT](https://github.com/isl-org/MiDaS/blob/master/LICENSE)；repo 已封存 | MIT repo release；HF [Intel/dpt-large](https://huggingface.co/Intel/dpt-large) 標 Apache-2.0／可。訓練資料授權：未查 | 官方 [release](https://github.com/isl-org/MiDaS/releases) `model-small.onnx` 66MB（v2.1）；第三方 ONNX [hybrid](https://huggingface.co/Xenova/dpt-hybrid-midas) 123–533MB、[large](https://huggingface.co/Xenova/dpt-large) 239MB–1.4GB | 本機 0 | 秒數自定；small 輸入 256px；CPU 速度查不到 | **逐格**，會閃，需自做平滑 | 可用 |
| 同上（Replicate `cjwbw/midas`） | MIT | 同上 | [頁面](https://replicate.com/cjwbw/midas)；輸入只收**單張圖** | T4 $0.000225/s，約 $0.00022/張（30s×30fps＝900 張 ≈ $0.2，推算） | 上限查不到 | 逐格 | 可用但要逐格呼叫 |
| RollingDepth，ETH Zurich＋CMU（瑞／美） | [Apache-2.0](https://github.com/prs-eth/RollingDepth) | [OpenRAIL++-M](https://huggingface.co/prs-eth/rollingdepth-v1-0/blob/main/LICENSE-MODEL.txt)／**可商用**，附使用限制；散布（含買斷）須附授權並把限制寫進對客條款。含 Stable Diffusion 2 元件 | 官方推論程式，GPU；Replicate 代號查不到；ONNX 查不到 | 查不到（自租 GPU） | 處理解析度預設最大 768／1024 | **影片**（跨格片段對齊） | 可用，無現成 API |
| Marigold depth，ETH（瑞） | Apache-2.0 | v1-1 [openrail++](https://huggingface.co/prs-eth/marigold-depth-v1-1)；lcm-v1-0 Apache-2.0／可 | Replicate [`adirik/marigold`](https://replicate.com/adirik/marigold)（第三方）；ONNX 查不到 | L40S 約 $0.078/次（單張） | 上限查不到 | 逐格 | 900 格約 $70，不實際 |
| FlashDepth，Netflix Eyeline（美） | [Apache-2.0](https://github.com/Eyeline-Research/FlashDepth/blob/main/LICENSE) | HF [Eyeline-Labs/FlashDepth](https://huggingface.co/Eyeline-Labs/FlashDepth) 標 Apache-2.0；但**建在 Depth Anything V2（字節）權重上**，DAv2-L 為 CC-BY-NC | GPU（Mamba）；Replicate 查不到 | 查不到 | 查不到 | 影片（串流） | 排除（上游中國公司） |
| Depth Pro，Apple（美） | [Apple sample license](https://github.com/apple/ml-depth-pro/blob/main/LICENSE) | HF [LICENSE](https://huggingface.co/apple/DepthPro/blob/main/LICENSE)：**僅研究、不可商用**（GitHub README 指向另一份，兩處衝突） | [ONNX 社群版](https://huggingface.co/onnx-community/DepthPro-ONNX) | 本機 0 | 上限查不到 | 逐格 | 排除（授權） |
| Video Depth Anything／Depth Anything V2，字節（中） | Apache-2.0 | [Small Apache-2.0；Base/Large CC-BY-NC](https://github.com/DepthAnything/Video-Depth-Anything#license) | 官方 repo | 本機 0 | 查不到 | 影片／逐格 | **排除** |
| DepthCrafter，騰訊（中） | [僅學術研究](https://github.com/Tencent/DepthCrafter/blob/main/LICENSE) | 同左／不可 | 官方 repo | 查不到 | 查不到 | 影片 | **排除** |
| Replicate [`lucataco/depth-anything-video`](https://replicate.com/lucataco/depth-anything-video) | 查不到 | 底層 Depth Anything（字節／港大） | Replicate | T4 約 $0.045/次 | 查不到 | 逐格 | **排除** |
| Replicate [`chenxwh/depth-any-video`](https://replicate.com/chenxwh/depth-any-video)（上海 AI Lab／浙大等） | [CC BY-NC 4.0](https://github.com/Nightmare-n/DepthAnyVideo/blob/main/LICENSE) | HF 標 Apache-2.0（衝突） | Replicate | A100 約 $0.14/次 | 查不到 | 影片 | **排除** |

Replicate 上非中國、可商用的「影片深度」模型：本次搜尋**查不到**（非窮舉）。

**事實上可行的前兩名**：① MiDaS/DPT ONNX 本機 CPU（MIT、免費、可買斷交付；缺點＝逐格會閃、速度未測）；② RollingDepth（真影片一致性、可商用有條件；缺點＝要 GPU，正式機沒有、無現成 API）。

## B. 依畫面配音效

| 名稱／出處 | 程式授權 | 權重授權／可商用 | 怎麼跑 | 價格 | 限制 | 時間一致性 | 判定 |
|---|---|---|---|---|---|---|---|
| Mirelo SFX 2.0，Mirelo AI GmbH（德，Tübingen） | 閉源 | 不給權重。[條款](https://mirelo.ai/terms)：付費方案／購點＝輸出可商用；服務使用權不可轉授權 | 官方 [API](https://mirelo.ai/api-docs.md) `api.mirelo.ai/v3`；[fal](https://fal.ai/models/mirelo-ai/sfx2.0/video-to-audio) `mirelo-ai/sfx2.0/video-to-audio` | $0.015/輸出秒/版本；至 12-12（fal 寫 12-13）$0.01。官方＝15 credits/s，[$1/1000 credits](https://mirelo.ai/pricing)（Creator 級） | 1–600 秒；來源檔 ≤1GiB；48kHz 單聲道；解析度查不到 | 看整支影片；>10 秒以重疊 10 秒窗生成（fal） | 可用 |
| Mirelo v1.5（Replicate） | 閉源 | 同上公司 | [`mirelo/video-to-sfx-v1.5`](https://replicate.com/mirelo/video-to-sfx-v1.5)（official） | $0.01/秒/版本（**預設 2 版本**） | **最長 10 秒**（超過截斷） | 影片 | 長度不足 |
| ElevenLabs video-to-music＋`add_sfx`（美） | 閉源 | 閉源 API；需付費訂閱（403） | [POST /v1/music/video-to-music](https://elevenlabs.io/docs/api-reference/music/video-to-music)；`separate_tracks` 回音樂／音效分軌 | 此端點價格**查不到**（一般 Music $0.15/分，不確定適用） | ≤10 支、合計 200MB、600 秒 | 看影片；本質是**配樂** | 音效軌品質未測 |
| Gemini 看影片寫帶時間描述 → ElevenLabs 生成 | 閉源 | 閉源 API；付費方案可商用 | 新寫看片呼叫（F4）＋現有 `elevenlabs.cjs` `soundEffect`，FFmpeg 依時間點混音 | Gemini 3.5 Flash-Lite 入 $0.30／出 $2.50 每百萬 token；3.6/3.8 Flash $0.75／$3.75（2027-01-01 起 $1.50／$7.50）（[pricing](https://ai.google.dev/gemini-api/docs/pricing)）；約 100 token/秒（低解析，[docs](https://ai.google.dev/gemini-api/docs/video-understanding)）→30 秒 Lite 約 $0.002（推算）。音效 $0.12/分、人聲分離 $0.12/分（[pricing](https://elevenlabs.io/pricing/api)） | inline <100MB；單段音效 ≤30 秒 | 預設**每秒取 1 格**，時間戳到秒；快動作可能漏 | 可用 |
| MMAudio，UIUC＋Sony（美／日） | [MIT](https://github.com/hkchengrex/MMAudio/blob/main/LICENSE) | [**CC-BY-NC 4.0**](https://huggingface.co/hkchengrex/MMAudio)／**不可** | Replicate [`zsxkib/mmaudio`](https://replicate.com/zsxkib/mmaudio) | L40S 約 $0.0086/次 | 查不到 | 影片 | 排除（授權） |
| ThinkSound，阿里通義（中） | Apache-2.0 | [README：僅研究、禁商用](https://github.com/FunAudioLLM/ThinkSound#-license)（HF 標 Apache，衝突） | Replicate `zsxkib/thinksound` | 約 $0.0063/次 | 查不到 | 影片 | **排除** |
| HunyuanVideo-Foley，騰訊（中） | Tencent community | [同左](https://huggingface.co/tencent/HunyuanVideo-Foley/blob/main/LICENSE)；不含歐盟／英／韓 | Replicate `tencent/hunyuanvideo-foley` | 約 $0.059/次 | 查不到 | 影片 | **排除** |

Mirelo 注意事項
- `preserve_speech` 預設開：輸出是單一混音，對白由模型**重新算繪**（[fal api](https://fal.ai/models/mirelo-ai/sfx2.0/video-to-audio/api)）。要保原聲＝`preserve_speech:false`＋`separate_speech:true`（免費回分離人聲）自己混音；可能可省掉 ElevenLabs 人聲分離。
- [條款 7.4](https://mirelo.ai/terms)：輸入輸出預設可拿去訓練；付費可退出，**組織 API key 要寫信 legal@mirelo.ai 確認**。經 fal 呼叫時是否適用：查不到。
- repo 的 `VW/backend`、`NA/lib` 查無 Mirelo／fal 客戶端。官方 API 上傳素材 24 小時可用、產出保存 7 天起。

**事實上可行的前兩名**：① Mirelo SFX 2.0（本次查到唯一真看影片、純音效、夠長、付費可商用；30 秒 1 版本 $0.45，優惠價 $0.30）；② Gemini 描述＋ElevenLabs（兩家 repo 都已有金鑰路徑、較便宜；對時精度到秒）。
現行不看畫面路徑 30 秒參考價：分離 $0.06＋音效 22 秒 $0.044＝$0.104。

## C. 替 sfx 加付費功能鍵（暫名 `video.sfx`）要改的地方

| # | `file:line` | 改什麼 |
|---|---|---|
| 1 | `NA/lib/portal/products.ts:70` | video features 加 `quota("video.sfx", …)` |
| 2 | `NA/lib/content/video/workbench-usage.ts:7-17` | `ASK` 加 `grantFor("video.sfx")`（需字面值，見 :5-6 註解） |
| 3 | `NA/lib/ai/cost-model.ts:268-273` | v3 音效／Mirelo／Gemini 看片需有價目列（ElevenLabs 音效、分離已在此；Gemini 3.5 Flash-Lite 已在 `TEXT_RATES` :86） |
| 4 | `VW/backend/main-system.cjs:35-46` | `paidFeature`：sfx 屬 `media.supported`，會在 :44-45 回 null；須在其前回 `video.sfx`（且只限付費列） |
| 5 | `VW/backend/main-system.cjs:48-55` | `ledgerKind`：sfx 目前落到 `render`；改成付費種類（比照 :53） |
| 6 | `VW/backend/audio-tools.cjs:4-5,29-32,47` | 解除「price 0 才可用」（只限 sfx；`separate` 無鍵仍須擋）；錯誤訊息；回傳 `ai.costUsd` 已有（:106） |
| 7 | `VW/backend/provider-cost.cjs:132-144` | `priceOf` 加 `sfx` kind，否則丟 unpriced |
| 8 | `VW/backend/api.cjs:1271-1272` | feature→kind／model 對照加 `video.sfx` |
| 9 | `VW/backend/api.cjs:1624-1650` | `/generations/quote` 加 sfx 分支（依來源秒數估價）；現在會落到 :1641 要 OpenAI 金鑰 |
| 10 | `VW/backend/provider-cost.cjs:156-165` | `displayPrices` 加 `video.sfx` |
| 11 | `VW/shared/paid-price.js:36` | 比照 `video.music` 取 `audioTools.sfx.engines` 該列價格 |
| 12 | `VW/scripts/tools-workflows.js:112` | 送出鈕要帶 `data-paid="video.sfx"`（現用 `btn`，`tools-0.js:275`，不帶；`wfButton` `tools-workflows.js:29-31` 有） |
| 13 | `VW/backend/audio-policy.cjs:6,31-34` | 換廠商／送畫面時外送廠商名要對（N5）；現只看 `row.vendor` |
| 14 | `VW/tests/p6-main-system.cjs:654,658`、`VW/tests/elevenlabs-free-tier.cjs:56,118` | 鍵清單、「付費方案下 sfx 不可用」斷言要改 |

- settle 流程免改：`api.cjs:232-235` 只收 `succeeded`（或有 `job.finishing`）的工作，金額取 `result.origin.costUsd`（media 路徑 `api.cjs:835`）。
- 人聲分離成功、生成失敗時：廠商已扣、客戶不扣（符合 N3，成本自吞）。
- Gemini Interactions 的 usage 欄是 `total_input_tokens`（`provider-cost.cjs:73-76`），`textUsd` 讀 `input_tokens`（:20），直接套會走上限估算。
- `cost-model.ts` 由 `VW/awarewave-files.txt:13` 帶進 workbench 映像 → next-admin 與 video-workbench 都要部署。
