# MV 模式規格 2026-11-14（只想不做；卡片待監工分派）

讀者 = AI agent。只寫事實與決定，附 `file:line`（VW = `apps/video-workbench`，NA = `apps/next-admin`；行號 = origin/main `14dc50119`）。價格 USD→NT$ 用 `TWD_RATE = 32`（`NA/public/editor-shared/image-models.js:18`）。供應商資料查詢日 2026-11-14，來源 URL 在各表；「查不到」= 官方頁沒有，不猜。

硬規則（監工 brief）：不用中國公司模型；免費為預設、付費按鈕標 NT$；不用下拉；正本在伺服器不在 localStorage；買斷交付不混 GPL。

## 0. 結論（先讀）

- 現有「專案（PJ）」一集 = 一支影片（`docs/pj-project-spine-spec-20261106.md §1`）。MV = 一集加一個 `episode.song` 欄位，不另建模式、不另建頁。
- 監工盤點寫成「缺」的六項，main 上已有兩項半：**作曲已接**（`backend/music.cjs`，Lyria 3.5／Lyria 3 Clip／Eleven Music，2026-11-13 `70c1d62d1`）；**人聲分離已接**（`backend/audio-tools.cjs` 音軌分離的 ElevenLabs「只留人聲」列，免費方案額度內 US$0）；場景＋角色已綁在鏡頭卡，只缺道具。
- 真正要新寫的只有四件：角色特徵鎖定注入（一處，`backend/character-lock.cjs`）、歌詞對時（自家 whisper words ＋ `shared/lyrics-align.js`，免費）、唱歌對嘴（Hedra Character-3，720p US$0.05／s ≈ NT$1.6／s，新金鑰）、依歌曲段落粗剪（新 `scripts/editor-mv.js`，複用 PJ.3 `edArrange` 規則）。其餘是把現有件串到 `episode.song`。
- 免費線（上傳自己的歌 → 人聲分離 → 對時 → 分鏡依段落 → 鏡頭圖／影片 → 粗剪 → 輸出）七張卡做完就能走通，不新增任何供應商；作曲、對嘴兩張付費卡在後。
- ED 線在 main 已標 13/13 完成（`feb6fa278`）；D:\Work 只是落後 main 的舊 checkout，不是 ED 未 commit 的證據（§6）。MV 新程式仍一律放新檔，共用檔只加掛載行。

## 1. 現況盤點（監工清單逐項驗證）

| 監工說 | 真實狀態 | 證據 |
|---|---|---|
| 已有 專案主軸 PJ，步驟列、AI 分鏡、角色／場景／道具 | ✓。步驟列 11 步 `STEP_NAMES`；AI 分鏡 `/director/shots` 回 `text/seconds/line`；製作聖經三類資產 `p.assets.{character,scene,prop}` 各有 `name/descr/refs/role/time/locked` | `scripts/projects-0.js:155`、`backend/api.cjs:1613-1636`、`projects-0.js:337,469` |
| 已有 角色頁多角度與風格 | ✓ 多角度 `anglesPanel`、九種 `STYLE`；存欄位 `name/description/style/references/garments/accessories/image/tags/locked` | `scripts/characters-0.js:603-618,39-49,492-508` |
| 沒有 特徵鎖定與排除項 | ✓ 正確。`locked` 只是布林（「外觀已鎖定」toast），沒有文字型不變量；專案頁「負面提示詞」只出現在說明文字，設定對話框沒有這個欄位（只有 `styleOverride/model/lockModel/videoPrompt/episodeVideoPrompt`） | `characters-0.js:524-528`、`projects-0.js:149`（文字）vs `:352`（欄位） |
| 已有 分鏡靈感 184 組（受保護） | **數字錯**：本機 `assets/storyboards-data.json` 的 `cards` 共 **172** 張（capturedAt 2026-10-29）；檔不進 git（.gitignore），六檔雜湊受 `tests/storyboards-baseline.cjs` 保護、部署閘跑 | `tests/storyboards-baseline.cjs:1-8`、`tests/gate.cjs:6`、`README.md` 搬入段 |
| 已有 鏡頭批次生成 | ✓ `data-action="batch"` → 逐鏡 `generateShot`；參考圖 = 該鏡場景 refs → 角色 refs，最多 4 張；**角色 `descr` 沒進 prompt**，一致性只靠圖 | `projects-0.js:534-578` |
| 已有 歌詞撰寫 `/tools/music/lyrics` | ✓ `text()` 走 OpenAI Responses `gpt-5.4-mini`，付費鍵 `video.script`，輸出含 `[Verse]/[Chorus]/[Bridge]` 標記 | `api.cjs:1664-1668,344-366,238`、`backend/main-system.cjs:24` |
| 已有 音樂生成工具 | ✓ **已接（監工 brief 寫的時候還沒）**：`backend/music.cjs` 三列 Lyria 3.5（US$0.08／首）、Lyria 3 Clip（US$0.04／30 s）、Eleven Music（US$0.15／分，需 ElevenLabs 付費方案）；job `operation:"music"`，付費鍵 `video.music`；歌詞併進 prompt；頁面模型列已是按鈕（`wfProviderChoice("music")`），`wfSelect` 下拉已全部移除 | `music.cjs:40-46,84-96`、`main-system.cjs:40`、`NA/lib/ai/cost-model.ts:253-256`、`NA/lib/portal/products.ts:54`、`scripts/tools-voice-music.js:258-300` |
| 已有 whisper 字幕逐字時間 | ✓ 四引擎 host（免費）／ElevenLabs Scribe v2／Gemini 3.5 Transcribe／OpenAI whisper-1，都正規化成 `{segments, words[{start,end,text,score}]}`；host worker `word_timestamps=True`，中文 token 合併 `merge_words` | `backend/transcribe.cjs:32-39,106-130`、`video-whisper-worker/app.py:183-195` |
| 已有 剪輯器 ED 線（另一帳號） | ✓ 13/13 done and live（監工台 `feb6fa278`；ED.12.3、ED.13 階段 2 都在 main） | `git log origin/main` |
| 已有 剪輯 Agent | ✓ `/editor/agent` → `{reply, ops}`；工具清單 24 個，**沒有「加片段到時間軸」**，只有 split／delete／duplicate／add_text／import_cues 等 | `backend/editor-agent.cjs`、`shared/editor-agent-plan.js:17-39` |
| 已有 智能短影音剪輯 | ✓ `/tools/short/analyze`：字幕 cues → 文字模型選段；不看畫面 | `api.cjs:1657-1663`、`scripts/tools-short.js` |
| 缺 每鏡綁角色、場景、道具 | **部分錯**：場景（單選 `sceneId`）與角色（多選 `characterIds`）已綁在鏡頭卡；只缺**道具** | `projects-0.js:41-45,650-662` |
| 缺 分軌 | **半錯**：音軌分離工具有兩列：`local`＝ffmpeg 抽整條原音（不是分軌）；`elevenlabs`＝Voice Isolator **只留人聲**（去配樂與環境聲），免費方案額度內 US$0、付費方案 US$0.12／分但「付費計費尚未接上」會拒；輸入目前限影片素材。沒有伴奏軌、沒有鼓／貝斯 | `backend/audio-tools.cjs:13-18,40-48,79-83`、`backend/media.cjs:128`、`cost-model.ts:267` |
| 缺 歌詞對時 | ✓ 正確（逐字時間有，歌詞比對沒有） | — |
| 缺 唱歌對嘴 | ✓ 正確。三處寫「對嘴尚未接入」；`spokespersonVideo: false` | `tools-voice-music.js:105`、`index-0.js:362`、`generation-policy.cjs:75` |
| 缺 依段落粗剪 | ✓ 正確。PJ.3 的 `edArrange` 只按 `shot.seconds` 串接，不吃歌曲時間 | `tools-editor.js:940-972` |
| （監工沒列）資料正本 | 瀏覽器 `VideoWorkbench.storage` 是 facade，寫入走 `PUT /state` → `.data/state.json`；localStorage 不是正本。專案頁顯示的「本機專案」是舊文案 | `shared/runtime.js:459-477`、`api.cjs:225,1403-1407`、`projects-0.js:149` |
| （監工沒列）角色有兩份 | 角色頁 `db.characters`（`runtime.js:576`）與專案聖經 `p.assets.character[]`（`projects-0.js:469`）是**兩個互不相連的儲存**；生成頁帶角色用 `input.character.{description,references}`（`api.cjs:418,755`），專案頁送 `characterIds`（伺服器未讀） | 見左 |
| （監工沒列）主機無 GPU | AMD EPYC 7351P、32 執行緒、無 GPU；whisper 已在 CPU int8 跑 | `docs/vendor-alternatives-20261110.md §1`、`app.py:96` |
| （監工沒列）同日姐妹規格 | `docs/video-deliverable-pack-spec-20261114.md`（VD 卡：封面、字幕檔、響度、各平台比例）動 `media_assets.metadata`、`media-store.cjs`、匯出對話框；與本規格無同欄位（它不碰 `episode.song`） | 該檔 §1–§2 |

## 2. 資料流：歌 → 成片

一集 = 一支 MV。新增欄位只有一個 `episode.song`（放 `db.projects`，正本 `.data/state.json`，與 PJ 同處 `pj-project-spine-spec §1.1`）。

```ts
type Song = {
  audio: { url: string; assetId: string } | null;        // 整首（上傳／素材庫／作曲成品），本機 url
  source: "upload" | "library" | "lyria-3.5" | "music_v2_5" | null;   // = music.cjs 的 row id
  lyrics: string;                                         // 含 [Verse]/[Chorus]/[Bridge]/[Intro]/[Outro] 標記（寫詞路由已輸出此格式）
  vocals: { url: string; jobId: string; engine: string } | null;        // 人聲軌（audio-tools separate 成品）
  lines: { id: string; section: string; text: string; start: number; end: number;
           words: { start: number; end: number; text: string }[] | null }[] | null;   // MV.5 成品；秒，從歌曲 0 起算
  sections: { id: string; name: string; start: number; end: number }[] | null;          // 由 lines 推：同 section 連續行；行與行間 > 8 s 的空白 = 「間奏」
  alignedBy: "host" | "elevenlabs" | "gemini" | "openai" | null;                        // = transcribe.cjs engine id
};
```
`shot` 多三欄：`sectionId`（屬哪一段）、`propIds: string[]`（MV.2）、`lipsync: { url, jobId } | null`（MV.8）。

| 段 | 做法 | 用哪個模組 | 新增 | 存哪 | 舊資料 |
|---|---|---|---|---|---|
| 概念→故事 | `episode.outline` + 導演對話照舊 | `projects-0.js:149`（大綱）、`/director/chat` | — | episode | 不變 |
| 寫詞 | 既有 `/tools/music/lyrics`，從專案頁「歌曲」區呼叫 | `api.cjs:1664` | 專案頁入口（MV.3） | `song.lyrics` | 沒有 song 的集 = 普通影片，所有 MV 區塊隱藏 |
| 作曲 | 預設免費：上傳／素材庫（內建 70 首 CC0 音樂庫 `/library/`，ED.6.5 `5e244170f`）。付費：既有 `operation:"music"` job（Lyria 3.5 預設，按鈕 NT$2.6／首） | `music.cjs`、`api.cjs:683,1388` | 專案頁入口帶 `link`（MV.3）；Lyria 回時間軸歌詞時讀進 `lines`（MV.7） | `song.audio`、成品入任務帳冊與主系統資產（照 `api.cjs:95` 既有路） | — |
| 人聲分離 | 既有音軌分離 job，engine 預設 = 免費列（`providers.choose`）：ElevenLabs 免費方案 → `elevenlabs`；否則 MV.4 新增的自家 Demucs 列 | `audio-tools.cjs`、`providers.cjs:7-11` | MV.4：音軌分離接受音訊素材＋自家 Demucs 列 | `song.vocals` | 沒有人聲軌：對時與對嘴按鈕顯示「先分離人聲（免費）」 |
| 歌詞對時 | 對 `song.vocals` 跑 `transcribe` host 引擎（免費，words）→ `shared/lyrics-align.js` 把 `lyrics` 每行比對到 words → `lines/sections` | `transcribe.cjs:32`、新 `shared/lyrics-align.js`、新路由 `/tools/music/align` | MV.5 | `song.lines/sections` | 使用者手改任一行時間 → 該行 `words:null`（字幕退回整句，`editor-model.js:416-419` 已處理） |
| 分鏡依段落 | `/director/shots` 多吃 `song.sections`＋`lyrics`：每段 N 鏡，`seconds` 合計 = 段長、單鏡 ≤ 15 s（Omni 1.2 上限 15，`gemini-video.cjs:9`）；鏡頭帶 `sectionId` | `api.cjs:1613`、`projects-0.js` 鏡頭格加段落標題 | MV.6 | `episode.shots[].sectionId` | 舊鏡頭無 `sectionId` → 粗剪時照 PJ.3 順序排 |
| 角色／場景／道具綁定 | 場景、角色已綁；加道具 chips；三者 refs 都進參考圖（4 張上限 `api.cjs:10`，順序 場景→角色→道具） | `projects-0.js:41-45,543-548` | MV.2 | `shot.propIds` | 沒有 propIds = 現行行為 |
| 特徵鎖定 | §4 | 新 `backend/character-lock.cjs` | MV.1／MV.2 | 角色記錄 | 沒有欄位 = 不加字 |
| 鏡頭影片 ≤ 15 s | 既有鏡頭卡影片生成（PJ.2 `shot.video`）。MV 一律選**無聲**模型（Veo 3.1 Fast 等）或 Omni 後在粗剪靜音 | `generation-policy.cjs:41-56`、`validate:99` | — | `shot.video` | — |
| 唱歌對嘴 | 從 `song.vocals` 用 ffmpeg 切該鏡 `[start,end]`（free）→ Hedra Character-3（圖 = 該鏡角色鎖定參考圖，音 = 人聲片段）→ `shot.lipsync` | 新 `backend/lipsync.cjs`、`media.cjs` 加 `trim-audio` 操作 | MV.8 | `shot.lipsync` 任務成品 | 沒對嘴 = 用 `shot.video ?? shot.image` |
| 粗剪 | `edArrangeSong(p, episode)`：主軌每行一段（`shot.lipsync ?? shot.video ?? shot.image`，長度 = 行長，影片靜音）；音樂軌整首 `song.audio`；字幕軌 = `lines`（帶 `words` → 可選「卡拉 OK」樣式，`editor-model.js:393`）；可重做（`slot` 規則同 PJ.3） | 新 `scripts/editor-mv.js`，`tools-editor.js:1085` 頂列 `data-ed-spine` 群組加一顆按鈕 | MV.9 | 剪輯檔（`preferences["tools.editor.projects"]`） | 非 MV 集看不到按鈕；`edArrange` 不動 |
| 輸出 | 既有輸出對話框（ED.8）→ 任務 → 送審投遞；封面等交付包照 VD 規格 | `editor-export.cjs`、`editor-export-dialog.js` | — | `episode.outputs` | — |

## 3. 缺口選項與決定

價格欄 = 官方頁；NT$ = USD × 32。「公司／國」= 官方頁或已知；「未驗證」= 只憑常識。

### 3.1 分軌（MV 只需要人聲軌：對時與對嘴都吃它；整首歌照原檔鋪音樂軌）

| 選項 | 公司／國 | 授權 | 自架 | 價格 | 輸出 | 來源 |
|---|---|---|---|---|---|---|
| **A. ElevenLabs Voice Isolator（已接）** | ElevenLabs（美） | 閉源 | ✗ | 免費方案：月額度內 US$0（頁面顯示剩餘點數，`elevenlabs.cjs:62`）；付費方案 US$0.12／分 → 4 分鐘 ≈ NT$15，**目前付費計費未接、會拒** | 只有人聲 | `audio-tools.cjs:16-17,40-48`；elevenlabs.io/pricing/api |
| **B. Demucs v4 htdemucs，自架 CPU（MV.4 新列）** | Meta（美）；repo 2025-01 封存，維護分支 adefossez/demucs | 程式 MIT；**權重無獨立授權聲明**（README 只覆蓋程式）。`mdx_extra` 用了額外資料（含 MusDB test），不用它 | ✓ `-d cpu`，約 1.5× 曲長（4 分鐘歌 ≈ 6 分鐘） | 0，無額度上限 | 人聲＋伴奏（two-stems）；四軌可選 | github.com/facebookresearch/demucs；huggingface.co/adefossez/HTDemucs/discussions/1 |
| C. Replicate cjwbw/demucs | Replicate（美）託管 | 頁面未標 | ✗ | ≈US$0.014／次 ≈ NT$0.45，T4 約 63 s | 四軌 | replicate.com/cjwbw/demucs |
| ✗ Music.AI（Moises） | Music AI（原巴西） | 閉源 | ✗ | Vocals stems US$0.10／分 | 四軌 | music.ai/pricing |
| ✗ python-audio-separator／UVR 權重 | 個人維護 | MIT；MDX-Net／Roformer 權重授權查不到 | ✓ | 0 | — | github.com/nomadkaraoke/python-audio-separator |
| ✗ Spleeter | Deezer（法） | MIT | ✓ | 0 | 舊、品質低於 Demucs | github.com/deezer/spleeter |

**決定：A 先用（零程式），B 做成音軌分離的第三列「自家主機 人聲／伴奏」當無額度上限的免費預設，C 當「加速」付費列。** 理由：A 已在 main，MV.4 只要讓音軌分離接受音訊素材並把成品寫到 `song.vocals`；B 走 `video-whisper-worker` 同款容器（Dockerfile＋`requirements.lock`＋token，`video-whisper-worker/Dockerfile:1-14`），加進 `audio-tools.cjs` `TOOLS.separate` 一列即可，`providers.order` 自動排免費在前；權重授權灰區只影響容器內權重檔，不進 repo、不進買斷交付的程式碼。

### 3.2 歌詞對時

| 選項 | 公司／國 | 授權 | 自架 | 價格 | 中文 | 來源 |
|---|---|---|---|---|---|---|
| **A. host whisper large-v3（人聲軌）＋自寫比對** | 自家容器（已上線） | whisper MIT | ✓ 已在跑 | 0（`TRANSCRIBE_RATES` host = 0，`cost-model.ts:206`） | ✓ 中文 token 已合併 | `transcribe.cjs:32`、`app.py:191` |
| B. ElevenLabs Scribe v2／Gemini 3.5 Transcribe（人聲軌）＋同一比對 | 美 | 閉源 | ✗ | Scribe US$0.20／小時（免費方案 US$0）；Gemini ≈US$0.005／分 → 4 分鐘 ≈ NT$0.6 | ✓ 逐字時間 | 已接 `transcribe.cjs:35,37` |
| C. ElevenLabs Forced Alignment API | ElevenLabs（美） | 閉源 | ✗ | 同 STT US$0.20／小時 → 4 分鐘 ≈ NT$0.4 | 清單含 Chinese；唱歌效果查不到 | elevenlabs.io/docs/overview/capabilities/forced-alignment.md |
| ✗ aeneas | ReadBeyond | **AGPL v3** | ✓ | 0 | 無中文；自述不適合歌曲 | github.com/readbeyond/aeneas |
| ✗ NUS AutoLyrixAlign | NUS（新加坡） | **GPL v3** | ✓ | 0 | 查不到 | github.com/chitralekha18/AutoLyrixAlign |
| ✗ Montreal Forced Aligner | MontrealCorpusTools | MIT；Mandarin 模型 CC-BY-4.0（朗讀語料，非唱歌） | ✓ | 0 | ✓ 朗讀 | mfa-models.readthedocs.io |
| （輔）WhisperX、stable-ts | 個人 | BSD-2／MIT | ✓ | 0 | 未明 | 不另裝；host worker 已給 words |

**決定 A 預設，B 同一組 `transcribe.engines` 按鈕（`providers.order` 免費在前，`backend/providers.cjs:7`），C 不接（要再寫一個 ElevenLabs 端點，收益只有省掉比對）。** 比對演算法自寫在 `shared/lyrics-align.js`（純函式、Node 與瀏覽器共用，照 `shared/episode-spine.js` 寫法）：正規化（去標點、全半形、簡轉繁 `NA/lib/ai/to-traditional.ts` 已有）→ 歌詞每行的字元序列對 words 的字元序列做 Needleman-Wunsch（gap 罰分），取每行第一與最後對上字的 `start/end`；對不上的行（段落標記、重複副歌漏辨）用前後行線性內插並標 `words:null`。Lyria 成品若回時間軸歌詞（§3.4）直接用，跳過 A。

### 3.3 唱歌對嘴數字人

| 供應商 | 公司／國（創辦人） | 排除？ | 官方價 | 輸入 | 唱歌 | 最長 | 來源 |
|---|---|---|---|---|---|---|---|
| **A. Hedra Character-3** | Hedra，美國舊金山 | 否 | 540p US$0.025／s、**720p US$0.05／s（NT$1.6／s）**、1080p US$0.0625／s | **圖＋音訊** | 官方模型頁列 「talking and singing video」 | 10 分（另一頁寫 5 分，矛盾） | hedra.com/models/video/hedra/character-3；hedra.com/docs/pages/studio/getting-started/video-models |
| B. Sync Labs lipsync-2／2-pro | Sync，美國舊金山（Wav2Lip 作者團隊） | 否 | lipsync-2 US$0.04–0.05／s；2-pro US$0.067–0.083／s；fal 代管 US$3–5／分；Replicate `sync/lipsync-2-pro` 只寫 usage-based | **影片＋音訊**（不收圖） | 官方只建議先分離人聲，未宣稱唱歌 | 依方案 | sync.so/pricing；fal.ai/models/fal-ai/sync-lipsync/v2/pro |
| C. Captions Mirage Avatar X | Captions，美國紐約（第三方） | 否 | US$0.15／s（6 秒計費單位）≈ NT$4.8／s | 圖或影片＋音訊 | 查不到 | 未列 | captions.ai/help/docs/api/pricing |
| ✗ HeyGen | 2020 深圳創立（原 Surreal），2023 撤銷深圳實體，現洛杉磯 | **排除（中國起源）** | 第三方 US$3／分 | 圖 | 查不到 | — | research.contrary.com/company/heygen |
| ✗ Runway Act-Two | Runway（美） | 否 | US$0.05／s | 需**驅動表演影片**，不吃音訊 | 不適用 | — | docs.dev.runwayml.com/guides/pricing |
| ✗ Veo 3.1／Gemini Omni 1.2 | Google | 否 | — | **沒有音訊輸入**，不能驅動對嘴 | — | — | aistudio.google.com/docs/video |
| ✗ Tavus／D-ID | 美／以色列 | 否 | 官方價頁抓不到 | Tavus 要先訓練 replica | 查不到 | — | tavus.io/pricing |
| ✗ Kling、OmniHuman、LatentSync、MuseTalk、Sonic、SadTalker、Hallo、LivePortrait | 中國 | **排除** | — | — | — | — | — |
| ✗ Wav2Lip | IIIT Hyderabad | 非商用（README「any form of commercial use is strictly prohibited」） | — | — | — | — | github.com/Rudrabha/Wav2Lip |
| 自架可商用非中國開源 | **查不到** | — | — | — | — | — | — |

**決定 A（Hedra Character-3，720p）。** 理由：唯一官方寫「singing」且吃「圖＋音訊」的非中國供應商；每鏡 15 s ≈ NT$24，按鈕標示；圖直接用該鏡角色的鎖定參考圖（§4），音用人聲軌切段（免費），所以嘴型對的是歌聲不是伴奏。B 留作第二期「對已生成的鏡頭影片對嘴」（輸入影片；若走 Replicate 可用 `backend/replicate-run.cjs` 的取消規則）。免費預設 = 不對嘴（用鏡頭影片）。Hedra 積分制（3–8 credits／s）與美元價頁面矛盾，MV.8 開工前先打一次 1 秒測試記實價（同 ED.12.3 做法，WORKLOG 2026-11-13 續4）。

### 3.4 作曲

現況（main，`music.cjs:40-46`）：Lyria 3.5（Google，US$0.08／首，可唱自訂歌詞）、Lyria 3 Clip（US$0.04／30 s，無歌詞）、Eleven Music v2.5（US$0.15／分，ElevenLabs 免費方案 402 → 列為不可用）。`capability` 依價排序、免費方案擋付費列；歌詞以 `Lyrics:\n…` 併入 prompt（`music.cjs:83`）；Lyria 回應只取 audio block（`music.cjs:22-25`），**沒有讀時間軸歌詞**。

| 供應商 | 公司／國 | 排除？ | 官方 API | 價格 | 歌聲／中文 | 商用 | 來源 |
|---|---|---|---|---|---|---|---|
| **A. Google Lyria 3.5（已接）** | Google（美） | 否 | ✓ Interactions API | **US$0.08／首 ≈ NT$2.6**（約 2–3 分鐘） | 有歌聲、可自訂歌詞、**官方頁說有時間軸歌詞**；語言「跟 prompt」，中文未明列 → 先實測 1 首 | 文件未寫條款；SynthID 浮水印 | aistudio.google.com/docs/pricing；aistudio.google.com/docs/music-generation |
| B. ElevenLabs Music v2.5（已接） | ElevenLabs（美） | 否 | ✓（付費方案） | US$0.15／分（FAQ 又寫 per generation，矛盾） | 有歌詞（composition_plan）；中文未列 | 非 Enterprise 排除電影／電視／廣播 | elevenlabs.io/pricing/api；elevenlabs.io/music-terms |
| C. Stability Stable Audio 2.5 | Stability AI（英） | 否 | ✓ | US$0.08／次（fal US$0.20） | **無歌聲證據**（music and sound effects） | 社群授權年營收 > US$1M 終止 | docs.stability.ai/pricing |
| ✗ Suno | Suno（美） | 否 | **無公開 API**；2026-07 僅邀請制夥伴計畫；sunoapi.org 等是非官方轉接（違 ToS 風險） | 查不到 | 有 | — | digitalmusicnews.com/2026/07/03/suno-is-opening-an-api-partner-program |
| ✗ Udio | Uncharted Labs（美） | 否 | 查不到 | — | — | — | — |
| ✗ MusicGen | Meta | 否 | 開源 | Replicate ≈US$0.035 | 純器樂 | **權重 CC-BY-NC，不可商用** | huggingface.co/facebook/musicgen-large |
| ✗ MiniMax Music、YuE、ACE-Step、DiffRhythm、Mureka、Tencent SongGeneration、Seed-Music | 中國 | **排除** | — | — | — | — | — |
| Mubert／Soundraw／Beatoven／Loudly／AIVA | 各國 | 否 | 月費制（Mubert US$49／月起、Soundraw US$29.99／月起） | 多為純配樂、無歌詞 | — | 不適合按次扣點 | mubert.com/api；soundraw.io/business |

**決定：不換，照現況 A 預設。** MV.7 只做兩件：專案頁入口把 `song.lyrics` 帶進既有 music job 並把成品掛回 `song.audio`；`music.cjs` 的 `lyria()` 若回應含時間軸歌詞（開工第 0 步實測一首繁中歌詞 NT$2.6，同時看回應 schema）就寫進 `song.lines`，沒有就走 MV.5 對時。中文歌聲不行 → 預設改 B（要操作者升 ElevenLabs 付費方案，另開卡）。

### 3.5 依段落粗剪

| 選項 | 做法 | 判定 |
|---|---|---|
| **A. 新 `scripts/editor-mv.js` 的 `edArrangeSong`** | 複用 PJ.3 的 `edCheckpoint`／`edMain`／`edTrackFor`／`edImportCues`／`slot` 規則（`tools-editor.js:346,73,940-1009`），加歌曲時間；一顆按鈕掛在 `:1085` 頂列群組 | **選**。免費、可重做、一次 checkpoint 可復原 |
| B. 走剪輯 Agent ops | 工具清單無 add_clip（`editor-agent-plan.js:17-39`），加工具 = 改 ED 的檔，且每次要付文字模型費 | 否 |
| C. 伺服器直接產剪輯檔 JSON | 繞過 `edNormalizeProject`／revision，兩份規則 | 否 |

## 4. 角色「特徵鎖定」與排除項

**不變量**：任何送到供應商的生圖／生影片／對嘴請求，只要帶了角色，就一定帶該角色的鎖定特徵、排除項與鎖定參考圖；而且這件事只在一處發生。

**存**（兩個既有角色儲存都加同三欄，不新建儲存）：

| 欄 | 型別 | 角色頁記錄（`db.characters`，`runtime.js:576`） | 聖經角色（`p.assets.character[]`，`projects-0.js:469`） |
|---|---|---|---|
| `invariants` | `string[]`（≤ 12 條，每條 ≤ 40 字；例「左眼角淚痣」「紅色短髮齊肩」） | 編輯表單新區「固定特徵」chips 輸入（`characters-0.js:447` 旁） | 資產對話框同區（`projects-0.js:337`） |
| `exclusions` | `string[]`（≤ 12 條；例「眼鏡」「鬍子」） | 同上「不要出現」 | 同上 |
| `lockedRefs` | `string[]`（≤ 2 個 url，從 `references/refs` 勾選） | 參考圖縮圖加「鎖定」勾 | 同 |
| `libraryId` | `string \| null` | — | 聖經角色若是從角色頁「加入」而來則記來源 id；鎖定欄以角色頁為準（避免兩份漂移） |

**帶**（一處）：新 `backend/character-lock.cjs`，在 `jobInput()`（`api.cjs:389-430`）之後呼叫 `CharacterLock.apply(input, state)`：

1. 找角色：`input.characterIds[]`（專案頁已送，`projects-0.js:572`）、`input.character.id`（生成頁）、`input.references.images[].characterId`（MV.2 起每張參考圖帶來源）。從 `state.characters` 與 `state.projects[].assets.character` 以 id 取，`libraryId` 優先。
2. 組字：prompt 末尾加 `\n角色 <name> 固定特徵：a、b、c` 與 `\n畫面中不得出現：x、y`（每角色一行，去重）；`exclusions` 另放 `input.negative[]`，供有 negative 欄的供應商用（Replicate Veo schema 有 `negative_prompt`，`NA/lib/ai/video-motion-models.ts:49-84` 的 `buildInput` 現在不送 → MV.1 加一個可選參數；OpenAI images、Gemini Omni 無此欄，只走 prompt 文字）。
3. 圖：`lockedRefs` 插到 `references.images` 最前，去重，仍受 `MAX_SENT_REFERENCES = 4`（`api.cjs:10`）；超過時先砍非鎖定圖。
4. 寫進 `job.input.lock = { characterIds, invariantsHash }` 讓成果能回答「這張用了哪版鎖定」（PJ.4 過期提示可比對）。
5. 對嘴（MV.8）與分鏡格參考圖（MV.10）也經 `apply`，因為它們都是 `/generations` 的 job。

舊資料：沒有這三欄 = `apply` 不加字、不動圖，與現行行為位元相同（`tests/mv1-character-lock.cjs` 第 1 條就測這個）。

不做：前端自己拼字串（現在 `generateShot` 把場景 descr 拼進 prompt，`projects-0.js:553-561`，維持不動；角色描述從未拼入，MV.1 之後由 `apply` 統一加，不在前端補）。

## 5. 卡片

規則：每卡 1–2 個模組；新程式放新檔；做完可單獨上線（`main` 推上 = 可能上線，`pj-project-spine-spec §5`；工作台部署是 `sg-deploy video-workbench` High，由操作者決定時點）。測試走 `tests/isolated-server.cjs`；付費按鈕受 `tests/paid-price.cjs` 守（新 feature key 必加 `data-paid`）。模型欄照 AGENTS §5。

| # | 卡 | 改哪些檔 | 完成 = | 測試（只寫這些） | 風險 | 模型 | 前置 |
|---|---|---|---|---|---|---|---|
| MV.1 | 特徵鎖定伺服器注入 | 新 `backend/character-lock.cjs`；`backend/api.cjs` 在 `jobInput` 後加 1 行呼叫＋`/capabilities` 加 `characterLock: true`；`NA/lib/ai/video-motion-models.ts:49-84` `buildInput` 接 `negativePrompt?` | 帶 `characterIds` 的 image／video job，送出 prompt 含固定特徵與排除行、`references.images[0]` 是 lockedRef；無欄位的角色位元不變 | 新 `tests/mv1-character-lock.cjs`：① 無欄位 → prompt／refs 與輸入相同 ② 兩角色去重、4 張上限先砍非鎖定圖 ③ Veo 送 `negative_prompt`。突變：拔掉 `apply` 呼叫 → ① 以外全紅 | Medium（核心邏輯） | Opus | 無 |
| MV.2 | 鎖定欄位 UI＋鏡頭綁道具 | `scripts/characters-0.js`（表單三欄＋儲存）、`scripts/projects-0.js`（資產對話框三欄；`shotControls` 加道具 chips `propIds`；`generateShot` refs 順序 場景→角色→道具，每張帶 `characterId`） | 兩頁能存／讀三欄；鏡頭卡能多選道具且 refs 進參考圖；全部是按鈕／chips，無下拉 | 新 `tests/mv2-lock-ui.cjs`（jsdom 照 `tests/pj1-legacy-ui.cjs` 寫法）：① 存→重開三欄還在 ② 道具 chip 點兩次 = 取消 ③ refs 順序。重跑 `pj1-legacy-ui`、`scene-shots` | Low | Sonnet `fullstack-engineer`（卡寫死）或 Codex | 可與 MV.1 並行 |
| MV.3 | `episode.song` 與專案頁「歌曲」區 | `shared/episode-spine.js`（Song 型別、`isMv(episode)`、`sectionsOf(lines)` 純函式）；`scripts/projects-0.js`（集頁新區：上傳／素材庫選歌、貼歌詞、AI 寫歌詞走既有 `/tools/music/lyrics` 帶 `video.script` 價格、「作曲」開既有音樂工具帶 `link.target="song"` 與 `lyrics`，成品經 settle 寫 `song.audio`；「分離人聲」「對時」先 disabled 寫「下一張卡接入」） | 一集能掛一首歌＋歌詞並存回 `/state`；作曲成品自動掛回；非 MV 集畫面不變 | 新 `tests/mv3-song.cjs`：① `sectionsOf` 把 `[Verse]/[Chorus]` 與 8 s 空白切段 ② 存歌後 `/state` 有 `song` ③ `spineSignature` 不因 song 變動重繪（`projects-0.js:63`）④ music job settle → `song.audio` | Low | Opus | 無 |
| MV.4 | 人聲分離接到歌曲＋自家 Demucs 列 | `backend/audio-tools.cjs`（`separate` 接受音訊素材：`info.audio` 已查、只放寬 UI 的來源種類；新列 `{ id:"host-demucs", vendor:"AwareWave 主機", label:"人聲／伴奏", price 0 }` 呼叫 `VW_STEMS_WORKER_URL`）；新 `apps/video-stems-worker/`（Dockerfile、`app.py` FastAPI `POST /v1/separate` two-stems htdemucs CPU、`requirements.lock`、`docker-compose.stems.yml`，照 `video-whisper-worker`）；`scripts/projects-0.js` 「分離人聲」按鈕送既有 `operation:"separate"` job 帶 `link.target="vocals"` → `song.vocals` | 歌 → 人聲軌（ElevenLabs 免費列或自家列）→ `song.vocals`；compose 多兩個 env | 新 `tests/mv4-vocals.cjs`（假 worker）：① 音訊素材可送 separate ② 自家列成功寫內容定址檔、失敗不留半檔 ③ 無 env → 列不可用、ElevenLabs 列仍在。容器真跑一次 4 分鐘歌記秒數進 WORKLOG | Medium；**部署 High**（新容器 `safe-infra-patch.sh compose`） | Opus | MV.3 |
| MV.5 | 歌詞對時 | 新 `shared/lyrics-align.js`；新 `backend/mv-routes.cjs`（`/tools/music/align`：吃 `song.vocals`＋`lyrics`＋`engine`，host 免費預設，按鈕價格同 `transcribe.capability`，回 `lines`；`main-system.cjs` `PAID_ROUTES` 加此路由 → `video.transcribe`）；`api.cjs` 1 行掛 | 一首 4 分鐘中文歌，每行有 start/end，副歌重複行不錯位；手改一行 → `words:null` | 新 `tests/mv5-align.cjs`：① fixture（20 行歌詞＋假 words）全對上 ② 漏一句 → 內插且 `words:null` ③ 簡體歌詞對繁體 words 仍對上。突變：拔正規化 → ③ 紅 | Medium | Opus | MV.4 |
| MV.6 | 分鏡依段落 | `api.cjs:1613-1636` `/director/shots` 接 `sections`（每段 N 鏡、單鏡 ≤ 15 s、回 `sectionId`）；`scripts/projects-0.js` 鏡頭格依段落分組顯示 | 有 song 的集 AI 分鏡後，每段鏡頭秒數和 = 段長 ±1 s | 新 `tests/mv6-section-shots.cjs`：① 假模型回 shots → 伺服器修正秒數和、拒 > 15 s ② 無 sections 行為 = 現行（`pj3-arrange` 重跑） | Medium | Opus | MV.5 |
| MV.7 | Lyria 時間軸歌詞 | `backend/music.cjs` `lyria()` 讀回應裡的時間軸歌詞（第 0 步實測看 schema）回 `{ audio, ext, lines? }`；`api.cjs:683-698` 成品多存 `result.lines`；`scripts/projects-0.js` settle 時有 `lines` 就寫 `song.lines`、`alignedBy:"lyria"` | 用 Lyria 作的歌不用對時就有 `lines` | 新 `tests/mv7-lyria-lines.cjs`：① 假回應含時間軸 → `song.lines` ② 無時間軸 → `lines:null`、對時按鈕可按；`music-generation` 重跑。**第 0 步**：真打 1 首繁中歌詞（NT$2.6）記中文歌聲結果與回應欄位 | Low | Opus | MV.3 |
| MV.8 | 唱歌對嘴（Hedra） | 新 `backend/lipsync.cjs`（token、create、status、download、cancel，照 `replicate-video.cjs` 介面）；`backend/media.cjs` 加 `trim-audio`；`api.cjs` 1 行掛 `operation:"lipsync"`；`cost-model.ts` `TOOL_RATES["hedra-character-3"]`（usdPerSec 0.05）；`products.ts:54` `quota("video.lipsync","唱歌對嘴")`；`main-system.cjs` `paidFeature` 加一行；`scripts/projects-0.js` 鏡頭卡按鈕「唱歌對嘴 · NT$<秒×1.6>」 | 一鏡 → 人聲切段 → Hedra → `shot.lipsync.url`；成品經 `character-lock.apply`（用 lockedRef 當圖） | 新 `tests/mv8-lipsync.cjs`：① 假 Hedra → 入帳按秒計 ② 無 `HEDRA_API_KEY` → 按鈕未啟用 ③ 無 `song.vocals` → 拒並提示先分離人聲；`paid-price` 重跑。**第 0 步**真打 1 秒記實價 | **High**（新供應商金鑰、金流） | Opus；等操作者 go | MV.4、MV.1 |
| MV.9 | 依段落粗剪 | 新 `scripts/editor-mv.js`（`edArrangeSong`、`edSongSubtitles`）；`scripts/tools-editor.js:1085` 加 1 顆按鈕（只在 `isMv`）；`scripts/tools-0.js` TOOLS.edit.scripts 加新檔 | 按一下：主軌每行一段（對嘴 > 影片 > 圖）靜音、音樂軌整首、字幕軌每行＋words；重做不動手加片段；一步可復原 | 新 `tests/mv9-rough-cut.cjs`（照 `pj3-arrange.cjs`）：① 3 行 2 鏡 → 片段起迄 = 行時間 ② 重做保留手動片段 ③ 影片片段 `muted` ④ 字幕片段帶 words。重跑 `pj3-arrange`、`ed10-subtitles-ui` | Medium | Opus | MV.5 |
| MV.10 | 4／6／9 格分鏡參考圖 | `scripts/projects-0.js` 集頁按鈕「分鏡格 · NT$」→ `/generations` image `operation:"storyboard-sheet"`（prompt 由 `mv-routes.cjs` 組：N 格、每格一鏡文字、場景／角色鎖定圖當參考）；成品存 `episode.sheet` | 一張 N 格圖，格數 = 選的 4／6／9（按鈕） | 新 `tests/mv10-sheet.cjs`：① 格數 ≠ 4/6/9 拒 ② prompt 含每鏡文字且經 `character-lock` | Low | Codex `/codex-do`（卡寫死） | MV.1、MV.5 |

順序（每張做完都能單獨上線）：**MV.3 → MV.1 → MV.2 → MV.4 → MV.5 → MV.6 → MV.9**（到此全免費、用上傳的歌就能從歌到粗剪）→ **MV.7 → MV.8 → MV.10**。MV.1／MV.2／MV.3 互不撞檔可並行；其餘依前置。

每卡 commit 訊息與 WORKLOG 照 AGENTS §1 四行證據；`.ts` 改動（MV.1、MV.8 的 NA 檔）`npx tsc --noEmit`；`tests/gate.cjs:6` 清單加新的純 node 測試。

## 6. 與 ED 線（另一帳號）撞檔

- 證據：ED 線 13/13 在 main（監工台 `feb6fa278`）；最近 ED commit 動的檔 = `scripts/tools-editor.js`、`scripts/editor-panes/*`、`shared/editor-model.js`、`backend/editor-export.cjs`、`backend/media-store.cjs`、`backend/api.cjs`。
- `D:\Work` 工作區對它自己 HEAD（`386881dce`）有 70 個改檔，但對 `origin/main` 的差異全是「main 已有、它還沒拉」（`git diff --stat origin/main`：142 檔、+636／−6084，新增檔 `replicate-run.cjs`／`vendor-fonts.cjs` 等都已在 main）。**D:\Work 是落後的 checkout，不是未 commit 的 ED 工作**；監工 brief 說的「他們還沒 commit 的檔」在 main 上已找不到對應。仍照 brief 不碰 D:\Work。

| 檔 | 誰常改 | MV 哪幾卡 | 處理 |
|---|---|---|---|
| `backend/api.cjs` | ED、VD、音樂／ElevenLabs 線都在改 | MV.1（1 行＋capabilities 1 鍵）、MV.5／8（各 1 行掛載）、MV.6（改 `/director/shots` 一段）、MV.7（`:683` 成品多一欄） | 新邏輯全放 `character-lock.cjs`、`mv-routes.cjs`、`lipsync.cjs`；`api.cjs` 只加掛載行；每張卡開工前 `git pull --ff-only` 再對行號 |
| `scripts/tools-editor.js` | ED | MV.9（`:1085` 加 1 顆按鈕） | 邏輯在新檔 `scripts/editor-mv.js` |
| `shared/paid-price.js` | ED、音樂線 | MV.8（`video.lipsync` 每秒價格文字） | 照 `video.motion` 的 `usdPerSec` 寫法加一分支 |
| `backend/music.cjs`、`backend/audio-tools.cjs`、`backend/elevenlabs.cjs` | 音樂／ElevenLabs 線（2026-11-13） | MV.4、MV.7 | 只加一列／一個回傳欄，不改既有列 |
| `scripts/projects-0.js`、`scripts/characters-0.js`、`shared/episode-spine.js` | PJ 線（已完） | MV.2／3／4／6／7／8／10 | 可先做 |
| `backend/media-store.cjs`、`editor-export-dialog.js` | VD 卡（同日規格） | 不碰 | — |

## 7. 監工清單的錯誤（彙整）

1. 分鏡靈感 172 張，不是 184（§1）。
2. 「音樂生成工具已有」原本只有外殼；2026-11-13 `70c1d62d1` 已接三個模型，下拉已移除（§1、§3.4）。
3. 「缺每一鏡綁角色、場景、道具」：場景與角色已綁，只缺道具（§1）。
4. 「缺分軌」：ElevenLabs「只留人聲」已接，MV 只需要人聲軌；缺的是無額度上限的自家列與伴奏軌（§3.1）。
5. 「負面提示詞」在專案頁只是文案，沒有欄位（§1）。
6. 角色有兩份互不相連的儲存；專案頁送的 `characterIds` 伺服器沒讀；角色文字描述從未進 prompt（§1、§4）。
7. 「D:\Work 裡有 ED 還沒 commit 的檔」：那是落後 main 的 checkout（§6）。
8. 參考產品用 Suno：Suno 沒有公開 API，第三方轉接不可用（§3.4）。

## 8. 未驗證、要操作者或開工時定

- Lyria 3.5 繁中歌聲品質與回應是否含時間軸歌詞（MV.7 第 0 步實測 1 首，NT$2.6）。
- Hedra 實際每秒價（積分頁與美元頁矛盾；MV.8 第 0 步 1 秒實測）。
- Demucs 權重授權（Meta 無聲明；只影響容器內權重檔，不進程式交付）。
- 分軌 CPU 耗時（估 1.5× 曲長；MV.4 真跑一次記 WORKLOG）。
- ElevenLabs 免費方案月額度夠不夠 MV 用量（頁面會顯示剩餘點數；不夠就靠 MV.4 自家列）。
- MV.8 為 High：新供應商金鑰進 `mcp/user-env.ps1` 與 compose，等操作者 go。
