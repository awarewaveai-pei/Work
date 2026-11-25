# 影片工具三項解鎖（肖像權保護／去配樂・重配音效／深度影片）

來源：操作者 2026-11-25「接起來」。App＝`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench`（以下路徑皆相對它）。

## 1. 現況（2026-11-25 讀碼）
- 三個工具的送出鈕被同一段鎖住：`scripts/tools-0.js:443-458`（`unsupported` 表 → 停用 `[data-act=submit]`）。
- 工具送出＝`scripts/tool-processing.js:73` `generations.create({ operation: tool, settings, references })`。
- 後端分派：`backend/media.cjs:6` `supported` 清單＋`:70-73` 分派；不在清單 → `backend/api.cjs:500-504`「尚未接入」。
- privacy：後端零程式。畫面 `scripts/tools-workflows.js:113-117`。
- sfx：後端已有 `backend/audio-tools.cjs`（ElevenLabs 去配樂＋依文字生成音效，`:20-24`「不看畫面」）；付費列被拒（`:31` `available` 需 price 0、`:47`「付費計費尚未接上」）。缺：計費、看畫面、解鎖。
- depth：後端零程式。畫面 `scripts/tools-workflows.js:118-124`（裁切最多 30 秒）。
- 既有範本：本機 FFmpeg 工具 `backend/follow.cjs`；Replicate 付費工具 `backend/video-enhance.cjs`＋`backend/replicate-run.cjs`；多廠商列 `backend/audio-tools.cjs`＋`backend/providers.cjs`；sha256 釘選下載 `scripts/vendor-vision.cjs`。
- 正式機無 GPU（`Dockerfile:6` Mesa llvmpipe）。

## 2. 不變量
- N1 原片不動；輸出＝新素材，帶來源素材關聯（照既有媒體工具）。
- N2 不能跑就不能按：畫面鎖只由 `/capabilities` 決定，不留寫死的 `unsupported` 項。
- N3 會花錢的列，沒有計費就不可用（`audio-tools.cjs:4-5` 既有規則）；成功才扣。
- N4 不用中國公司的模型（操作者長期規則）；模型檔 sha256 釘選；授權可商用且可隨買斷交付。
- N5 聲音／畫面是否離開主機，照 `backend/audio-policy.cjs` 既有規則，不另寫一套。

## 3. 決定
- D1 privacy＝主機本機跑、免費。偵測 YuNet（OpenCV Zoo，MIT）經 `onnxruntime-node`；效果由 FFmpeg 原生濾鏡做（Node 只產生灰階遮罩串流）。理由：畫格不離開主機、無按次成本、買斷可帶走。
- D2 depth＝主機本機 MiDaS v2.1 small 官方 ONNX（Intel，MIT）＋跨格尺度對齊去閃。理由（`RESEARCH.md` §A）：真「影片深度」模型不是中國公司的就是要 GPU 且無現成 API；正式機無 GPU。代價：逐格模型，畫質與穩定度低於影片模型。
- D3 sfx：操作者 2026-11-25「全要」＝A、B 兩列都做（A Mirelo SFX 2.0 預設；B Gemini 看片＋ElevenLabs，取代原本不看畫面的那一列）。付費功能鍵 `video.audio-tools`，`separate`、`sfx` 的付費列共用。
- D4 sfx 在定案並接上計費前不得解鎖：ElevenLabs 免費方案不可商用（`RESEARCH.md` F1、F2）。

## 4. 卡
| 卡 | 內容 | 依賴 | 風險 | 模型 |
|---|---|---|---|---|
| P1 | 肖像權保護：後端＋畫面＋測試（`briefs/P1-privacy.md`） | — | Medium | Opus 5.5 |
| R1 | sfx／depth 選型查證（`briefs/R1-research.md`） | — | Low | Sonnet 5.5 |
| D1 | 深度影片 | R1、P1（共用 onnxruntime 時） | 待定 | 待定 |
| S1 | sfx：計費鍵＋看畫面＋解鎖 | R1 | High（計費） | Opus 5.5 |
| X1 | 刪 `tools-0.js` `unsupported` 寫死項，改讀 `/capabilities`（N2） | P1、D1、S1 | Low | 監工 |
| DEP | 部署 video-workbench（＋S1 若動 next-admin） | 全部＋RISKS 清空 | High，等操作者 go | 監工 |
