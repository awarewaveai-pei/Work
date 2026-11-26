# R1 選型查證（只讀；唯一輸出＝`../RESEARCH.md`）

先讀 `COMMON.md`、`../PLAN.md`。不改任何程式。可用 WebSearch／WebFetch／Replicate 的模型查詢工具。

## 要回答的兩題
A. **深度影片**：影片（≤30 秒）→ 黑白深度影片，給動作控制用，畫格之間不能閃。
B. **依畫面配音效**：影片 →（去掉配樂、留對白後）依畫面內容配上音效。現有路徑＝ElevenLabs 人聲分離＋文字生成音效（`backend/audio-tools.cjs:20-24`），不看畫面。

## 每個候選必填（查不到寫「查不到」，不猜）
| 欄 | 內容 |
|---|---|
| 名稱／出處 | 模型名、開發單位與國家（中國公司或中國機構主導的一律列出但標「排除」） |
| 授權 | 程式授權與**權重**授權各一欄；可否商用；附授權頁網址 |
| 怎麼跑 | Replicate 模型代號（附頁面網址）或官方 API；或可轉 ONNX 在 CPU 跑 |
| 價格 | 每秒影片或每次的美元價，附來源網址與查詢日期 |
| 限制 | 最長秒數、解析度、輸入大小上限 |
| 時間一致性 | 是影片模型還是逐格模型 |

## 至少查這些方向
- A：Intel MiDaS／DPT（逐格，MIT）、ETH RollingDepth、Marigold、Apple Depth Pro；Replicate 上現有的 video depth 模型逐一查出處。
- B：ElevenLabs 有無「看影片」的音效 API；MMAudio（權重授權要查清楚）；Replicate 上 video-to-audio 模型逐一查出處；「Gemini 看影片寫出帶時間的音效描述 → ElevenLabs 生成」這條路（repo 已有 `backend/gemini-video.cjs`、`backend/elevenlabs.cjs`，讀它們說明現成能力）。
- 另查：`backend/audio-tools.cjs:47` 說「付費計費尚未接上」——讀 `backend/provider-cost.cjs`、`backend/video-enhance.cjs`、`backend/api.cjs` 的 settle 流程，列出替 sfx 加一個付費功能鍵要改哪些檔（`file:line`），含 next-admin 那邊的 `cost-model.ts`。

## 輸出格式
`RESEARCH.md` ≤120 行：A 表、B 表、計費改動清單、每題一句「事實上可行的前兩名」。不寫建議散文；決定由監工做。
