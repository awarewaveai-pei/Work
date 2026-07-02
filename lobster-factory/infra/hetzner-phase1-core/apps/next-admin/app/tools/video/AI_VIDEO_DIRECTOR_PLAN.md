# AI 影片導演 — R0 實作計畫（B）

> 設計術語 SSOT：[`CONTEXT.md`](./CONTEXT.md)　決策：[`ADR 009`](../../../../../../../agency-os/docs/architecture/decisions/009-ai-video-director-dual-engine.md)
> 狀態：待批准。批准後進 C（Phase 0 最小可跑 PoC）。

## [任務理解]

`/tools/video` 現況能出 1–10 分鐘影片，但渲染「陽春」（單圖一場 + Ken Burns + 靜態字幕 +
fade）。要在**不動現有可動系統**下，新增一條 **Director Engine**：使用者寫腳本 + 設定 N 張
不定圖（1–20+）→ AI 導演自動編排（轉場/文字動畫/逐字字幕/開場結尾/圖表/logo/背景，跨 9 大類）
→ 產出專業級 1–10 分鐘影片。根本問題是**視覺豐富度**，非長度/張數（後者 Quick 已解）。

## [現況分析]（皆附證據）

- 腳本已是場景陣列：`VideoScene[] = {id, narration~35字, image_prompt, broll_keyword, visual}`
  （`lib/content/video/video-script-core.ts:13`）；`reassignSceneVisuals()` 已支援 AI圖/Pexels 比例。
- Quick 渲染 = Python ffmpeg，1–10 分、≤20 場、多比例、Edge/OpenAI TTS、drawtext 字幕、Ken Burns、concat
  （`apps/video-service/pipeline.py`；Explore 報告 §A/§D）。**留著不動。**
- Remotion 現況：5 個**寫死圖數** composition（`PhotoHighlightsSlidesZoom.tsx:14-19` = imageUrl1/2/3），
  `Root.tsx` calculateMetadata 回**固定**時長，`server.ts:36` `MAX_FRAMES=3600`(2分)、`concurrency:1`、
  `gl:"swangle"`(軟體)；`TEMPLATE_MAP`(server.ts:40) 僅 5 模板。Phase 1 曾真渲染成功(R2 mp4 200)。
- EU 實測飽和：4 核 / available ~1.8G + swap / Virtio GPU / load ~5。**跑不動重型長片渲染。**
- 使用者 solo → Remotion 免費商用。
- 無 CONTEXT.md（本案已建）；ADR 慣例在 `agency-os/docs/architecture/decisions/`。

## [風險清單]

| # | 風險 | 緩解 |
|---|---|---|
| R1 | EU 算力不足跑長片 | Quick 留 EU；Director 短片(≤2-3分)才在 EU(4a)；長片(4b)待大機 |
| R2 | AI 編排品味 ~90-95% | human-in-the-loop：預覽 + 一鍵微調/重生/換版模 |
| R3 | AI 幻覺出不存在版模/缺 props | Timeline JSON **schema 驗證 + repair**（Centaur 護欄）|
| R4 | 4b 幀段接合邊界對齊 | 用 Remotion 既定做法(同 composition/編碼參數 + 無損 concat)；Phase 5 才做 |
| R5 | 維護 3 條路(Quick/Director/Manual) | 共用 Render Service + 版模登記表；Manual 吃同一登記表 |
| R6 | 成本(生圖 ×場景 ×格式) | 沿用既有 video-cost.ts 估算 + 預覽明細；TTS/渲染免費 |
| R7 | 渲染非即時 | 背景非同步 job + 完成通知（既有 jobId polling 擴充）|
| R8 | Remotion 授權絆線 | 文件記載：4+ 人或 SaaS 轉售才付費 |

## [方案比較]（核心已在 grill 定案，留紀錄）

- 骨幹：**A 1圖:1場(脊椎)** vs B 脫鉤 → **選 A**（零重工、旁白對齊；Grid Scene 為受控特例）。
- 渲染：方案3 切場景+ffmpeg vs **方案4 單一 composition** vs 4b 幀段平行 → **選 4（先 4a 後 4b）**
  （保留連續性/原生轉場/原生混音；長片平行）。
- 引擎：單一取代 vs **雙引擎共存** → **共存**（零風險、可回滾）。

## [建議方案]

雙引擎共存 + Director=方案4(Centaur 出 Timeline JSON → 單 composition 渲染) + 算力分流。
詳見 ADR 009。

## [實作計畫]（分階段，每階段獨立可驗可回滾）

- **Phase 0 — 資料驅動骨架**（PoC = C 的起點）
  - remotion-service 建共用 `<SceneSeries>`（吃 `scenes[]`，`<TransitionSeries>` 串，`calculateMetadata` 由陣列算時長）
  - 把 1 個現有 composition(PhotoHighlights) 重構成資料驅動（保留動畫，換骨架）
  - DoD：經 /render 真渲染 1場 / 3場 / 20場 各一支 → R2 可播（驗證 N 張不定圖）

- **Phase 1 — Director（AI → Timeline JSON）**
  - 版模登記表（5 現有 + 後續 MIT，標 role/category/vibe/props/aspect）
  - Director 提示 + Timeline JSON schema（複用 `lib/ai/` Centaur）+ 驗證/repair 層
  - DoD：給 腳本+圖 → 輸出通過 schema 的 Timeline JSON（含 hallucination 擋測）

- **Phase 2 — 渲染 Timeline（4a，短片，EU）**
  - `<Timeline>` 單 composition 吃 Timeline JSON → TransitionSeries 渲染
  - server.ts：`MAX_FRAMES` 改可配置；/render 接受 timeline
  - 在 EU 跑**短**導演片(≤2-3分)驗證豐富度（低 concurrency、避峰）
  - DoD：短導演片端到端 → R2 → 可播 + 看起來豐富

- **Phase 3 — 內容豐富層**
  - 逐字動畫字幕（TTS word timing）｜配樂 + ducking｜轉場音效｜圖表(有數據時)｜brand tokens 綁定
  - DoD：各特效在短片實渲驗證

- **Phase 4 — UI（Production Mode）**
  - ScriptForge 送去生產 = 兩顆(快速/導演)；VideoStudio 加 picker(軟停快速)；保留手選版模分頁(Q1b)
  - 預覽 + 微調迴路（重生某場 / 換版模 / 重排）
  - DoD：腳本 → 選導演 → 預覽 → 渲染 → 結果 全程跑通

- **Phase 5 — 規模（4b，長片，大機）**
  - 幀段平行渲染編排 + 無損接合；大機到位後開全 1–10 分鐘
  - DoD：10 分鐘導演片在合理時間算完

- **Phase 6 — 版模庫成長**
  - 納入 reactvideoeditor 81 / remotion-scenes 201（MIT）→ 登記表；選譯 Creatomate 簽名款；style pack 策展

## [驗證計畫]（R0 四動作，每階段適用）

1. **實測**：`.ts/.tsx` 先 `npx tsc --noEmit`；remotion-service 經真 /render 出片 → curl R2 確認 HTTP 200 + 可播（REALTEST_EVIDENCE）
2. **Review**：critic 審 Director schema/validation + Timeline composition（外部 oracle，REVIEW_DONE）
3. **抓蟲**：grep 改動 symbol 的 call sites，scope 含 lobster-factory/agency-os/scripts（BUGHUNT_DONE）
4. **WORKLOG**：每階段四動作證據 + file:line

## [rollback]

Quick Engine 全程不動 = 永遠可用。Director 為附加，feature-flag 關閉即回今日狀態。
每 Phase 獨立 git revert。Timeline 是資料：壞片重生 JSON，不動引擎。
