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
