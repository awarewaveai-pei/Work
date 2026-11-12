# 影音工作台付費廠商替代方案 2026-11-10（只查不改，待監工審）

- 現況正本：`price-audit-20261110.md`。CM = `next-admin/lib/ai/cost-model.ts`；IM = `next-admin/public/editor-shared/image-models.js`。
- 查詢日一律 2026-11-10。AA = artificialanalysis.ai。Arena = arena.ai（原 LMArena），頁面版本 2026-11-08。
- 沒有打任何付費 API。
- 標「(轉述)」的資料來自研究 agent 的 WebFetch 摘要，沒有逐字核對；其餘都是本 session 在官方頁讀到的。
- 品質證據查不到就寫「無」。排除名單見文末。

## 用量（省錢估算的基準）

prod 的 `/data/orgs/39ad4149-…/jobs.json` 只有 7 筆（2026-11-05～11-10）：
- image 4 筆（2 筆失敗）
- video 3 筆（含 2 支 engine-render 自家合成）

本機 `.data/jobs.json` 41 筆，全是測試。**真實用量 ≈ 0，所以現在換廠商，實際每月省 ≈ $0。**

下表的「每月省」一律用這組**假設月用量**：

| 項目 | 假設月用量 |
|---|---|
| 影片 | 60 支 × 8 秒 = 480 秒 |
| 圖片生成 | 300 張（其中 nano-banana-2 100 張） |
| 圖片編輯 | 100 張 |
| 配音 | 60 分鐘 |
| 字幕辨識 | 300 分鐘 |
| 去背 | 200 次 |
| 3D | 20 次 |
| 文字 | 輸入 2M + 輸出 0.5M token |

## 1. 影片生成

現況預設：`veo-3-1-fast`（`generation-policy.cjs:13`；經 Replicate；CM:179），$0.10/秒，不含音訊。

| 候選 | 單價（720p，USD/秒） | 品質證據 | 限制 | 來源 |
|---|---|---|---|---|
| 現況 Veo 3.1 Fast（經 Replicate） | 0.10 無音訊；0.15 有音訊 | Arena T2V #16，1361；AA T2V #25，956 (轉述) | Gemini API 上的 Veo 3.1 preview 已於 2026-10-22 關閉 (轉述)；Replicate 仍在賣 | replicate.com/google/veo-3.1-fast；arena.ai/leaderboard/video-arena |
| **Gemini Omni 1.2 Flash（Google 直連）** | ≈0.07，**含原生音訊**（5,792 token/秒 × $12/1M）；360p 0.023；1080p 0.104 | Arena T2V #1，1540±16（Preliminary）(轉述) | GA 付費層；付費層不拿資料改進產品（官方頁「Used to improve our products: No」）；片長 3–15 秒；走 Interactions API，**不能只換 model id**；工作台要新增 `GEMINI_API_KEY`（next-admin 已有，見 `lib/ai/cheap-json.ts`） | aistudio.google.com/docs/pricing（本 session 讀到）；aistudio.google.com/docs/omni |
| Veo 3.1 Fast（Runway 直連） | 0.10／0.15 | 同上 | 價格相同，換通道沒有好處 | docs.dev.runwayml.com/guides/pricing |
| Grok Imagine Video 1.5（xAI） | 0.08 | Arena T2V #5，1488；AA T2V 1056 (轉述) | 要新的 xAI 金鑰；資料政策查不到 | docs.x.ai/docs/models |
| FLUX 3 Video（BFL） | HD 0.15 | Arena T2V #4，1491 (轉述) | 比現況貴 | bfl.ai/pricing |
| Runway gen4-turbo（已在清單） | 0.05 | 兩個排行榜都沒有 | — | price-audit |
| 免費／自架（LTX、Mochi） | 主機跑不動 | 無 | 主機是 AMD EPYC 7351P、沒有 GPU（`lscpu`）；Replicate 上的價格查不到 | — |

**建議：換。預設改成 Omni 1.2 Flash，Veo 留作備選。**
- 理由：比現況便宜，還含音訊；Arena 排名第 1，現況第 16。
- 每月省：$14.4（無音訊 $48 → $33.6）；若需要音訊，省 $38.4（$72 → $33.6）。
- 風險：中。要新寫一個供應商模組，排名分數也還是 Preliminary。

## 2. 圖片生成

現況：
- 預設 `gpt-image-2.5-flare`（`generation-policy.cjs:14`），按 token 計價；IM:45 估 medium 每張 $0.07。
- 另有 nano-banana-2（IM:42，經 Replicate）；價目修正（WORKLOG 2026-11-10 續23 C1）後實送 2K，$0.101。

| 候選 | 單價（每張 1K） | 品質證據 | 限制 | 來源 |
|---|---|---|---|---|
| 現況 gpt-image-2.5／2.6 | token 計；AA 以 max 設定估約 $0.21 (轉述) | Arena T2I #1 是 GPT-Image-2.5 Sunburst，1429；AA #1 是 2.6 Sunburst，1259 (轉述) | gpt-image-2 於 2027-02-10 下線；2.5／2.6 未列下線日 | developers.openai.com/api/docs/deprecations |
| **Nano Banana 2.1（Google 直連）** | **1K 0.0336；2K 0.0504**；Batch 半價 | Arena T2I #7，1328；同榜 nano-banana-2 #13，1256 (轉述) | Active；付費層不拿資料訓練；要把 Replicate 改成 Google 直連 | aistudio.google.com/docs/pricing（本 session 讀到） |
| Nano Banana 2（現況，經 Replicate） | 1K 0.067；實送 2K 0.101 | 同上，#13 | Google 建議改用 2.1 (轉述) | price-audit |
| Imagen 4 | — | — | Gemini API 已於 2026-08-17 關閉 (轉述)；IM 已無此列 | aistudio.google.com/docs/deprecations |
| Muse Image（Meta） | ≈0.01（Runway 價目頁） | Arena T2I #12，1266 (轉述) | 官方價與狀態只有二手來源；要新金鑰 | docs.dev.runwayml.com/guides/pricing |
| Grok Imagine Image 2.0 | 0.04 | Arena T2I #8，1319 (轉述) | 要新金鑰 | docs.x.ai/docs/models |
| FLUX 3 Image Klein（BFL，開源權重） | 0.009 | AA 1042 (轉述) | 品質明顯較差；主機沒有 GPU，不能自架 | bfl.ai/pricing |
| OpenAI Batch | 約半價 (轉述) | 同現況 | 非同步，最長 24 小時，不適合互動按鈕 | developers.openai.com/api/docs/pricing |

**建議：**
- **預設不換。** gpt-image 排名第 1，換掉就是降級。
- **nano-banana-2 換成 Nano Banana 2.1 直連。** 同一家族，排名較高，同解析度價格只有一半。每月省 $5.1（100 張 × 2K 差價 $0.0506）。

## 3. 圖片編輯／修補

現況：
- OpenAI `images/edits`（`api.cjs:606`）
- flux-kontext-pro 0.04、flux-fill-pro 0.05、bria 0.04
- ideogram 4.5 edit 0.03–0.22

| 候選 | 單價 | 品質證據（Arena Image Edit） | 限制 | 來源 |
|---|---|---|---|---|
| 現況 GPT-Image-2.5 Sunburst／Flare | token 計 | #1，1520；#2，1484 (轉述) | — | arena.ai/leaderboard/image-edit |
| Nano Banana 2.1 | 0.0336 | #9，1427 (轉述) | 同第 2 節 | aistudio.google.com/docs/pricing |
| Muse Image | ≈0.01 | #13，1400 (轉述) | 同第 2 節 | 同上 |
| flux-kontext-pro／flux-fill-pro／bria／ideogram | 0.03–0.05 | 兩個排行榜都沒有 | — | price-audit |

**建議：再觀察。**
- 理由：比較便宜的候選，排名都低於現在的預設。FLUX、Bria 這些現有工具沒有排行可比，所以無法判斷能不能改用 2.1。
- 每月省：$0。

## 4. 配音 TTS — **OpenAI 要下線，必須換**

現況：`gpt-4o-mini-tts`（`generation-policy.cjs:14`；呼叫點 `api.cjs:540`）。
- 價格：audio out $12/1M token，每秒 20 token（CM:298），約 $0.0144/分鐘。
- **2027-01-06 關閉。** 官方建議的後繼是 `gpt-realtime-2.1-mini`，走 Realtime API，介面不同。
- tts-1、tts-1-hd 同一天關閉。

| 候選 | 單價（USD/分鐘） | 品質證據（AA Speech Arena，Provider Voice 榜） | 限制 | 來源 |
|---|---|---|---|---|
| 現況 gpt-4o-mini-tts | ≈0.0144 | 榜上顯示的 104 個模型裡沒有它；同家 TTS-1 HD 1106、TTS-1 1085 | 2027-01-06 關閉 | developers.openai.com/api/docs/deprecations；artificialanalysis.ai/text-to-speech/leaderboard |
| OpenAI 後繼 gpt-realtime-2.1-mini | audio out $20/1M token | 榜上沒有；同家 GPT-Realtime-2 是 1073 | 要改走 Realtime API；比現況貴 | developers.openai.com/api/docs/pricing |
| **Gemini 3.8 Flash-Lite TTS** | **0.009**（到 2026-12-31）；2027 起 0.018 | **1260±13（#11）** | GA；支援繁中、簡中；付費層不拿資料訓練；可用現有 `GEMINI_API_KEY` | aistudio.google.com/docs/pricing；aistudio.google.com/docs/speech-generation |
| Gemini 3.8 Flash TTS | 0.0135；2027 起 0.027 | 1283±13（#6） | 同上；支援 130 種以上語言 | 同上 |
| Simba 3.5（Speechify） | $6.58/1M 字元 | 1294±17（#5） | 要新金鑰；中文支援沒查 | AA 同頁 |
| Eleven v4 Turbo | $40/1M 字元 | 1335（#2） | 貴 | AA 同頁 |
| 自架 Kokoro 82M | AA 標 $0.65/1M 字元；自架免費 | 1062 | 比現況好不了多少；中文支援沒查 | AA 同頁 |

**建議：換成 Gemini 3.8 Flash-Lite TTS。要更好的音色就選 Flash TTS。**
- 理由：OpenAI 57 天後下線。Gemini 這兩個分數都在 1260 以上，遠高於 OpenAI TTS-1 系列的 1085–1106。
- 每月省：約 $0.3（$0.86 → $0.54）；2027 起變成 $1.08，反而多付約 $0.2。這一項的重點是接上下線缺口、提升音質，不是省錢。

## 5. 字幕辨識 STT — **OpenAI 要下線，必須換**

現況：`whisper-1`（`backend/transcribe.cjs:9`；CM:191），$0.006/分鐘。
- 工作台需要 `verbose_json` 的逐字和分段時間戳（`transcribe.cjs:34,69-71`）。
- **whisper-1 於 2027-02-26 關閉。**
- 官方後繼 `gpt-transcribe` 不給時間戳，官方原文：「timestamp_granularities[] parameter is only supported for whisper-1」。所以它接不了字幕。
- CM:148 的 whisper-1 還沒標 `retireOn`。

| 候選 | 單價（USD/分鐘） | 品質證據（AA-WER v2，越低越好） | 限制 | 來源 |
|---|---|---|---|---|
| 現況 whisper-1（Large v2） | 0.006 | 10.6%（AA 頁面資料 `wordErrorRate: 0.106`） | 2027-02-26 關閉 | artificialanalysis.ai/speech-to-text；developers.openai.com/api/docs/deprecations |
| gpt-transcribe | 0.0045 | 3.3% | **不給時間戳**，做不了字幕 | developers.openai.com/api/docs/guides/speech-to-text |
| **Gemini 3.5 Transcribe** | ≈0.005 | **2.6%** | 有逐字時間戳、能分辨說話者、自動偵測語言；可用現有 `GEMINI_API_KEY`；中文錯字率沒查（AA 以英文為主） | aistudio.google.com/docs/pricing；AA |
| ElevenLabs Scribe v2 | 0.00367 | 2.2% | 要新帳號與金鑰 | AA |
| Mistral Voxtral Mini Transcribe 3 | 0.0035 | 2.2% | 要新金鑰；有沒有時間戳沒查 | AA |
| 自架 whisper large-v3-turbo（CPU） | 免費 | 4.6%（Groq 版） | 主機沒有 GPU；在 32 執行緒 CPU 上的速度**沒實測** | AA |

**建議：換成 Gemini 3.5 Transcribe，同時在 CM:148 補上 `retireOn`。**
- 理由：OpenAI 唯一給時間戳的模型要下線。Gemini 錯字率約 whisper-1 的四分之一，更便宜，也有時間戳。
- 每月省：$0.3（$1.80 → $1.50）。

## 6. 去背

現況：851-labs/background-remover（經 Replicate，約 $0.00044/次，CM:196）。

| 候選 | 單價 | 品質證據 | 限制 |
|---|---|---|---|
| 現況 | ≈0.00044/次 | 無 | — |
| 自架 rembg／BiRefNet（CPU） | 免費 | 無 | 佔用主機 CPU；要新增一個服務；速度沒實測 |

**建議：不換。**
- 理由：每月 200 次約 $0.09。自架的維運成本比這高，也沒有品質證據。
- 每月省：$0。
- 註：目前向使用者收 $0.002，屬於 price-audit 的錯價項，不在本文件範圍。

## 7. 圖片轉 3D

現況：
- 預設 Stability SPAR3D $0.04（`image-to-3d.cjs:27`）
- 另有 SF3D 0.10、TRELLIS ≈0.038

| 候選 | 單價 | 品質證據 | 限制 |
|---|---|---|---|
| 現況 SPAR3D | 0.04 | 沒有公開排行 | — |
| 本機 SF3D（RTX 5060） | 免費 | 無；commit 5071d077e 實測 10 張，接近 SPAR3D | 只能在筆電跑。commit 6edb29ec1：重建後被 Windows Smart App Control 擋住，目前不能用 |

**建議：不換。**
- 理由：每月 20 次約 $0.8。沒有可信的品質排行；主要的非中國候選都已在清單裡。
- 每月省：$0。

## 8. 文字模型

現況：`gpt-5.4-mini`，每 1M token 輸入 $0.75、輸出 $4.50（`api.cjs:167`；CM:69）。官方沒有下線公告；deprecations 頁只列 gpt-5.4-nano 於 2027-04-01 下線。

| 候選 | 單價（每 1M，輸入／輸出） | 品質證據 | 限制 | 來源 |
|---|---|---|---|---|
| 現況 gpt-5.4-mini | 0.75／4.50 | AA Intelligence Index：Unknown（未評測） | — | artificialanalysis.ai/models/gpt-5-4-mini |
| gpt-6-luna | 0.10／0.50 | AA 評語「above average in intelligence」；max 模式要等 70 秒才出第一個字 | 同一把金鑰；和現況沒有同榜分數可比 | developers.openai.com/api/docs/pricing；artificialanalysis.ai/models/gpt-6-luna |
| gpt-5.6-luna | 0.20／1.20 | 無 | 同一把金鑰 | 同上 |
| Batch／Flex | 約半價 | 同模型 | 非同步，不適合互動 | 同上 |

**建議：再觀察。**
- 理由：gpt-6-luna 便宜 7.5 倍，但現況在 AA 上沒有分數可比。先拿工作台自己的 11 條文字路由（`main-system.cjs` 的 PAID_ROUTES）做對照測試，再決定。
- 每月省：$3.3（$3.75 → $0.45）。

## 建議換的清單

排序：有下線期限的排前面；其餘依「省得多、風險低」排。

| # | 項目 | 每月省（假設用量） | 風險 | 要動的檔 | 回退 |
|---|---|---|---|---|---|
| 1 | 配音改 Gemini 3.8 Flash-Lite TTS（**2027-01-06 前**） | ≈$0.3（重點是補上下線缺口、提升品質） | 低～中：要新增供應商呼叫；音色清單、情緒指令要重新對照 | `backend/generation-policy.cjs:14`（audio 預設）；`backend/api.cjs:538-546`（/audio/speech 呼叫）；CM:297-298（在 OPENAI_TTS_RATES 旁加 Gemini 費率）；工作台環境變數加 `GEMINI_API_KEY` | 設 `TTS_MODEL=gpt-4o-mini-tts` 走舊路徑，只能撐到 2027-01-06 |
| 2 | 字幕改 Gemini 3.5 Transcribe（**2027-02-26 前**） | $0.3 | 中：回應要轉成 `normalize()` 吃的 segments／words 格式 | `backend/transcribe.cjs:9,69-83`；CM:148（補 retireOn）；CM:190-191（TRANSCRIBE_RATES 加一列） | 保留 whisper-1 分支，用常數切換，只能撐到 2027-02-26 |
| 3 | nano-banana-2 → Nano Banana 2.1 直連 | $5.1 | 低：同一家族；計價從 Replicate 改成 Google token 計 | IM:42-43；next-admin 圖片 gateway 的 Replicate 路由（呼叫端沒查，要 grep `nano-banana-2`） | 把 IM 這一列改回 Replicate slug |
| 4 | 影片預設改 Gemini Omni 1.2 Flash | $14.4（需要音訊時 $38.4） | 中：新 API；片長 3–15 秒；排名還是 Preliminary | 新增供應商模組（比照 `backend/replicate-video.cjs`）；在 `next-admin/lib/ai/video-motion-models.ts:50` 旁加一列；在 CM:179 旁加費率；`generation-policy.cjs:13` 改 DEFAULT_VIDEO_MODEL | 設 `VIDEO_MODEL=veo-3-1-fast` |
| — | 文字 gpt-6-luna | $3.3 | 先做對照測試，不算在「換」裡 | `backend/api.cjs:167` | 設 `TEXT_MODEL=gpt-5.4-mini` |

合計（第 1～4 項，假設用量）：每月約省 $20。
- 用真實用量（目前 ≈ 0）算，實際省 ≈ $0。
- 真正要做的是第 1、2 項，因為廠商要下線。

## 第 3、4 項已換（2026-11-10）

- 影片：預設 `gemini-omni-1.2-flash`（`backend/gemini-video.cjs`，背景任務＋輪詢＋取消；`generation-policy.cjs` `videoVendor()` 依 provider 分派）；沒有 `GEMINI_API_KEY` 自動退回 Veo 3.1 Fast。實測 4 秒 9:16：35 秒出片，720×1280 h264＋AAC，usage 23,168 影片＋422 思考 token = US$0.282。
- 圖片：`nano-banana-2` 改跑 Google `gemini-nano-banana-2.1` 2K（`next-admin/lib/tarot/image-gen.ts` `generateGemini`，`store:false`）。實測回 JPEG（程式轉 PNG），1,680 圖＋257 文字＋654 思考 token = US$0.057（按鈕標 0.057）。
- 計價：Gemini 回覆的 usage 只有一條公式 `cost-model.ts` `geminiMediaUsd`（圖／影片 token、文字與思考 token 分開計）。
- 回退：影片設 `VW_VIDEO_MODEL=veo-3-1-fast`；圖片把 `image-gen.ts` `nano-banana-2` 改回 Replicate `google/nano-banana-2`（git revert 本 commit）。

## 實測結果與採用（2026-11-10，第 1、2 項已換）

樣本：Gemini 3.8 Flash-Lite TTS 生成的繁中 3 段（一般口說 40.6 秒、「嗯／呃」與停頓 32.7 秒、中英夾雜 25.4 秒），付費實測合計 < US$0.02。金鑰所在專案（AwareWave-ColdEmail）已連帳單、預付制；2026-11-10 14:30 實測回 402「prepayment credits are depleted」＝要儲值。

**字幕：預設 A（主機 whisper large-v3）。** B 不符「繁體輸出」，但照監工決定並存可選（按鈕標價與缺點）。

| | A 主機 whisper large-v3（CPU int8×8） | B Gemini 3.5 Transcribe |
|---|---|---|
| 一般口說 | 繁體，全對 | **簡體**輸出 |
| 嗯／呃 | 只留第一個「嗯」，其餘贅字沒寫出來 | 簡體；贅字全丟 |
| 中英夾雜 | 繁體，全對 | 繁體；「這次的」聽成「Test」 |
| 指定 `cmn-Hant-TW` | — | 仍是簡體（官方語言表沒有繁體普通話） |
| 逐字時間 | 有；英文被拆成片段（Work＋shop），worker 已併回 | 有（annotations） |
| 速度 | 0.65 倍即時（40.6 秒音訊 61.7 秒） | 約 10 秒／段；常回 503 忙線 |
| 費用 | 0 | ≈US$0.005／分鐘 |

- 實作：`apps/video-whisper-worker/app.py` 新增 `POST /v1/transcribe`（同步、原始音訊、回 verbose_json 形狀）；`backend/transcribe.cjs` 單一清單 `ENGINES`：host（預設）／gemini／openai，頁面從 `/capabilities` 長出按鈕；過了 registry `retireOn` 的列自動消失、指名送出回 400。
- Gemini 接頭：只回逐字（`start_index`／`end_index` 是 UTF-8 位元組位置），依標點／停頓切句；無信心分數；503 常見，接頭重試 2 次。
- 工具頁（字幕、短影音分析）改送非同步任務：主機 whisper 約 1.5 倍片長，同步請求會被 nginx 300 秒切斷。
- 兩者都不寫「嗯、呃」：ED.11 剪贅字只能靠停頓資料。

**配音：換 Gemini 3.8 Flash-Lite TTS。** 試聽三句（`D:/tmp/vw-tts-stt/tts*.wav`，用主機 whisper 回聽）：
- 多音字「銀行的行長／一行字／長大／長江」：辨識回來字全對。
- 英文夾雜「Google Chrome、Gmail、PDF、Dropbox、iPhone」：全對。
- 數字「1,234,567 元」：回聽成「1億234567」、只念 1.8 秒，疑似逐位念。**要人工試聽**；其餘數字（12.5%、11 月 20 日、3 點半、7 樓）正確。
- 實作：`backend/speech.cjs` 單一清單 `MODELS`：Gemini（預設）／OpenAI 並存可選，各標價；OpenAI 列依 registry `retireOn` 2027-01-06 自動消失。舊 OpenAI 聲線對到 Gemini。價格 `cost-model.ts` GEMINI_TTS_RATES（回覆的 token 計費；2027-01-01 起加倍）。

預設改指：`VW_TTS_MODEL`、`VW_TRANSCRIBE_ENGINE`（須是清單中未下線的列；否則用第一個已設定的列）。

## 免費配音：Edge TTS（2026-11-12 起預設，卡 TTS.2）

- 舊 app（next-admin VideoStudio.tsx）有、新工作台漏掉的「Edge 免費」四個聲音補回：繁中女聲 zh-TW-HsiaoChenNeural、繁中男聲 zh-TW-YunJheNeural、English F en-US-JennyNeural、English M en-US-GuyNeural。
- 走既有 video-service（`apps/video-service/server.py` 新增 `POST /tts`，沿用 renders 的 `pipeline._tts`、edge-tts 7.3.1），不另做第二份 Edge 實作；工作台接頭 `backend/speech.cjs` edge-tts。
- **Edge 是非官方介面，微軟可能隨時擋；失敗時自動改用 Gemini，並照 Gemini 標示與收費**（`speech.cjs` synthesize fallback；`tests/ed10-subtitles-backend.cjs` 1g）。
- 實測「這支 iPhone 16 Pro 的 Camera Control 很好用，AI 剪輯 workflow 更快」（主機 whisper 回聽）：女聲 iPhone 16 Pro／Camera Control／workflow 都對、不跳字，「AI」聽成「給 I」；男聲「AI 剪輯 workflow」聽成「該剪輯微博」（英文較弱）；英文兩聲全句對。每句 1.3–4.2 秒。

## 免費配音（自架）實測（2026-11-10，未採用）

規則：清單「免費優先」（`backend/providers.cjs`，操作者「先使用免費為主」）——有可用的免費配音就會成為預設，所以先實測。

- 試：**Kokoro-82M**（kokoro 0.9.4、misaki[zh] 0.9.4，**Apache-2.0**，hexgrad，https://huggingface.co/hexgrad/Kokoro-82M）。普通話聲線 zf_xiaoxiao、zm_yunjian。
- 速度（主機拋棄式容器，CPU 8 執行緒，無 GPU）：7 秒句 3.4–5.4 秒、11.8 秒句 4.2–4.9 秒（約 1.4–2.7 倍即時）；載入 9.5 秒。
- 回聽（主機 whisper）：
  - 多音字「行長／一行／長大／長江」：對。
  - 數字「1,234,567 元、12.5%、11 月 20 日 3 點半、7 樓」：對（比 Gemini 好）；「營收」聽成「迎收」，「B 會議室」的 B 不見。
  - **中英夾雜壞**：Google Chrome →「Wallet Show Me」、Gmail →「麥」、Dropbox →「肉博」、iPhone →「以後內」、PDF 消失（misaki 中文前處理不認英文）。
- 結論：**不採用**。工作台台詞常夾產品名與英文。若之後要用：中文句可，英文段要另走英文管線再接回，音色會換人，要另行評估。試聽檔 `D:/tmp/vw-tts-stt/kokoro/`。
- 沒試（排除理由）：XTTS-v2（Coqui CPML，禁商用）、MMS-TTS（Meta，CC-BY-NC）、CosyVoice（阿里巴巴）、F5-TTS（上海交通大學）、ChatTTS（2noise）、MeloTTS（中文聲線品質與維護狀態未確認，本次未測）。

## 已排除（中國公司或其控制的公司）

AA 和 Arena 頁面不標國籍，以下依公開常識判斷，榜上出現也一律不用：

- Alibaba：Wan、HappyHorse、Qwen-Image、Qwen-Audio TTS、Fun-Realtime-ASR
- ByteDance：Seedance、Seedream
- MiniMax：H3、Speech 2.x、T2A
- Kuaishou：Kling
- Tencent：Hunyuan
- StepFun：StepAudio、Step TTS
- Xiaomi：MiMo TTS
- Ant Group：Ming
- 其他：Skywork、PixVerse、HiDream、Vidu、Sand.ai
- 3D：VAST（Tripo）、Deemos（Rodin）

國籍沒查證、本文也沒採用：Fish Audio、HeyGen、Sapiens AI、Video Rebirth、Utopai。

## 沒查到／限制

- 查不到：Vertex 上 Veo 的官方價、Luma 每 credit 的 USD、Ideogram 直連價、Recraft、Meta Muse 官方價。
- 「資料不拿來訓練」：只有 Google 付費層有一手條款證據，其餘廠商都沒有。
- 中文品質：AA 的 TTS 榜和 STT 榜以英文為主，中文沒有公開排行。換廠商前，要用工作台的繁中樣本實測。
- 查證程度：Omni 1.2 Flash 和 Nano Banana 2.1 的價格、狀態，本 session 已在官方頁讀過；排名是研究 agent 轉述（arena.ai，2026-11-08 版）。
