# 會議工作區頁面 — 工作卡（2026-11-24）

背景與限制：`agency-os/handoffs/2026-11-24-0918-ownvoice-workspace-page.md`（不重述）。
`MS` = 本資料夾。`OV` = OwnVoice Meet 原始碼（Apache-2.0，上游 https://github.com/Zaious/ownvoice-meet ，v0.2.3+1 `08e3ab3`；本機暫存 `D:\tmp\ownvoice-src\ownvoice-meet`）。

## 定案（操作者 2026-11-24）

- 語音辨識兩條都做：`gemini`（Gemini Live，約 NT$17／小時，金鑰 = 環境變數 `GEMINI_API_KEY`）與 `local`（本機 faster-whisper large-v3，NT$0，講完一句才出字）。頁面用兩顆並排按鈕切換，不用下拉。
- 翻譯／回覆／摘要：Claude Haiku 5.5（設定頁的 Anthropic key）；沒填 key 時改走 Gemini 3.5 Flash-Lite（同一把 `GEMINI_API_KEY`）。
- 停靠面板：`dockview-core@8.9.1`（MIT）單檔 `static/vendor/dockview-core-8.9.1.min.js`，不連 CDN；漂浮群組關閉。
- 傳輸：瀏覽器 ↔ 伺服器一條 WebSocket `/api/live/ws`（uvicorn 0.49 + 已安裝的 `websockets` 16.0，實測可載入）。不新增 pip 套件。
- 延遲目標：灰字 ≤ 1 秒；句子結束到中文 ≤ 2 秒；不停頓的長句第 4 秒起先出中文。
- 與 `LIVE_MULTILINGUAL_MASTER_PLAN.md` 的關係：該計畫 0／19 未開工。本頁推翻它的 D1（輪詢）、D6（不做即時翻譯）只限工作區頁面；沿用 D2（AudioWorklet PCM16）、D5（即時與批次搶顯卡要互斥）、D8（零新依賴）。
- 少掉的（操作者已知）：字幕不能浮在會議軟體上；沒有全域快捷鍵；別的程式裡反白的字要貼進查詢面板。

## 每張卡共同規則

- 一卡一 commit；只動卡上列的檔；不 commit 由派工者驗收後做。
- 頁面文字繁體中文白話；不用下拉選單；不用中國廠商模型；金鑰只在伺服器端。
- 不做無效益測試：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。
- 測試指令（在 `MS` 內）：`python -m unittest tests.<模組> -v`。
- 移植自 OV 的檔，檔頭一行註明來源檔與 Apache-2.0；`lib/live/NOTICE.md` 集中列出。
- 回報操作者一律繁體中文；回報結尾三行 `FILES:`／`TESTS:`／`RISKS:`。

## 段 1：做完就沒有漂浮視窗

**C1 工作區外殼**
- 改：`app.py`（`/static` 掛載、`GET /workspace`、`GET|PUT /api/workspace/layout`）；新 `lib/workspace.py`（版面存 `MS/.workspace.json`，原子寫入，上限 64 KB，非物件拒絕）；新 `templates/workspace.html`；新 `static/vendor/dockview-core-8.9.1.min.js`＋`static/vendor/dockview-core.LICENSE.txt`；`templates/index.html` 加「會議工作區」連結；`.gitignore` 加 `.workspace.json`；新 `tests/test_workspace.py`。
- 四個面板 id：`captions` 字幕、`reply` 回覆、`script` 講稿、`lookup` 查詢。每個面板內容是 `workspace.html` 裡一個 `<template id="tpl-<id>">`，後續卡只填自己的 template 與自己的 `<script>` 區塊。
- 預設版面：左上字幕（寬 60%、高 65%）、左下回覆、右上查詢、右下講稿。頂列有四顆顯示／隱藏按鈕與「恢復預設版面」。
- 驗收：拖曳換位、拉分隔線、疊成分頁後重新整理版面不變；壞掉的版面檔自動回預設；單元測試綠；真實截圖。

**C2 查詢面板**
- 改：`templates/workspace.html` 的 `tpl-lookup` 與其 script。沿用 `POST /api/lookup/search`、`/api/lookup/ask`、`/mindmap`。
- 行為：頁面內任何面板反白文字（≥ 2 字）→ 自動填入查詢框並搜尋網路；「問 AI（計費）」「心智圖」要按才呼叫；舊結果不蓋新結果（沿用 `lookup_panel.py` 的 latest 代號做法）。
- 驗收：反白字幕文字 → 查詢面板出現搜尋結果（截圖）。

**C3 即時核心（純邏輯）**
- 新：`lib/live/__init__.py`、`lib/live/captions.py`（移植 `OV/src-tauri/src/captions.rs` 的 `Line`：`wants_early`／`start`／`cancel_below`／`accept`／`done`、`reads_as_subtitle`、常數 4 s／2 s／20 字；時間由呼叫端傳入）、`lib/live/prompts.py`（移植 `prompts.rs` 全部提示詞與函式，文字逐字不改）、`lib/live/respace.py`（移植 `gemini.rs` 的 `Respace`）、`lib/live/NOTICE.md`。
- 新測試：`tests/test_live_captions.py`、`tests/test_live_prompts.py`、`tests/test_live_respace.py` = 逐一移植三個 Rust 檔的 `#[test]`（非 `#[ignore]` 者）。
- 驗收：測試綠，條數與 Rust 來源一致（captions 5、prompts 3、respace 2）。

**C4 辨識與翻譯供應者**
- 新：`lib/live/session.py`（一場會議的狀態：字幕列、最近 N 句脈絡、講稿、事件佇列；呼叫 C3 的 `Line`）、`lib/live/stt_gemini.py`（移植 `gemini.rs`：setup、16 kHz PCM、interim／final、9 分鐘輪替、250 ms 無聲補靜音、401／403／404 = 不重試）、`lib/live/stt_local.py`（移植 `vad.rs` 切句 ＋ 行程內 faster-whisper；模型常駐一份，與批次流程用一把鎖互斥，批次進行中拒絕並說明）、`lib/live/translate.py`（Anthropic 串流＋講稿 cache 區塊；無 key 時 Gemini OpenAI 相容端點）、`lib/live/usage.py`（音訊秒數與 token → NT$，匯率 32，價目移植 `catalog.rs`）。
- 新測試：`tests/test_live_vad.py`（移植 `vad.rs` 測試）、`tests/test_live_session.py`（假供應者：一句進來 → 事件順序 open／interim／final／zh；舊翻譯不蓋新翻譯）。
- 驗收：測試綠；真實呼叫一次錯的 Gemini key → 回可讀訊息且不重試。

**C5 收音、串流端點、字幕面板**
- 改：`app.py` 加 WebSocket `/api/live/ws`（**檢查 `Origin` 只允許本服務自己的來源**，否則關閉；這是唯一的守衛，做一次突變）；`templates/workspace.html` 的 `tpl-captions` 與 script：AudioWorklet（Blob URL 內嵌）→ 16 kHz 單聲道 PCM16，每 100 ms 一包；「麥克風」「電腦聲音」兩顆可同時開（`getDisplayMedia` 無音訊軌時顯示警告）；灰字／白字、中文在下、貼底捲動（移植 `OV/src/shared/follow.ts`）、只看中文、字級；音量條；「Gemini（計費）／本機（免費）」兩顆按鈕；今日用量 NT$。
- 新測試：`tests/test_live_ws.py`（錯的 Origin 被拒；突變：拿掉檢查 → 紅）。
- 驗收：Windows 語音合成播英文 → 英文＋中文出現；回報兩種辨識各自的延遲數字；截圖。

**C6 閒置暫停**
- 新：`lib/live/idle.py`（移植 `idle.rs`：N 分鐘沒有新字幕 → 放掉辨識連線不送不計費；有聲音再接回，先送保留的 2 秒；更久自動結束）。預設暫停 3 分鐘、結束 30 分鐘，頁面可改。
- 新測試：`tests/test_live_idle.py`（移植 `idle.rs` 測試）。
- 驗收：實測安靜後狀態列顯示已暫停、用量不再增加。

**C7 段 1 收尾**
- 刪：`lookup_panel.py`、`start_server.ps1` 的 `Start-LookupPanel` 與兩處呼叫。改：`README.md`（工作區一節取代側欄一節）、`LIVE_MULTILINGUAL_MASTER_PLAN.md` §0 加一行指向本檔。
- 驗收：全部測試綠；`/verify-recent`；critic 一次；列出刪除清單；登記 `RUNNABLE_DEMOS.md`。

## 段 2

**C8 回覆面板** — `tpl-reply`；WebSocket 訊息 `reply`；`lib/live/session.py` 加 `compose_reply`（`REPLY_SYSTEM`＋脈絡＋講稿；新回覆取代舊的）。Enter 送出（輸入法組字中不送）、Shift+Enter 換行。驗收：打一句中文 → 大字英文（截圖）。

**C9 講稿面板** — `tpl-script`；移植 `OV/src/script/format.ts`（解析）、`template.ts`、`gloss.rs`（補對照）；講稿存 `MS/.script.md`；`GET|PUT /api/live/script`、`POST /api/live/script/gloss`；詞彙表（`中文 = English`）同頁編輯。測試：`tests/test_live_gloss.py`（移植 `gloss.rs` 測試）。驗收：講稿裡的名詞出現在翻譯與回覆。

## 段 3

**C10 存檔** — 新 `lib/live/archive.py`：寫出與 OV 相同的資料夾（`<YYYY-MM-DD HHMM>/NN-<段名>.wav`、`transcript.md`，md 每 3 秒原子重寫、WAV 檔頭每 5 秒回填）；位置用 `lib/ownvoice.base_dir()`；「新段落」按鈕與改名。測試：`tests/test_live_archive.py`（寫出的資料夾能被 `lib/ownvoice.py` 的 `sessions()`／`read_text()`／`join_wavs()` 讀回）。驗收：停止後首頁「OwnVoice 會議」卡出現、「會後整理」出分角色逐字稿。

**C11 會議中摘要** — 新 `lib/live/summary.py`（移植 `batch.rs`＋`summary.rs`：每 N 分鐘、至少 3 句新字幕才呼叫；停止時補最後一批）；摘要顯示為第五個可停靠分頁 `summary`，預設疊在查詢旁；有存檔時寫 `summary.md`。測試：`tests/test_live_summary.py`（不足 3 句不呼叫）。驗收：實測一段四句英文後摘要分頁有條列。

## 進度

- 已完成：11／11（段 1：C1–C5 `07339b55c`、C6 `302c529c2`、C7）；段 2：C8、C9；段 3：C10、C11（未 commit，待驗收）
- 已知限制：兩個分頁同時編輯講稿可能互蓋（靠內容比對，沒有版本號）；補對照每批 40 行，整段長段落可能超過模型輸出上限
- 與卡片原文不同之處：C4 的顯卡互斥是 `acquire_live`／`acquire_batch`（批次可多個）；C5 翻譯器整個行程共用一個、每次聆聽只換金鑰；C6 本機辨識不暫停只自動結束；C7 另把「問 AI」的上下文改成優先用工作區這場的字幕
- C10 與卡片不同：另寫 `NN-<段名>.md`（每段逐字稿，archive.rs 有寫）；`session.py` 多了 `on_open`／`on_drop`／`on_clear` 三個回呼（逐字稿時間用開口那一刻、drop 的列不進逐字稿、清除字幕時摘要歸零）；段名上限 80 字、控制字元與換行換成空白；沒有議程設定（`parse_agenda` 只為移植測試保留，段名一律「段落 N」）；停止後先等翻譯（≤ 5 秒）與最後一次摘要（≤ 20 秒）才寫最後一版檔案，這段時間按「聆聽」會被告知稍候；沒存檔時 `segment` 事件 `index` = 0
- C11 與卡片不同：摘要面板疊在查詢旁、預設版面把查詢設為作用中分頁；清除字幕時還在跑的更新結果會被丟掉（batch.rs 沒有這條）；頁面的 start 欄位由面板登記（`Workspace.startExtras`），字幕面板不認識摘要
- 未實測：真實麥克風／電腦聲音收音；Anthropic 翻譯與摘要對真實 API；存檔／摘要面板在真實瀏覽器裡的點擊操作（只驗過頁面 200、五段內嵌 script 語法、WebSocket snapshot 與指令）

## 段 4：統一設定、多語言、我／對方、即時講者、會後整理進工作區（計畫 2026-11-25，未開工）

### 操作者的問題與定案

| # | 問題（2026-11-25） | 答案 |
|---|---|---|
| Q1 | 聆聽錄完再按舊頁「會後整理」，哪幾步重複？ | 轉錄、段落合併、幻覺偵測重複（`pipeline.py:121`／`:133`／`:140` 對錄音重新辨識）。有 C16 後講者分離（`:151`）也重複。會議記錄、PPT／講稿／Excel／Word／雲端不重複。→ C17 聆聽場次直接用逐字稿＋講者，兩步都跳過。 |
| Q6 | 同步到 Google Drive／電腦／哪裡要能設定；兩個工具的設定要統一（2026-11-25） | 現況設定散在 6 處（見 C13）。定案：一份設定檔、一個設定面板，兩個工具共用；輸出目的地可設多個資料夾。→ C13。 |
| Q5 | 有即時分講者，會後講者分離是否也重複？（2026-11-25） | 是。定案：講者只算一次——聆聽中即時分群，停止時用全場聲紋重新分群（不重跑 pyannote）。pyannote 整場分離只用在沒有即時講者的來源：上傳檔案、C16 之前存的場次，或操作者按「重新分講者」。 |
| Q2 | 會後整理要不要搬進工作區？只上傳檔案怎麼辦？ | 搬。工作區一個「會後整理」面板，一套流程兩個入口：聆聽場次（跳過轉錄）／上傳檔案（從轉錄開始）。舊首頁的流程在新面板能做到全部後才退休。 |
| Q3 | 聽中文出現簡體字幕；多國語言能否選定／自動、不翻譯、以哪個語言出字幕？ | 根因：語言寫死 `templates/workspace.html:369`（`language: "en-US"`）；翻譯目標寫死繁中 `lib/live/prompts.py:6`、`:76-78`；簡轉繁 `lib/live/zh.py` `to_taiwan` 已移植但沒有任何呼叫者。→ C12＋C14。 |
| Q4 | 聆聽能否講者分離？ | 能，分兩層：「我／對方」靠聲音來源（C15）；對方多人靠聲紋即時分群（C16）；停止聆聽時用整場已算好的聲紋重新分群一次，修正開場與短句（C16，不重跑 pyannote）。 |

### 架構定案

- **每句字幕一種資料格式**（取代 `en`／`zh` 寫死的「英翻中」：`lib/live/session.py:25-29`）：`id, who("me"|"them"), speaker(str|None), lang(BCP-47|""), text, tr, final`。事件 `caption` 同欄位。存檔沿用 OwnVoice markdown 格式（`lib/live/archive.py:105-121` 已有 `speaker` 欄位 `:56`），檔案內容格式不變。
- **語言表一處**：新 `lib/live/langs.py`，一列一語言 `(code, 按鈕名, 提示詞用名, whisper 碼, 文字系統)`。加語言 = 加一列。首批：自動、zh-TW 中文、en-US English、ja-JP 日本語、ko-KR 한국어。
- **翻譯規則一條**：`tr = ""` 當「翻譯成」=不翻譯，或該句語言 == 目標語言。中文字一律過 `zh.to_taiwan`（字幕與翻譯都過）。
- **聲音兩路**：瀏覽器每包 binary 第 1 byte = 來源（0 我＝麥克風、1 對方＝電腦聲音），其後 PCM16。伺服器每路一個 `Channel`（音訊佇列＋閒置閘＋辨識器＋`Live`），共用同一個 `Session`。只開一路時行為與今天相同。
- **講者**：只對「對方」路做；每句結束取該句時間窗的聲音 → 聲紋向量 → 線上分群 → `講者 N`。聲紋只存在記憶體；「記住這個聲音」要按才存，本機檔、可刪。
- 預設值 = 今天的行為（聽 English、翻繁中、一路、無講者），舊存檔與舊用法不變。

### 費用（每小時，匯率 32）

| 組合 | 辨識 | 備註 |
|---|---|---|
| 今天：一路 Gemini | NT$17（`lib/live/usage.py:34` US$0.009／分） | |
| 我＝本機、對方＝Gemini（建議預設） | NT$17 | |
| 兩路 Gemini | NT$35 | |
| 兩路本機 | NT$0 | 同一個模型、同一個辨識工人輪流用 |
| 即時講者（C16） | NT$0 | 本機顯卡 |
| 翻譯 Claude Haiku | ≤ NT$12（以 2026-11-25 密集對話推估） | 不翻譯／同語言的句子 NT$0 |

### 卡片

**C12 每句資料格式＋語言表（行為不變）**
- 改：`lib/live/session.py`（`Segment` 改新欄位；`context()` 用 `who` 產生 `Me:`／`Them:`，`my_lines` 併入）、`lib/live/archive.py`（`Line.en/zh` → `text/tr`，輸出格式不變）、`lib/live/summary.py:38-44`、`:99-106`、`lib/live/hub.py`（snapshot、`transcript_tail`、`_line_final`／`_line_translated`）、`templates/workspace.html`（字幕繪製讀新欄位）。新 `lib/live/langs.py`。
- 測試：既有測試全綠（更新欄位名）；新 `tests/test_live_langs.py`：語言表查詢、文字系統判斷（漢字／假名／諺文／拉丁）。
- 驗收：`feed.py her1912.wav gemini` 結果與今天相同（13 則、中文 ≤ 1 秒）。

**C13 統一設定（兩個工具共用）**
- 現況散在 6 處：Anthropic key `MS/.settings.json`（`lib/settings.py:14`）；Gemini key、`HF_TOKEN` 環境變數；Drive 目的地環境變數 `MEETING_DRIVE_BASE`（`lib/archive.py:18`），每次上傳另勾一次（`app.py:190`）；錄音存檔資料夾讀 OwnVoice 自己的 `%APPDATA%` 設定（`lib/ownvoice.py:23-50`）；工作區偏好只在瀏覽器 localStorage（`templates/workspace.html:252`、`:555`）。
- 一份設定：`lib/settings.py` 擴成有欄位定義的設定檔（仍是 `MS/.settings.json`，原子寫入，已在 `.gitignore:3`）。欄位：
  - 金鑰：Anthropic、Gemini、Hugging Face（只回遮罩；環境變數仍是後備，設定頁有值時優先）。
  - 錄音存檔資料夾（預設 = 今天的 `ownvoice.base_dir()`）。
  - 輸出目的地：0～N 個資料夾，各有名稱與「預設同步」開關（Google Drive 桌面版掛載的資料夾也是資料夾，例：`H:\我的雲端硬碟\ECT\會議記錄`）；子資料夾規則沿用 `lib/archive.py`（`<日期>/`）。
  - 語言預設（C14 的「聽的語言」「翻譯成」）、辨識預設、暫停／結束分鐘、字幕字級、回覆字級、摘要開關與間隔。
- 一個設定面板：工作區新可停靠面板 `settings`；舊首頁的「API 設定」卡換成同一個元件（同一段 HTML／JS，`templates/_settings.html` 兩頁共用），不另寫一份。資料夾欄位旁有「檢查」（存在、可寫入）與快捷按鈕（偵測到的 Google Drive 掛載、文件資料夾），不用下拉。
- API：`GET /api/settings`（金鑰只回遮罩）、`PUT /api/settings`（部分更新，逐欄驗證：資料夾須為絕對路徑、存在、可寫入；未知欄位拒絕）。所有寫入檢查 `Origin`（沿用 `lib/live/hub.py` `origin_allowed`），今天的 `POST /api/settings`（`app.py:421`）沒有這個檢查，一併補上並做一次突變。
- 舊資料：第一次讀取時把 `MEETING_DRIVE_BASE` 轉成一個目的地、OwnVoice 的 `archive_dir` 轉成存檔資料夾；頁面第一次載入把 localStorage 偏好送上來後刪除本機那份。之後只讀設定檔。
- 套用：上傳／會後整理的「同步」勾選框預設取目的地的「預設同步」，當次可改；`pipeline.py` 同步時寫到每個勾選的目的地，一個失敗不影響其他（各自記錄）。
- 測試：欄位驗證（壞路徑、未知欄位、超長字串）；舊資料轉入（有環境變數與 OwnVoice 設定 → 設定檔有對應值，第二次不重複轉）；錯的 Origin 寫入被拒（突變：拿掉檢查 → 紅）；兩個目的地一個失敗另一個仍寫入。
- 驗收：工作區與首頁開同一個設定面板，一邊改另一邊重新整理看得到；設一個暫存資料夾為目的地 → 會後整理產出出現在該資料夾。

**C14 語言設定**
- 頁面：字幕面板兩排按鈕「聽的語言」「翻譯成」（無下拉），存 C13 的設定檔；`start` 帶 `listen`、`target`。
- 伺服器：`stt_gemini._connect` `languageCodes`（`lib/live/stt_gemini.py:178-183`，自動 = 空陣列）；`stt_local` 傳 whisper 碼，自動時用 whisper 偵測的語言填 `lang`；Gemini 自動時用語言表的文字系統判斷填 `lang`（拉丁系無法分辨時 `lang = ""`，照翻）。
- 提示詞：`LISTEN_SYSTEM`／`listen_user`／`SUMMARY_SYSTEM`／`REPLY_SYSTEM` 改成依目標語言名產生（`prompts.py:6`、`:11`、`:18-20`、`:76-78`）；目標 = 繁中時文字與今天逐字相同。回覆面板：「我的語言」→「對方的語言」。摘要語言 = 翻譯目標，不翻譯時 = 我的語言。
- `zh.to_taiwan` 接在 `Session` 寫入 `text` 與 `tr` 的唯一入口。
- 測試：同語言不呼叫翻譯（假翻譯器計數 = 0）；簡體 text 進、繁體出；目標繁中時提示詞與今天相同（字串比對）。
- 驗收：中文語音合成 → 繁體字幕、不翻譯、NT$0 翻譯費；英文 → 繁中（同今天）；日文 → 繁中。

**C15 我／對方**
- 頁面：`startAudio`（`workspace.html:308-345`）兩路各自一個 AudioWorklet，不再混音（`:326`）；每包加來源 byte；兩路各自選 Gemini／本機。
- 伺服器：`hub.py` `_supervise`（`:272-326`）抽成 `Channel`，一路一個；WebSocket binary 解析來源 byte（長度、來源值驗證，壞包丟棄）；`gpu_gate.acquire_live` 一次聆聽只取一次，兩路本機時共用一個辨識工人。
- 回音守衛：「我」路的句子若與同時間「對方」路聲音包絡相關係數 ≥ 門檻 → 丟棄（門檻以實測錄音定，寫在常數旁）。
- 頁面：字幕列標「我」「對方」（顏色區分，主題 token）。存檔：`speaker` = 「我」或對方講者名。
- 測試：來源 byte 解析（壞包、未知來源）；回音守衛（同一段聲音兩路 → 我路丟棄；不同聲音 → 保留）；只開一路 = 今天的事件序列。
- 驗收：雙聲道測試錄音（左＝我、右＝對方，含一段只有喇叭回音）經 `feed.py` 兩路送入 → 標籤正確、回音段不出現在「我」。

**C16 即時分出對方每個人**
- 第一步實測：`pyannote` 4.0.7 聲紋模型能否以現有 `HF_TOKEN` 在本機 GPU 載入、每句耗時（目標 < 100 ms）；不行就停卡回報，不換供應者。
- 新 `lib/live/speakers.py`：環形緩衝保留對方路最近 60 秒聲音（帶時間）；`Live`／`stt_local` 在 FINAL 時回報該句開始與結束時間；取窗 → 向量 → 與各講者中心餘弦比對，≥ 門檻歸入並更新中心，否則新增 `講者 N`；< 1 秒的句子沿用前一句講者並標「推定」。
- 停止聆聽時：用本場所有句子的聲紋重新分群一次（不重跑聲音，只用已算的向量），講者編號依說話總長重排，改過的名字依多數句子對應保留；結果寫進存檔（`speaker`）並更新頁面。
- 頁面：講者名可點改名（本場有效）；「記住這個聲音」存 `MS/.voices.json`（只存向量與名字，不存聲音），講者面板可刪。
- 顯卡：與本機辨識共用 `gpu_gate` live 鎖內執行；批次流程進行中不啟用講者（狀態列說明）。
- 測試：分群純邏輯（假向量：兩群分開、短句沿用、改名保留）；`.voices.json` 刪除後不再比對（隱私守衛，突變一次）。
- 驗收：至少 3 人的真實錄音（不用合成語音）→ 回報每句標對比例；低於 80% 不上線、回報操作者。

**C17 會後整理進工作區**
- `lib/live/archive.py` `Line` 加 `end`（句子結束時間）；新 `lib/postmeeting.py`：聆聽場次 → segments `[{start,end,text,speaker}]` → 直接進 `pipeline.py` 會議記錄之後的步驟（不轉錄、不分講者）。場次沒有講者（C16 之前存的、只開一路且沒分講者）或操作者按「重新分講者」→ 才跑 `diarize.diarize`（`lib/diarize.py:122`，60 分鐘約 2.5 分鐘），改過的名字依時間重疊多數決保留。
- 上傳檔案入口：沿用 `/api/upload`（`app.py:188`）＋`run_pipeline_phase1`，選項（講者分離、模型、語言、雲端、自動處理）搬到面板，用按鈕不用下拉（舊頁 `large-v3` 是下拉，一併改）。
- 頁面：新可停靠面板 `post`：場次清單（沿用 `/api/ownvoice/sessions` `app.py:241`）、上傳區、步驟進度、下載。
- 舊首頁的流程在新面板可做到全部後：首頁只留「會議工作區」入口與 API 設定；刪除清單寫在該卡的 commit。
- 測試：聆聽場次轉 segments（時間、講者、空行）；有講者的場次不跑轉錄也不跑 diarize（兩個假函式呼叫數 = 0）；沒講者的場次只跑 diarize。
- 驗收：一場聆聽存檔 → 面板「會後整理」→ 分角色逐字稿＋會議記錄＋PPT，花費時間比舊流程短（回報兩個數字）。

### 順序與驗證

- C12 → C13 → C14 → C15 → C16 → C17，一卡一 commit，每卡 critic 一次、真實鏈測（`feed.py`）一次，過了才換新 8420。
- C14 做完即可單獨上線（解決簡體字幕）。C13 先於 C14：語言設定要存進統一設定。
- 撤回：每卡 `git revert`；C12 以後預設值 = 今天的行為。

### 未證實（要實測）

- 即時講者準確度、前 1–2 分鐘與短句的錯誤率；聲紋模型在現有 token 下能否載入。
- 本機辨識＋聲紋同時用顯卡的延遲。
- 回音守衛在操作者的喇叭／耳機上的門檻。
- Gemini 自動語言時，拉丁語系之間（英／法／西）無法由文字系統判斷，同語言不翻譯的規則只對設定了「聽的語言」或非拉丁文字有效。
