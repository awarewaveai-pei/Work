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

## 段 4：兩個工具合成一套（計畫 v2，2026-11-26 檢視後重寫）

v1（2026-11-25，`af92d5382`）經 critic 25 條＋Codex 19 條檢視（`agency-os/reports/oracle/2026-11-26-inspect-60d4b1ef.md`）後重寫。v1 的錯：`to_taiwan`「沒有呼叫者」不對（`lib/live/translate.py:197`、`:206`、`:226` 已呼叫，缺的是辨識原文）；合併與幻覺偵測不算重複（聆聽時沒跑過）；存檔沒有機器可讀的逐字稿（只有 markdown，`lib/live/archive.py:105-121`），會後整理無從接起；只補設定 API 的來源檢查是補一個洞不是關一類。

### 一句話

會後整理是一條**產物鏈**：聲音 → 逐字稿 → 講者 → 整理（合併＋幻覺偵測）→ 會議記錄 → PPT／Word／Excel → 同步。**每一步只在它的產物還不存在時才跑。** 來源帶什麼產物進來，就少跑什麼；程式沒有「聆聽專用」與「上傳專用」兩份流程。

| 來源 | 帶進來的產物 | 會跑的步驟 |
|---|---|---|
| 上傳音檔／影片 | 聲音 | 全部（＝今天的舊流程，`pipeline.py:100`） |
| 聆聽場次（C12 之後存的） | 聲音＋逐字稿＋翻譯 | 講者起往後；不轉錄 |
| 聆聽場次（C18 之後，有即時講者） | 聲音＋逐字稿＋翻譯＋講者 | 整理起往後；不轉錄、不分講者、不用顯卡 |
| 舊場次（OwnVoice app 存的、C12 之前存的：只有 markdown，沒有結束時間） | 聲音 | 全部（＝今天的 `/api/ownvoice/import` `app.py:246`） |
| 聆聽場次但錄音沒存成（`wavs=0`） | 逐字稿＋翻譯 | 整理起往後；無講者，面板說明不能重新辨識／分講者 |
| 聆聽時關了「存檔」 | 無 | 不能整理；停止時字幕面板說明（要整理就開存檔） |
| 操作者按「重新辨識」／「重新分講者」 | 丟掉該產物 | 從那一步重跑 |

操作者的問題對應：Q1 重複的只有轉錄（有即時講者後加上講者分離）；Q2 會後整理進工作區、兩個入口同一條鏈（C15）；Q3 語言（C14）；Q4／Q5 我／對方（C17）、即時講者（C18），講者只算一次；Q6 一份設定（C13、C16）。

### 架構定案

- **每句一種格式**（取代寫死英翻中的 `lib/live/session.py:25-29`）：`id, start, end, seg, who("me"|"them"), speaker(str|None), lang(BCP-47|""), text, tr, final`。`caption` 事件同欄位。
- **時間只有一個基準＝錄音的取樣位置**（不是伺服器時鐘）。今天 `open_line` 用 `clock()`（`lib/live/archive.py:331-341`），辨識佇列落後會丟音訊（`lib/live/hub.py:311-313`）而 WAV 不丟，兩者越差越多。每路數自己收到的取樣數；本機辨識由 VAD 給起訖取樣；Gemini 用文字到達當下的取樣數。實測（C12，`her1912.wav`）Gemini 晚 3.9–4.9 秒（第 1 句 start 6.7 vs 實際發聲 2.85；最後一句 end 64.4 vs 59.5），不用常數補正（斷句器的等待時間每句不同）：要配講者時用錄音的發聲區段重新對齊（C15 一個函式，C18 沿用）。
- **場次旁檔 `session.json`**（機器讀；`transcript.md` 照舊給人讀，格式不變）：`version, listen, target, stt, channels, lines[...], dropped_sec, failed_lines`，與 `transcript.md` 同一次原子寫入。寫入＝`lib/live/archive.py`，讀取＝`lib/ownvoice.py`（仍是唯一讀取點）。沒有這個檔＝舊場次。
- **語言表一處** `lib/live/langs.py`：一列一語言 `(code, 按鈕名, 提示詞用名, whisper 碼, 文字系統, 要不要簡轉繁)`。加語言＝加一列。`lib/transcribe.py:25` `LANGUAGES`、`app.py:73-75` `_check_language`、`lib/ownvoice.py:54-57` 都改由它推導（否則選日文後上傳回 400）。首批：自動、zh-TW、en-US、ja-JP、ko-KR。
- **簡轉繁只對中文**：`lang` 或翻譯目標是中文才過 `zh.to_taiwan`（日文漢字 会 学 来 区 医 号 声 都在觸發字集 `lib/live/zh.py:8-9`，一律轉會弄壞日文）。規則函式一個、在 `langs.py`；原文在 `Session` 寫入處呼叫，翻譯在 `translate.py` 現有三處呼叫（帶目標語言）。
- **翻譯規則一條**：目標＝不翻譯，或該句語言＝目標語言 → `tr = ""`，不呼叫模型。`〔翻譯失敗…〕`（`lib/live/session.py:217-222`）不寫進 `tr`，記在 `failed_lines`。
- **聲音兩路**（C17）：`start` 帶 `proto: 2` 才啟用；每包 binary 第 1 byte＝來源（0 我、1 對方）＋PCM16，長度不符協定就丟。伺服器每路一個 `Channel`，共用一個 `Session`。錄音：兩路都開時存雙聲道 WAV（左我右對方，依取樣位置對齊），一路時單聲道（＝今天）。
- **顯卡規則一條**，只由 `Hub` 一層持有（今天在 `lib/live/stt_local.py:89-92` 裡取，兩路本機會被自己擋）：任一路用本機辨識或開了即時講者 → 取 `gpu_gate.acquire_live`，否則不取。產物鏈的工作只在要跑轉錄或 pyannote 時取 `acquire_batch`；不用顯卡的工作可在聆聽中執行。
- **場次與工作的對應**：`jobs/sessions.json`（`{場次資料夾路徑: [job_id…]}`，原子寫入）。場次資料夾不寫任何產出（OwnVoice app 的資料夾只讀）。重跑＝新 job。
- **跨站寫入守衛一處**：一個 middleware 拒絕 `Origin`／`Sec-Fetch-Site` 不是本服務的非 GET／HEAD 請求（沿用 `lib/live/hub.py:55` `origin_allowed`）。今天只有 WebSocket 有檢查（`app.py:147`）；別的網頁可以對 `/api/upload?use_api=true`（`app.py:188`）、`/api/mindmap`、`/api/lookup/ask`、`/api/settings`（`app.py:421`）送出請求並產生費用。
- 預設值＝今天的行為（聽 English、翻繁中、一路、無講者）。

### 費用（每小時，匯率 32）

| 組合 | 辨識 |
|---|---|
| 一路 Gemini（今天） | NT$17（`lib/live/usage.py:34`） |
| 我＝本機、對方＝Gemini（**建議預設**：兩路只付一路的錢；自己的聲音清楚，本機夠用） | NT$17 |
| 兩路 Gemini | NT$35 |
| 兩路本機／即時講者 | NT$0 |
| 翻譯 Claude Haiku | ≤ NT$12；不翻譯或同語言 NT$0 |
| 會後整理用聆聽逐字稿 | NT$0；省掉轉錄的顯卡時間，有即時講者再省 pyannote（60 分鐘錄音約 2.5 分鐘） |

### 卡片（依執行順序）

**C12 每句格式、取樣時間、場次旁檔（行為不變）**
- 改：`lib/live/session.py`（`Segment` 新欄位；`context()` 用 `who`）、`lib/live/archive.py`（`Line` 新欄位＋`end`；寫 `session.json`；時間改取樣位置）、`lib/live/stt_gemini.py`／`stt_local.py`（回報起訖取樣）、`lib/live/summary.py:38-44`、`:99-106`、`lib/live/hub.py`（snapshot、`transcript_tail`、`_line_final`／`_line_translated`、丟棄的音訊記入 `dropped_sec`）、`templates/workspace.html`（讀新欄位）、`lib/ownvoice.py`（新 `session_lines()` 讀旁檔）。新 `lib/live/langs.py`。
- 真實鏈測工具收進 repo：`tools/feed.py`（今天只在暫存區），之後每卡驗收都用它。
- 測試：既有測試改欄位名後全綠；語言表查詢與文字系統判斷；旁檔寫入後讀回同值；沒有旁檔的資料夾 `session_lines()` 回 None。
- 驗收：`tools/feed.py her1912.wav gemini` 13 則、中文 ≤ 1 秒（同今天）；旁檔每句 start／end 對照 WAV 實際發聲位置：本機 ≤ 0.3 秒、Gemini 回報實測值；`transcript.md` 與今天逐字相同。

**C13 一份設定＋跨站寫入守衛**
- 現況散在：`MS/.settings.json`（Anthropic key，`lib/settings.py:14`）；環境變數 `GEMINI_API_KEY`（`lib/live/hub.py:156`）、`HF_TOKEN`（`lib/diarize.py:60`）、`SERPER_API_KEY`（`app.py:276`、`:292`）、`MEETING_DRIVE_BASE`（`lib/archive.py:26`，import 時讀一次）、`VIDEO_WORKER_TOKEN`；OwnVoice app 的 `%APPDATA%` 設定（`lib/ownvoice.py:23-57`：`archive_dir`、`stt_language`）；瀏覽器 localStorage（`templates/workspace.html:252-253`、`:555-556`、`:1038-1039`）。
- `lib/settings.py` 擴成有欄位定義的設定檔（同一個 `.settings.json`；`anthropic_api_key` 鍵名不變，revert 後舊程式仍讀得到）。欄位：金鑰 Anthropic／Gemini／Hugging Face／Serper（只回遮罩；優先序一條：設定檔有值用設定檔，否則環境變數；Anthropic 例外，不讀環境變數：系統可能留著給 Claude CLI 用的過期 `ANTHROPIC_API_KEY`，拿來備援會讓翻譯失敗而不改走 Gemini，`lib/settings.py:18-22`）；聽的語言、翻譯成、辨識方式、暫停／結束分鐘、字級、摘要開關與間隔、存檔開關。`VIDEO_WORKER_TOKEN` 留環境變數（機器對機器，不進頁面）。
- 每個金鑰的讀取點改接設定（上列 `hub.py:156`、`diarize.py:60`、`app.py:276`、`:292`），否則面板填了 key 聆聽仍說沒設定。
- API：`GET /api/settings`、`PUT /api/settings`（部分更新、逐欄驗證、未知欄位拒絕）；舊 `POST /api/settings` 改呼叫同一個函式。
- 跨站寫入守衛 middleware（見架構定案），突變一次。
- 面板：`templates/_settings.html` 一份，工作區（可停靠面板 `settings`）與舊首頁共用。
- 舊資料：頁面第一次載入把 localStorage 偏好 `PUT` 上去，伺服器回成功才刪本機那份。
- 測試：欄位驗證；優先序；錯的 Origin 的 POST／PUT 被拒（突變：拿掉 middleware → 紅）；只有 `anthropic_api_key` 的舊設定檔讀得到。
- 驗收：兩頁開同一個面板，一邊改另一邊重新整理看得到。太大時拆兩個 commit（設定檔＋API＋守衛／面板）。

**C14 語言**
- 頁面：字幕面板兩排按鈕「聽的語言」「翻譯成」（含「不翻譯」），存 C13；`start` 帶 `listen`、`target`。
- 伺服器：Gemini `languageCodes`（`lib/live/stt_gemini.py:178-183`，自動＝空陣列）；本機傳 whisper 碼，自動時用偵測語言填 `lang`；Gemini 自動時用文字系統判斷（拉丁系分不出 → `lang = ""`，照翻）。
- 提示詞依目標語言產生：`lib/live/prompts.py:6`、`:11`、`:18-20`、`:76-78`；目標繁中時與今天逐字相同。回覆面板＝「我的語言」→「對方的語言」。
- 會議記錄提示詞寫死「繁體中文逐字稿」（`lib/summarize.py:58`）：改成「逐字稿語言＝X；輸出語言＝翻譯目標（不翻譯時＝我的語言）」；預設與今天相同。
- 測試：同語言不呼叫翻譯（計數 0）；簡體中文進、繁體出；日文句含 会／学 原樣輸出；目標繁中時提示詞字串與今天相同。
- 驗收：中文語音 → 繁體字幕、翻譯費 NT$0；英文 → 繁中（同今天）；日文 → 日文字幕＋繁中翻譯。做完可單獨上線（修掉簡體字幕）。

**C15 會後整理＝產物鏈，進工作區**
- `run_pipeline_phase1`（`pipeline.py:100`）改成依產物執行：每一步先看 job 資料夾有沒有它的產物（`transcript.json`、講者結果），有就跳過並在進度寫「沿用聆聽結果」。合併與幻覺偵測一律跑（CPU、幾秒）。`_finalize_from_minutes`（`pipeline.py:246`）不動。
- 新 `lib/postmeeting.py`（只做轉接，不含流程）：`session.json` 的 lines → `transcript.json` 的 segments `{id,start,end,text,avg_logprob,no_speech_prob,speaker?}`（辨識分數用中性值，`backend` 註明「聆聽 Gemini／本機」）；`audio_duration_sec`＝`join_wavs` 回傳值（`lib/ownvoice.py:126`），沒有錄音時＝最後一句的 end；有講者時另寫講者產物，`overlap_sec = None`（重疊語音只有 pyannote 算得出，`lib/diarize.py:101-117`；不填 0）。之後同一支 `run_pipeline_phase1` 接手，`srt`／`vtt`／`merged.txt`／`diarized.txt` 照常產生（心智圖 `app.py:320-329`、下載 `app.py:489-493`、同步 `lib/archive.py:84-91` 都靠它們）。
- 會議記錄的輸入：原文，有翻譯時附在括號裡（同 `lib/live/summary.py:44`）；來源說明註明「逐字稿來自即時辨識」與講者標籤來源（聲音來源／即時分群／pyannote）；講者名用逐字稿上的名字（`lib/summarize.py:40-42`、`:62-64` 的 A/B/C 說法一併改）。
- 入口一個選項物件（上傳、舊場次、聆聽場次共用）：講者分離、模型（固定清單驗證，今天 `app.py:190` 沒驗）、語言、同步、自動處理。`/api/ownvoice/import` 今天沒帶 `model`、`sync_drive`（`app.py:265-267`）一併補齊。
- 聆聽場次兩顆按鈕：「用聆聽的逐字稿（快）」「重新辨識（慢，large-v3）」。預設＝前者；旁檔 `dropped_sec` 超過門檻或有 `failed_lines` 時預設改後者並寫出原因。
- 顯卡：要跑轉錄或 pyannote 才取 `acquire_batch`（今天兩個端點一律取，`app.py:192`、`:247`）。
- 頁面：工作區新面板 `post`：場次清單（含「已整理」與最近一次的下載）、**工作清單**（`jobs/` 裡所有 job，含等待貼上摘要的，可續做與下載；今天舊頁只記得當下那一個 `templates/index.html:346`）、上傳區、選項按鈕（不用下拉；舊頁 `templates/index.html:131` 的模型下拉同時改）、步驟進度、貼上摘要的人工回路。聆聽停止時字幕面板出現「整理這一場」，一鍵帶到這個面板。
- 測試：lines → segments（時間、空行、翻譯括號）；有逐字稿產物的 job 不呼叫轉錄（假函式計數 0）、沒有講者產物時呼叫一次 diarize、有講者產物時 0 次；舊場次（無旁檔）走完整流程；沒有錄音的場次不呼叫 diarize；`dropped_sec` 超門檻時預設＝重新辨識。
- 驗收：同一場聆聽存檔分別用兩顆按鈕各跑一次 → 都產出分角色逐字稿＋會議記錄＋PPT，回報兩者耗時；上傳一個影片檔在新面板跑完＝舊頁結果；一個舊的等待摘要 job 在新面板續做完成。

**C16 輸出目的地**
- 設定加：錄音存檔資料夾（預設＝今天的 `ownvoice.base_dir()`）；輸出目的地 0～N 個（名稱、資料夾、「預設同步」開關），子資料夾規則沿用 `lib/archive.py`。資料夾欄位旁有「檢查」與快捷按鈕，不用下拉。
- 路徑一個正規化函式：設定檔存 Windows 寫法；伺服器跑在 WSL2 時（`start_server.ps1:16`、`:27-31`、`:49-67`）轉 `/mnt/<碟>`，碟沒掛載時說清楚。`sync_to_drive`（`lib/archive.py:48`）改收目的地參數，不再讀模組常數。
- 錄音存檔資料夾不可在雲端同步資料夾底下（錄音不出這台電腦，`lib/archive.py:7-9` 的原則）：偵測到就拒絕並說明；雲端資料夾的快捷按鈕只出現在輸出目的地。
- 換存檔資料夾不讓舊場次消失：`ownvoice.sessions()`（`lib/ownvoice.py:60-74`）讀所有已知根目錄（現在設定的、OwnVoice app 的、用過的），每筆帶來源。
- 多目的地：job 開始時把選定的目的地清單寫進 `status.json`（今天是一個布林 `pipeline.py:115-116`，`:283-296` 讀）；每個目的地各記結果；單一目的地內一個檔失敗繼續複製其餘（今天 `lib/archive.py:113-115` 第一個失敗就回）。
- 舊資料：`MEETING_DRIVE_BASE` 第一次讀取時轉成一個目的地（預設同步關＝今天要勾才同步）。
- 測試：路徑正規化（Windows／WSL）；兩個目的地一個失敗另一個仍寫入；存檔資料夾在同步資料夾下被拒；換資料夾後舊場次仍列出；環境變數轉入一次不重複。
- 驗收：設暫存資料夾為目的地 → 會後整理產出出現在那裡。

**C17 我／對方**
- 頁面：`startAudio`（`templates/workspace.html:308-345`）兩路各一個 AudioWorklet，不混音（`:326`）；`start` 帶 `proto: 2`；兩路各自選 Gemini／本機。兩路都開時預設＝我本機、對方 Gemini（操作者 2026-11-25 採用的省錢組合）。
- 伺服器：`_supervise`（`lib/live/hub.py:272-326`）抽成 `Channel`；binary 解析依協定版本（`lib/live/hub.py:421-422`；長度與來源值驗證，壞包丟棄）；顯卡規則依架構定案；錄音雙聲道（今天存檔器只有一條單聲道寫入路徑 `lib/live/archive.py:249-260`）。`join_wavs` 已不限聲道數；`diarize`（`lib/diarize.py:38` 會混成單聲道）加「只取對方聲道」參數。
- 回音守衛：「我」路的句子若與同時間「對方」路聲音包絡相關 ≥ 門檻 → 丟棄（門檻以實測定，寫在常數旁）。
- 字幕列標「我」「對方」（主題 token）；旁檔 `who`；逐字稿 `speaker`＝「我」或對方講者名。
- 測試：協定解析（壞包、未知來源、沒帶 `proto` 的舊頁照今天處理）；回音守衛；只開一路＝今天的事件序列。
- 驗收：雙聲道測試錄音（含一段只有喇叭回音）→ 標籤正確、回音不出現在「我」。

**C18 即時分出對方每個人**
- 第一步實測：pyannote 4.0.7 聲紋模型能否用現有 `HF_TOKEN` 在本機顯卡載入、每句耗時（目標 < 100 ms）。不行就停卡回報，不換供應者。
- 新 `lib/live/speakers.py`：對方路環形緩衝 60 秒（以取樣位置索引）；句子 FINAL 時取窗 → 向量 → 與各講者中心餘弦比對；< 1 秒的句子沿用前一句並標「推定」。
- 停止時用全場向量重新分群一次（不重跑聲音），編號依說話總長排，改過的名字依多數句對應保留；寫進旁檔 → C15 的鏈自動不跑 pyannote（不用改 C15）。
- 講者名可點改名；「記住這個聲音」存在 repo 之外：`%LOCALAPPDATA%\meeting-serviceoices.json`（WSL2 時經 C16 的路徑正規化；不在 `MS/`、不在任何同步資料夾；只存向量與名字），講者面板可刪，刪了就不再比對。
- 測試：分群純邏輯（兩群分開、短句沿用、改名保留）；刪除後不再比對（隱私守衛，突變一次）。
- 驗收：至少 3 人的真實錄音 → 回報每句標對比例；低於 80% 不上線，C15 繼續用 pyannote（功能不缺，只是多 2.5 分鐘）。
- 審查：聲紋是生物特徵，這張卡兩位審查員。

**C19 舊首頁退休**
- 新面板做得到舊頁全部（含找回舊 job）之後：首頁只留「會議工作區」入口；刪除清單寫在該卡 commit。舊 job 與 `status.json` 不動。

### 順序與驗證

- C12 → C13 → C14 → C15 → C16 → C17 → C18 → C19。一卡一 commit、critic 一次、`tools/feed.py` 真實鏈測一次，過了才換 8420。
- C15 做完＝兩個工具的結合成立（聆聽場次不重複轉錄；上傳照舊）。C17／C18 只是讓更多步驟被跳過，不改 C15。
- 撤回：每卡 `git revert`；旁檔與設定檔的新欄位舊程式會忽略。

### 進度（段 4）

- 批 1 完成：C12 `24af2d9cc`、C13 `486e1ae13`，合併 `ce19c86a1`。144→145 測試；真實 Gemini（8434，存檔）13 句、翻譯 +0.5–1.0 秒、`session.json` 13 句齊。
- 處理過的工人風險：Gemini 重連時清掉的音訊沒算進 `dropped_sec` → 改成 `Session.lost()` 一個出口（`lib/live/session.py`、`hub.py` `_put`、`stt_gemini.py` `_drain`）；閒置暫停時不送的聲音是靜音，不算遺失。
- 交給後面的卡：C14 語言欄位對照 `langs.py` 驗證（C13 只驗格式，`lib/settings.py:56-57`）、「只看中文」改成「只看翻譯」（偏好鍵 `zhOnly`）；C15 Gemini 場次配 pyannote 前用發聲區段重新對齊（見架構定案）。
- 接受不改：舊瀏覽器兩個標頭都不帶時跨站守衛放行（`app.py:52-56`，現行瀏覽器跨站寫入都帶 `Origin`）；`lib/diarize.py:58-66` 用路徑載入 `settings.py`（另一專案單獨載入 `diarize.py`）；麥克風／電腦聲音／只看中文留在瀏覽器（各台裝置不同）。

### 派工（操作者 2026-11-26 批准；監工＝主 session）

- 工人各在自己的 worktree 做、commit 在自己的分支；監工讀 diff、跑測試、合併進 `main`、在 8431 跑 `tools/feed.py` 真實鏈測。每批全部回來後一起看 RISKS，處理完才換 8420。
- 批 1（平行）：C12｜C13。批 2：C14｜C15（`lib/summarize.py` 的改動全歸 C15，含 C14 寫的會議記錄語言那一條）。批 3：C16｜C17。批 4：C18，之後 C19。
- 同批兩卡都會動 `templates/workspace.html`、`lib/live/hub.py`、`app.py`：各改各的區塊，不重排、不改對方區塊。
- 進度只記在本檔「進度」一節。

### 未證實（要實測）

- Gemini 文字到達時間與實際發聲位置的差（決定聆聽逐字稿配 pyannote 的標籤準不準）。
- 聆聽逐字稿（Gemini 句子）與 large-v3 重新辨識的品質差距：C15 驗收時同一場各跑一次，兩份給操作者看。
- 即時講者準確度、前 1–2 分鐘與短句錯誤率；聲紋模型能否載入；與本機辨識同用顯卡的延遲。
- 回音守衛門檻。
- Gemini 自動語言時拉丁語系之間分不出，同語言不翻譯只對已選語言或非拉丁文字有效。
