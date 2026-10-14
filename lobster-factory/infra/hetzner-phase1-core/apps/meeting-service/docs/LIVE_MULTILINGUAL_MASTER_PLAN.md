# Meeting Service — 即時多國語言逐字稿 主計畫（v1.0，2026-09-25）

> 讀者：操作者（§A 一頁摘要）＋執行本計畫的 AI（§0 起，卡片可由任何模型照抄執行）。
> 路徑縮寫：`MS` = `lobster-factory/infra/hetzner-phase1-core/apps/meeting-service`；`COS` = `Projects/internal/cognitive-engineering-os`。
> 卡片協定沿用 `COS/docs/RESEARCH_LINES_MASTER_PLAN.md` §12（一卡一 commit；驗收指令是唯一完成判準；不改指令配合結果；卡住＝停＋問一題）。

## §A 給操作者的一頁摘要

**做什麼**：會議中邊講邊出逐字稿（實體＋線上、多國語言），結束後對完整錄音再跑一次現有流程，得到準確的正式逐字稿、講者標籤、會議記錄、PPT、Word、Excel、報告教練。全程本機、零費用、音檔不離開筆電。

**兩層品質（核心設計）**
1. **會議中＝即時草稿**：用來跟上討論，不追求完美。斷在說話停頓處，最長 20 秒一段。
2. **會議後＝正式版**：整段錄音重跑，這份才是交付物。

**不承諾 99%**。沒有任何系統能保證；本計畫做的是「把準確度變成量得出來的數字」（§4），先量基線、每個改進都要有數字證明。你之前說要 99%，我們用實測結果誠實回報，不用行銷數字。

**你已經有的（不用買）**：講者分離、PPT／Word／Excel、報告教練、Ollama 本機模型（llama3.1:8b、gemma3:4b，皆非中國廠商）。
**缺的（這份計畫要做）**：多國語言、即時串流、專有名詞、錄音頁面、準確度評測、隱私把關。
**本計畫不做（第一版）**：即時翻譯／口譯、浮動字幕、即時講者標籤（原因見 §7）。

**需要你提供／決定**（§2 待拍板）：會議用哪幾種語言；一段 5 分鐘、有你會遇到的語言組合的真實錄音＋你校對過的正確逐字稿（做基線）；錄音同意提示的文字；逐字稿是否要送進 cognitive 網站（預設：不送，你自己複製）。

## §0 進度板（每張卡 commit 時同步這五行）

- 現在卡：（未開工，等操作者「開工」）
- 已完成：0 / 19（P0：3｜P1：6｜P2：7｜P3：3）
- 最後 commit：—
- 阻塞：WC-LM-02 需操作者提供音檔與校對稿
- 下一步：WC-LM-00

## §1 現況發現（全部已讀檔驗證，`file:line`）

| # | 發現 | 位置 | 影響 |
|---|---|---|---|
| F1 | 語言寫死中文，提示詞中文 | `MS/lib/transcribe.py:139-140`、`:21` | 別種語言被硬當中文猜 |
| F2 | 每個 job 都重新載入 3GB 模型 | `MS/lib/transcribe.py:132`（`pick_device` 在 `transcribe()` 內） | 即時版必須常駐模型 |
| F3 | 幻覺偵測用「字元數／秒」，門檻 12／9 是中文口語值 | `MS/lib/hallucination.py:13-14`、`:27` | 英文正常語速（約 14 字元／秒）會被誤判為不可能語速 |
| F4 | 段落合併只認 CJK 範圍，日文假名、韓文會被插入多餘空白 | `MS/lib/merge_segments.py:31` | 日／韓輸出品質 |
| F5 | 摘要 prompt 宣告輸入是繁體中文逐字稿 | `MS/lib/summarize.py:56` | 多語言輸入要改措辭 |
| F6 | `tests/test_vtt.py` import 的 `fmt_vtt_ts`／`write_vtt` 在 HEAD 不存在 → **現有測試是紅的**；`app.DOWNLOADS` 無 `transcript_vtt` | `MS/tests/test_vtt.py:6`、`MS/lib/transcribe.py`（僅 `fmt_srt_ts`／`write_srt` `:175-184`）、`MS/app.py:164-173` | 補丁在 commit `670117985`（是 HEAD 的祖先），內容未進 HEAD；遺失原因未查 |
| F7 | `tests/` 沒有 `__init__.py`，`python -m unittest discover -s tests -t .` 直接 ImportError | `MS/tests/` | 無法一鍵跑全部測試 |
| F8 | **第二個消費者**：cognitive 專案用檔案路徑載入本服務的 `transcribe.py`、`diarize.py`，並依賴 `pick_device(model_name, log)`、`preflight(path, log)`、`diarize(audio_path, rows, None, log)` 這三個簽名 | `COS/ai_lego/modules/knowledge/ingest/transcription.py:163-169`、`:229`、`:237`、`:249` | 這三個簽名凍結，改壞＝cognitive 全真堆疊壞 |
| F9 | 上傳流程整批處理，無串流入口；`/api/upload` 上限 500MB；僅綁 127.0.0.1 | `MS/app.py:29`、`:49-93`、`:192` | 需新增即時端點 |
| F10 | 長任務曾因筆電睡眠遺失整個 job（2026-08-18）；已有 `keep_awake` | `MS/lib/keep_awake.py:1-15`、`MS/pipeline.py:117` | 即時錄音必須邊錄邊落地、且防睡眠 |
| F11 | faster-whisper 1.2.1 已提供 `multilingual`、`hotwords`、`language_detection_threshold`、`language_detection_segments`；`faster_whisper.vad.get_speech_timestamps` 可用；`_LANGUAGE_CODES` 共 100 個 | `MS/requirements.txt`（`faster-whisper==1.2.1`）；本機 `inspect.signature` 實測 | 不必新增任何 pip 依賴 |
| F12 | GPU：RTX 5060 Laptop 8151 MiB；模型快取有 large-v3、medium（無 turbo）；Ollama 有 llama3.1:8b（4.9GB）、gemma3:4b（3.3GB） | `nvidia-smi`、`ollama list` 實測 | 顯存要與 Ollama 分時，見 D5 |
| F13 | 摘要 API 選項會把逐字稿送到外部（頁面已有警語） | `MS/templates/index.html:97-104` | 隱私設計要延續此警語 |

**未讀／未驗證（動工時第一步要補）**：`lib/diarize.py`、`lib/word.py`、`lib/deck.py`、`lib/excel.py`、`lib/speaker_notes.py` 內部是否還有中文假設（grep 只搜到 `word.py:47` 的 `WPM_ZH = 240`，屬輸出端，v1 輸出維持繁中故不影響）；`start_server.ps1`／`start_server.sh` 對常駐模型的影響（WSL2 與 Windows 兩條路）。

## §2 決策（D 已定案不重問；Q 待操作者拍板）

| # | 決策 | 理由 |
|---|---|---|
| D1 | 前端取字用**輪詢**（每 1 秒 `GET /transcript?since=`），不用 WebSocket | 現有 `poll()` 已是輪詢（`index.html:302`）；WebSocket 需 `uvicorn[standard]`，`requirements.txt` 只有純 `uvicorn`；零新依賴 |
| D2 | 收音用 **AudioWorklet 送 16kHz 單聲道 PCM16**，不用 MediaRecorder | MediaRecorder 分段只有第一段有檔頭，其餘不能單獨解碼；PCM 無編碼延遲、可在停頓處切、直接落地成 WAV |
| D3 | 模型維持 **large-v3 常駐**，turbo 等基線量完再評估 | 已在快取；F2 |
| D4 | **輸入多語言、輸出（會議記錄／PPT／教練稿）維持繁體中文**；引文保持原語言 | `summarize.py` rule 4（引文須逐字）＋ `word.py:47`、rule 7 的 240 字／分鐘皆為中文；輸出多語言是另一個專案 |
| D5 | **GPU 互斥**：即時錄音期間，批次上傳回 409；Ollama 只在會議後或使用者按鈕時呼叫 | 8GB 顯存：large-v3 fp16 約 3GB＋llama3.1:8b 4.9GB 會爆；gemma3:4b 3.3GB 或可並存，**未實測**，列 WC-LM-30 |
| D6 | 第一版**不做即時翻譯**；翻譯走會後貼給 Claude／本機 Ollama | Whisper 內建翻譯只能翻成英文；即時翻譯品質與顯存都未驗證 |
| D7 | 批次流程預設語言**維持 `zh`**（行為位元組級不變）；即時錄音預設 `auto` | 保護既有使用者與 F8 |
| D8 | **零新增 pip 依賴**；評測指標自己寫（標準庫＋numpy） | 降低供應鏈與 SAC 風險（README「執行環境」） |
| D9 | 即時草稿**不做講者分離**；會後正式版才有 | pyannote 需完整音檔；且與轉錄搶顯存 |
| D10 | 逐字稿進 cognitive 網站＝**做法 A（人工複製貼上）**，不串接 | 隱私：音檔留本機的承諾（`README.md:3`）；串接列 P4 |
| Q1 | 會議會用哪幾種語言？ | 決定 UI 預設清單、評測語料 |
| Q2 | 是輪流換語言，還是同一句話夾雜？ | 夾雜的準確度未知（R1）；決定要不要為夾雜情境調參 |
| Q3 | 錄音同意提示要寫什麼？（預設見 §9） | 各地錄音同意法規不同 |
| Q4 | 錄音檔預設保留多久／要不要會後自動刪原始錄音？ | 隱私（儲存限制原則）；預設：永久保留，提供手動刪除鈕（WC-LM-26） |

## §3 標準與方法對照（誠實範圍：採用這些標準的**量測方法與設計原則**；不主張任何認證或合規聲明）

| 面向 | 採用的標準／慣例 | 本計畫怎麼落地 |
|---|---|---|
| 轉錄準確度 | WER／CER（Levenshtein 對齊，替換＋刪除＋插入）；計分慣例參照 NIST sclite；夾雜語言用 MER（混合錯誤率：CJK 逐字、拉丁字母逐詞） | `lib/asr_eval.py`（WC-LM-01）；正規化規則見 §4.2 |
| 產品品質模型 | ISO/IEC 25010 品質特性（功能適合性、效能效率、相容性、易用性含無障礙、可靠性、安全性、可維護性、可攜性） | §4.3 對照表，每項有量測法 |
| 無障礙（UI 本身） | WCAG 2.2：SC 1.4.3 對比（AA）、SC 1.4.4 文字縮放 200%、SC 4.1.3 狀態訊息（`aria-live`） | WC-LM-24 驗收 |
| 語言標記 | ISO 639-1 二字母碼（Whisper 使用）；輸出中繼資料用 BCP 47 | `lib/languages.py`（WC-LM-11） |
| 瀏覽器擷取 | W3C Media Capture and Streams、Web Audio（AudioWorklet）、`getDisplayMedia` 音訊擷取（屬瀏覽器／作業系統相依，動工時實測） | WC-LM-24 |
| 隱私設計（指引，非法律意見） | GDPR 第 5 條原則（目的限制、資料最小化、儲存限制）、第 6／7 條同意；聲音屬個人資料；講者分群不等於身分辨識但仍標註 | §9；同意閘、刪除鈕、資料只在本機 |
| 測試流程 | 需求→卡→測試可追溯（§6）；突變證據（拔守衛→指名測試變紅→還原變綠），沿用本 repo 標準 | 每卡「突變」欄 |

## §4 量測定義（把「品質好」變成數字）

### 4.1 指標與門檻（**暫定，基線量完後由 WC-LM-02 的期末閘改成定值**；不得事後放寬）
| 指標 | 定義 | 暫定門檻 |
|---|---|---|
| 正式版準確度 | 在 §4.4 語料上，該語料的 CER（中日）／WER（其他）／MER（夾雜） | **不低於現有批次流程基線**（無退步）；每個準確度改進卡須附前後數字 |
| 草稿顯示延遲 | 「該段最後一個字被說出」到「頁面顯示該段」的時間 | p50 ≤ 10 秒、p95 ≤ 25 秒（段長上限 20 秒＋推論；停頓切段時更短） |
| 推論效率 | 單段推論耗時 ÷ 該段音訊長度 | ≤ 0.5（GPU 7 倍速下理論約 0.14；留一倍餘裕） |
| 音訊落地 | 收到音訊到寫進磁碟的時間 | ≤ 1 秒（防睡眠／崩潰遺失，F10） |
| 幻覺 | 沿用 `hallucination.suspect_ids`；多語言版誤判率＝純英文語料上被標可疑的比例 | 純英文語料誤判 < 1%（F3 修好後） |
| 穩定性 | 連續錄音 5 小時、無記憶體單調成長、無音訊缺口 | 缺口 0（以 `X-Seq` 連號驗證） |

### 4.2 評測正規化（寫死在 `lib/asr_eval.py` 與測試裡）
1. Unicode NFKC；英文轉小寫；移除標點與空白差異。
2. 標記化：CJK（漢字、假名、諺文）**逐字**；拉丁字母**逐詞**（連續字母數字為一詞）。
3. 參考稿必須是繁體中文（中文部分）；系統輸出**不做簡繁轉換**，簡體輸出計為錯誤（因為提示詞本來就要求繁體）。
4. 分數＝（替換＋刪除＋插入）÷ 參考稿詞數；報告同時列三項分量。

### 4.3 ISO/IEC 25010 對照
| 特性 | 本計畫指標 |
|---|---|
| 功能適合性 | §4.1 準確度、語言覆蓋（`_LANGUAGE_CODES` 100 種可選；實測語言清單見 Q1） |
| 效能效率 | 延遲、推論效率、顯存峰值（`nvidia-smi` 取樣） |
| 相容性 | F8 三個簽名凍結；`transcript.json` 只增不改欄位 |
| 易用性／無障礙 | WCAG 2.2 SC 1.4.3／1.4.4／4.1.3；操作 ≤ 3 步開始錄音 |
| 可靠性 | 崩潰／睡眠／瀏覽器關閉後可救回已送出的音訊（WC-LM-25） |
| 安全性 | 僅綁 127.0.0.1；路徑穿越防護；錄音同意閘；刪除鈕 |
| 可維護性 | 每模組純函式＋注入式假模型可測；零新依賴 |
| 可攜性 | Windows 原生與 WSL2 兩條啟動路徑都驗（WC-LM-31） |

### 4.4 評測語料（本機，不進 git）
- 語料 A：純中文會議 5 分鐘；B：純英文 5 分鐘；C：操作者實際會遇到的語言組合，輪流換語言 5 分鐘；D（若 Q2 有夾雜）：同句夾雜 5 分鐘。
- 每份需**人工校對過的參考稿**（操作者提供，或操作者抽查修正系統產出的稿；抽查率與修正紀錄寫進評測報告）。
- 選配：公開多語言語料（如 FLEURS，朗讀語音）做跨語言對照——它是朗讀不是會議，只當補充，不取代 A–D。

## §5 架構

```
瀏覽器（127.0.0.1:8420）
  麥克風 ─┐
  分享分頁/系統音訊 ─┴→ AudioContext 混音 → AudioWorklet(16k mono PCM16, ~0.5s/包, X-Seq 連號)
                                              │ POST /api/live/{id}/audio
                                              ▼
  app.py ── LiveSession ── ① 追加寫 jobs/<id>/live.wav（≤1s 落地）
                        └─ ② Endpointer（silero VAD：停頓≥0.6s 且語音≥1s 即切；≥20s 強制在最低能量處切）
                              └→ 常駐 large-v3（language=auto|指定, hotwords, 前文尾巴 ≤200 字當 prompt）
                                   └→ live_transcript.jsonl（seq, t0, t1, text, lang, wall_ms）
  瀏覽器 ← GET /api/live/{id}/transcript?since=N（輪詢 1s）→ 頁面滾動顯示＋語言標籤
  按「結束」→ POST /api/live/{id}/stop → 補 WAV 檔頭 → run_pipeline_phase1(job_dir, live.wav)
       └→ 既有：轉錄→合併→幻覺偵測→講者分離→prompt→貼上摘要→PPT/Word/Excel/教練稿
```
即時階段**不寫入** `transcript.json`（正式版由批次流程產生），避免草稿冒充正式版。

## §6 需求→卡→驗證 可追溯矩陣

| 需求 | 卡 | 驗證 |
|---|---|---|
| 多語言（批次） | WC-LM-10/11/12/13/14/15 | 單元測試＋語料 B、C 基線對照 |
| 即時草稿 | WC-LM-20/21/22/23/24 | 假模型單元測試＋Playwright 假音訊 E2E＋WC-LM-30 重播 |
| 專有名詞 | WC-LM-11（hotwords） | 語料 C 含專有名詞，前後 CER 對照 |
| 準確度量測 | WC-LM-01/02/30 | 已知答案測試＋基線報告 |
| 可靠性 | WC-LM-22/23/25 | 缺口、崩潰救回測試 |
| 隱私 | WC-LM-24/26 | 同意閘、刪除、路徑穿越測試 |
| 不破壞既有 | WC-LM-00、每卡共同前置 | 全測試綠＋F8 契約測試 |

## §7 風險登錄（R#）

| R | 風險 | 處置 |
|---|---|---|
| R1 | 同句中英夾雜，Whisper 準確度未知，可能整句被判單一語言 | `multilingual=True` 實測；語料 D；若不合格，文件誠實標註限制，不宣稱支援 |
| R2 | 短句自動偵測語言常錯 | `language_detection_threshold`／`language_detection_segments` 調參；UI 保留手動鎖定語言 |
| R3 | 顯存互搶（F12） | D5 互斥；WC-LM-30 實測 gemma3:4b 能否並存，未實測前不宣稱 |
| R4 | `getDisplayMedia` 系統／分頁音訊可用性依瀏覽器與 OS，使用者可能忘記勾「分享音訊」 | WC-LM-24 偵測無音訊軌時明確警告；實測 Chrome／Edge |
| R5 | 沒戴耳機時麥克風收到喇叭聲＋分享音訊，雙重收音 | UI 提示；不做回聲消除（列已知限制） |
| R6 | 背景分頁被瀏覽器降頻（計時器）→ 上傳延遲 | 用戶端緩衝＋`X-Seq` 補傳；Worklet 在音訊執行緒不受影響 |
| R7 | 幻覺門檻（拉丁詞／秒）為暫定值 | WC-LM-12 標明暫定；WC-LM-02 語料校準後寫死 |
| R8 | 磁碟：5 小時 ≈ 576 MB WAV（16000×2 B×18000 s） | 開始前檢查剩餘空間 ≥ 5GB；上限 5 小時 |
| R9 | 遺失的 VTT 補丁（F6）暗示 merge `91fdfe31a` 可能還丟了別的變更 | WC-LM-00 只補 VTT；另在 TASKS.md 開一行「稽核該 merge 是否漏帶其他檔案」（不在本計畫範圍） |
| R10 | 第二消費者 F8 被改壞 | 每卡共同前置含 F8 契約測試（WC-LM-00 建立） |
| R11 | 顯卡上同時載兩份 large-v3（即時常駐＋批次 `pick_device`） | D5 互斥＋常駐模型與批次共用同一份（WC-LM-20） |

## §8 便宜模型執行規則（每張卡）
沿用 `COS/docs/RESEARCH_LINES_MASTER_PLAN.md` §12.1：讀卡上列的 `file:line`，要改的檔整檔讀；照樣板抄；驗收指令逐條跑；突變欄必做；commit 後 WORKLOG 四行證據（經 `scripts/worklog-insert-entry.py` 與 `scripts/git-partial-worktree-commit.py`，見 AGENTS.md §8）；審查者不得是寫這段的模型。**共同前置（每卡先跑）**：
```
cd lobster-factory/infra/hetzner-phase1-core/apps/meeting-service
git log --oneline -5
python -m unittest discover -s tests -t . -q      # WC-LM-00 完成後必須綠；之前 = 已知紅（F6/F7）
```
**禁區（遇到就停、問一題）**：改 `pick_device`／`preflight`／`diarize` 簽名（F8）；改 `transcript.json` 既有欄位；新增 pip 依賴；碰 `agency-os/`、`next-admin/`、prod 主機；把即時草稿寫進 `transcript.json`。

## §9 隱私與同意（設計指引，非法律意見）
- 音訊與逐字稿只存本機 `MS/jobs/<id>/`（`.gitignore` 已排除 `jobs/*`）。
- **錄音前的同意閘**：開始錄音按鈕在勾選「我已取得所有與會者的錄音同意」前保持停用；勾選時間寫進 `live_meta.json`。預設文字（Q3 可改）：「錄音前請確認所有與會者知情並同意。各地法規對錄音同意的要求不同，部分地區需要所有參與者同意。」
- 刪除鈕（WC-LM-26）：刪整個 job 目錄。
- 摘要「自動處理（API）」選項延續現有警語（F13）；即時功能本身不對外連線。

## §10 分期與工作卡

期別：**P0** 清債＋量測基線／**P1** 多語言批次／**P2** 即時錄音／**P3** 驗證與交付。每期最後一張為期末閘（重跑全期驗收、突變、更新 §0／TASKS／WORKLOG；過了才開下一期）。P4 見 §11。

### P0 清債與基線

**WC-LM-00 修好紅測試＋讓 discover 可跑＋凍結 F8 契約**
- 目標：全測試綠；`pick_device`／`preflight`／`diarize` 簽名有測試守著。
- 前置：`cd MS && python -m unittest tests.test_vtt` → 目前 `FAILED (errors=1)`（記下這個當前狀態）。
- 讀：`MS/tests/test_vtt.py` 全檔；`MS/lib/transcribe.py:175-184`；`MS/app.py:164-173`；`MS/pipeline.py:23-24`、`:122-124`；`git show 670117985 -- MS/app.py MS/lib/transcribe.py MS/pipeline.py`（三處補丁全文）。
- 樣板：上述 `git show` 的補丁（原封補回，不改寫）。
- 改：`MS/lib/transcribe.py`（補 `fmt_vtt_ts`、`write_vtt`）；`MS/app.py`（`DOWNLOADS` 補 `transcript_vtt`）；`MS/pipeline.py`（import 補 `write_vtt`、`:124` 後補呼叫）；新增 `MS/tests/__init__.py`（空檔）；新增 `MS/tests/test_contract_f8.py`：用 `inspect.signature` 斷言 `pick_device(model_name, log=...)`、`preflight(path, log=...)`、`diarize.diarize(...)` 的參數名與順序＝現況（先讀 `MS/lib/diarize.py` 該函式簽名再寫死）。
- 不改：任何其他行為。
- 驗收：`cd MS && python -m unittest discover -s tests -t . -q` → `OK`（0 failures, 0 errors）；`grep -c "write_vtt" MS/pipeline.py` ≥ 2。
- 突變：刪 `fmt_vtt_ts` 內 `.replace(",", ".")` → `test_timestamp_handles_hour_boundary` 紅；把 `pick_device` 簽名加一個必填參數 → `test_contract_f8` 紅；各還原變綠。
- commit：`fix(meeting-service): restore lost VTT writer (670117985 content) + make tests discoverable + freeze pick_device/preflight/diarize contract for cognitive-os`。回滾：`git revert`。

**WC-LM-01 評測工具 `lib/asr_eval.py`**
- 目標：CER／WER／MER 計分，已知答案測試證明正確。
- 讀：§4.2；`MS/lib/hallucination.py:1-20`（檔頭 docstring 風格）；`MS/tests/test_vtt.py:1-15`（測試風格）。
- 樣板：`MS/lib/hallucination.py`（純函式、無副作用）。
- 改（新）：`MS/lib/asr_eval.py`：`normalize(text)`、`tokenize(text)`（CJK 逐字、拉丁逐詞）、`edit_ops(ref_tokens, hyp_tokens) -> (sub, dele, ins)`（動態規劃）、`score(ref, hyp) -> {"rate","sub","del","ins","ref_len"}`、CLI：`python -m lib.asr_eval REF.txt HYP.txt` 印 JSON。
- 改（新）：`MS/tests/test_asr_eval.py`，必含以下**已知答案**：
  - ref `今天開會` / hyp `今天會議` → rate 0.5、sub 2、del 0、ins 0
  - ref `the cat sat` / hyp `the cat sat down` → rate 1/3（0.3333）、ins 1
  - ref `我們用 Kubernetes 部署` / hyp `我們用 kubernetes 佈署` → 6 詞、sub 1、rate 0.1667（大小寫正規化、`部→佈`算一次替換）
  - ref 空字串 → 不得除以零（回傳 `ref_len: 0`，rate 為 `None`）
- 驗收：`python -m unittest tests.test_asr_eval -v` 全綠（≥ 6 案）。
- 突變：把 `del` 與 `ins` 計數對調 → 第二案紅；拿掉 NFKC 正規化 → 第三案紅。
- commit：`feat(meeting-service): asr_eval — CER/WER/MER with known-answer tests`。回滾：刪兩檔。

**WC-LM-02 語料與基線（阻塞：需操作者音檔＋校對稿）**
- 目標：現有批次流程在語料 A–D 的基線數字，寫成報告。
- 前置：操作者提供語料（§4.4）放在 `MS/eval/corpus/`（`.gitignore` 加 `eval/corpus/`）；`MS/eval/corpus.yaml` 記錄每檔的語言、參考稿路徑。
- 讀：`MS/lib/transcribe.py:127-172`（`transcribe()` 回傳結構）；WC-LM-01 成品。
- 改（新）：`MS/eval/run_baseline.py`：對每個語料呼叫現有 `transcribe(path, "large-v3")`，用 `asr_eval.score` 對參考稿計分，輸出 `MS/eval/reports/baseline-YYYYMMDD.json`＋一頁 markdown 表（每語料：指標、分量、RTF、backend）。**不改 `transcribe.py`**。
- 驗收：`python eval/run_baseline.py` 跑完、報告檔存在、表內每列有數字。
- 期末閘（P0）：報告數字寫回本檔 §4.1（把「暫定」換成基線值），操作者看過。
- commit：`docs(meeting-service): ASR baseline on operator corpus`。回滾：刪報告。

### P1 多語言批次（每卡都須維持：純中文輸入的輸出與現況位元組級相同）

**WC-LM-10 文字系統工具 `lib/scripts.py`**
- 目標：判斷字元屬於哪種文字系統，供幻覺偵測與合併使用。
- 讀：`MS/lib/merge_segments.py:31`（現有 CJK 判斷）；`MS/lib/hallucination.py:22-31`。
- 改（新）：`MS/lib/scripts.py`：`script_of(ch) -> "han"|"kana"|"hangul"|"latin"|"other"`（範圍：漢字 U+4E00–9FFF 與 U+3400–4DBF；假名 U+3040–30FF；諺文 U+AC00–D7AF 與 U+1100–11FF；拉丁字母以 `str.isalpha()` 且非上述者）；`speech_units(text) -> int`（CJK 類每字 1 單位；拉丁類每個連續字母數字為 1 單位）；`dominant_script(text) -> str`。
- 改（新）：`MS/tests/test_scripts.py`（各文字系統各 ≥ 2 案＋混合案＋空字串）。
- 驗收：`python -m unittest tests.test_scripts -v` 全綠。
- 突變：把假名範圍上界從 U+30FF 改成 U+30FE → 以 U+30FF 的字元（「ヿ」）為輸入的測試紅；還原變綠。
- commit：`feat(meeting-service): scripts — script classes and speech units`。

**WC-LM-11 轉錄參數化（語言、專有名詞、多語言）**
- 目標：`transcribe()` 可指定語言／hotwords／multilingual，**預設行為不變**。
- 讀：`MS/lib/transcribe.py` 整檔；`MS/pipeline.py:100-121`；F8 契約測試。
- 改：`MS/lib/transcribe.py`：`LANG_PROMPTS = {"zh": ZH_PROMPT, "auto": <中性多語提示詞>, ...}`（提示詞是**資料**，採用前必須在 WC-LM-02 語料上比較前後 CER，未比較不得改 `zh` 以外的預設）；`transcribe(media_path, model_name="large-v3", log=print, language="zh", hotwords=None, multilingual=False)`；`language="auto"` → 傳 `language=None`；`initial_prompt=LANG_PROMPTS.get(language)`；`hotwords` 空字串視為 `None`；回傳 dict **只新增**鍵（`requested_language`、`multilingual`、`hotwords_used`），既有鍵不動。
- 改（新）：`MS/lib/languages.py`：`SUPPORTED = set(faster_whisper.tokenizer._LANGUAGE_CODES) | {"auto"}`、`validate(code) -> str`（不合法丟 `ValueError`）。
- 改（新）：`MS/tests/test_transcribe_params.py`：以假 `WhisperModel`（注入替身，記錄收到的 kwargs）驗：預設呼叫的 kwargs 與改動前完全相同（`language="zh"`、`initial_prompt=ZH_PROMPT`）；`language="auto"` → `language=None`；`hotwords="Kubernetes"` 有傳；非法語言碼被 `validate` 擋。
- 不改：`pick_device`、`preflight` 簽名與內容。
- 驗收：全測試綠；`python -c "import lib.languages as l;print(len(l.SUPPORTED))"` → `101`。
- 突變：把預設 `language` 改成 `"auto"` → 「預設 kwargs 不變」測試紅。
- commit：`feat(meeting-service): transcribe language/hotwords/multilingual params, default behaviour unchanged`。

**WC-LM-12 幻覺偵測多語言化**
- 目標：英文正常語速不再被誤判（F3），純中文結果不變。
- 讀：`MS/lib/hallucination.py` 整檔；`MS/lib/scripts.py`。
- 改：`analyse()`（`:19-31`）依 `scripts.dominant_script(txt)` 分支：han／kana／hangul 主導 → 維持 `len(txt) / dur` 與 `MAX_CPS=12.0`、`WARN_CPS=9.0`（與現況完全相同，確保位元組級不變）；拉丁主導 → `speech_units(txt) / dur` 與新常數 `MAX_WPS=7.0`、`WARN_WPS=5.5`（**暫定**，WC-LM-02 語料校準後寫死；註解一行標明暫定＋語料出處）。
- 改（新）：`MS/tests/test_hallucination_multilang.py`：純中文舊 fixture 的 `suspect_ids` 結果與改動前相同（改動前先用現有程式跑一次把輸出貼成期望值）；英文 4 詞／秒正常語速 → 不被標；英文 9 詞／秒 → 被標 `impossible_rate`；重複偵測沿用。
- 驗收：全測試綠；`grep -n "MAX_WPS" MS/lib/hallucination.py` 有命中。
- 突變：把拉丁分支改回用 `len(txt)`（字元）→「英文正常語速不被標」測試紅。
- commit：`fix(meeting-service): hallucination rate by speech units — English speech no longer flagged as impossible`。

**WC-LM-13 段落合併支援假名與諺文**
- 讀：`MS/lib/merge_segments.py` 整檔。
- 改：`:31` 的「前一字與後一字皆為 CJK 就不加空白」改用 `scripts.script_of` 判斷（han、kana、hangul 都算 CJK 類）。`END_PUNCT`（`:10`）已含「。！？!?…」，本卡不改。
- 改（新）：`MS/tests/test_merge_segments.py`：中文兩段合併無空白（舊行為）；日文假名兩段合併無空白；英文兩段合併有空白；中英交界有空白。
- 驗收：全測試綠。突變：把假名從判斷式拿掉 → 日文案紅。
- commit：`fix(meeting-service): merge_segments — no spurious spaces between kana/hangul segments`。

**WC-LM-14 摘要 prompt 接受多語言輸入（輸出仍繁中）**
- 讀：`MS/lib/summarize.py:56-79`（`INSTRUCTIONS`）、`:99-119`（`build_prompt`）。
- 改：`:56` 首句改為「輸入是一份逐字稿（可能含多種語言、可能帶 A/B/C 講者標籤）；輸出一律使用繁體中文」；rule 4 補一句「引文保持原語言，不翻譯」。**規則編號與 rule 6／7／9 不動**（下游 `validate()` 與頁數對齊依賴）。
- 改（新）：`MS/tests/test_summarize_prompt.py`：`build_prompt` 含「多種語言」與「引文保持原語言」；仍含 rule 6 的頁數文字；`SCHEMA` 內容與改動前逐字相同（用改動前 `git show HEAD:...` 的字串當期望值）。
- 驗收：全測試綠。突變：刪掉 rule 4 新句 → 對應測試紅。
- commit：`feat(meeting-service): summary prompt accepts multilingual transcripts, output stays zh-TW`。

**WC-LM-15 上傳 API＋頁面的語言／專有名詞欄位**
- 讀：`MS/app.py:49-93`；`MS/templates/index.html:115-138`（上傳卡）、`:258-287`（`startBtn` 處理）；`MS/pipeline.py:100-121`。
- 改：`app.py` `upload()` 增 `language: str = "zh"`、`hotwords: str = ""`，用 `languages.validate` 驗（不合法回 400，訊息含允許清單長度）；`pipeline.run_pipeline_phase1` 增同名 kwargs 並傳給 `transcribe`；`index.html` 上傳卡 `:121-129` 那排 `opts` 加「語言」下拉（自動偵測、中文、English、日本語、한국어、其他…；預設中文＝現況）與「專有名詞（逗號分隔）」輸入；`startBtn` 的 fetch 網址帶上兩參數（值須 `encodeURIComponent`）。
- 改（新）：`MS/tests/test_upload_params.py`：用 `fastapi.testclient.TestClient`（httpx 已裝）＋ `unittest.mock.patch("app.run_pipeline_phase1")` 攔截，斷言 kwargs 收到 `language`、`hotwords`；非法語言碼回 400；不帶參數時 `language == "zh"`。
- 驗收：全測試綠；啟動服務後 `curl -s http://127.0.0.1:8420/ | grep -c hotwords` ≥ 1。
- 突變：拿掉 `validate` 呼叫 → 非法碼測試紅。
- commit：`feat(meeting-service): upload accepts language and hotwords`。
- **期末閘（P1）**：在語料 B、C 上重跑 WC-LM-02 腳本（`language=auto`／指定）對照基線，數字寫進 §4.1；純中文語料 A 必須與基線相同（位元組級：`transcript.json` 的 `segments[].text` 逐段相等，僅允許新增鍵）。

### P2 即時錄音

**WC-LM-20 GPU 閘與常駐模型**
- 目標：模型只載一次；即時與批次互斥（D5、R11）。
- 讀：`MS/lib/transcribe.py:86-106`（`pick_device`）；`MS/app.py:84-91`。
- 改（新）：`MS/lib/gpu_gate.py`：`acquire(kind: "live"|"batch") -> bool`、`release(kind)`、`active() -> str|None`（執行緒安全；已有 live 時 batch 回 False，反之亦然）；`MS/lib/live_model.py`：`get_model(name="large-v3")` 首次呼叫用**現有** `transcribe.pick_device` 載入並快取，回傳 `(model, backend)`；推論用一把 `infer_lock` 序列化。
- 改：`app.py` 的 `upload()` 開頭 `if not gpu_gate.acquire("batch"): raise HTTPException(409, "即時錄音進行中，請先結束錄音")`；批次執行緒結束（成功或失敗）必須 `release("batch")`（放在 `finally`）。
- 改（新）：`MS/tests/test_gpu_gate.py`（互斥、釋放、`finally` 路徑）。
- 驗收：全測試綠。突變：拿掉 `finally` 內的 `release` → 「失敗後仍可再上傳」測試紅。
- commit：`feat(meeting-service): gpu gate (live/batch mutual exclusion) + resident model holder`。

**WC-LM-21 端點偵測器 `lib/live_endpointer.py`**
- 目標：在說話停頓處切段；連續說話最長 20 秒強制切。
- 讀：F11（`faster_whisper.vad.get_speech_timestamps(audio, vad_options, sampling_rate)`、`VadOptions` 欄位 `threshold, neg_threshold, min_speech_duration_ms, max_speech_duration_s, min_silence_duration_ms, speech_pad_ms`）。
- 改（新）：`MS/lib/live_endpointer.py`：`class Endpointer(vad=None, sample_rate=16000, min_speech_s=1.0, silence_s=0.6, max_utterance_s=20.0)`；`feed(pcm_int16: np.ndarray) -> list[Utterance]`（`Utterance{start_s, end_s, audio_f32}`）；`flush() -> list[Utterance]`；`vad` 為可注入的 callable（預設包 `get_speech_timestamps`，測試注入假 VAD）。強制切點＝最後 5 秒內能量最低的 200ms 視窗。**時間戳用累計樣本數計算，不用 `time.time()`**（可重播、可測）。
- 改（新）：`MS/tests/test_live_endpointer.py`（假 VAD＋合成訊號）：靜音不出段；語音＋0.6 秒靜音出一段；連續 25 秒語音在 ≤20 秒處切且下一段無遺失樣本（總樣本守恆）；`flush()` 吐出殘留；輸入分成任意大小的包，結果相同（分包不變性）。
- 驗收：全測試綠。突變：把「總樣本守恆」的切點少留 1 個樣本 → 守恆測試紅。
- commit：`feat(meeting-service): live endpointer — pause-based utterance cutting, sample-accurate`。

**WC-LM-22 即時工作階段 `lib/live_session.py`**
- 目標：落地音訊、切段、轉錄、記錄，全部可用假模型測。
- 讀：WC-LM-20、21 成品；`MS/pipeline.py:41-97`（`write_status` 原子寫檔樣板）；`MS/lib/hallucination.py:19-31`。
- 改（新）：`MS/lib/live_session.py`：`LiveSession(job_dir, language, hotwords, model_provider, endpointer)`；`append(seq, pcm_bytes)`（**冪等**：`seq` 重複忽略；跳號記 `gaps` 但不中斷）；每包先寫入 `live.wav` 再餵 endpointer（先落地後處理，F10）；每個 Utterance 呼叫 `model.transcribe(audio, language=..., hotwords=..., initial_prompt=<前文尾巴≤200字>, beam_size=1, condition_on_previous_text=False, vad_filter=False)`，結果追加一行到 `live_transcript.jsonl`（`seq,t0,t1,text,lang,wall_ms,suspect`）；`suspect` 用 `hallucination.analyse` 同一套規則；`read_since(n)`；`finalize() -> wav_path`（補 WAV 檔頭）。WAV 不用標準庫 `wave` 寫入：`wave` 在關閉時才寫檔頭，崩潰會留下無效檔頭。改為「先寫 44 位元組佔位檔頭，每包 flush，`finalize()` 回填長度」，並提供 `repair_wav(path)`（依檔案大小重算檔頭，供 WC-LM-25 使用）。
- 改（新）：`MS/tests/test_live_session.py`：重複 `seq` 不重複寫入；跳號被記錄；崩潰模擬（不呼叫 `finalize`）後 `repair_wav` 產生可被 `wave.open` 讀取且樣本數正確的檔；假模型收到的 kwargs 含 `condition_on_previous_text=False`；`suspect` 標記生效。
- 驗收：全測試綠。突變：拿掉冪等檢查 → 重複 seq 測試紅。
- commit：`feat(meeting-service): live session — durable WAV, idempotent append, per-utterance transcription log`。

**WC-LM-23 即時端點**
- 讀：`MS/app.py` 整檔；WC-LM-22 成品；`MS/lib/keep_awake.py` 公開函式；`MS/pipeline.py:100-102`。
- 改：`app.py` 新增：`POST /api/live/start`（body：`language`、`hotwords`、`consent: true`；`consent` 缺或非 true → 400；檢查 `shutil.disk_usage` 剩餘 ≥ 5GB、`gpu_gate.acquire("live")`、`keep_awake.prevent_sleep()`；建 `jobs/<id>/live_meta.json` 含同意時間；回 `{job_id}`）；`POST /api/live/{id}/audio`（原始位元組，標頭 `X-Seq`；單包 ≤ 1MB；超過 5 小時回 413）；`GET /api/live/{id}/transcript?since=N`；`POST /api/live/{id}/stop`（`finalize` → `release("live")`＋`allow_sleep()` → 起 `run_pipeline_phase1(job_dir, live.wav, …)` 背景執行緒，與 `upload()` 同一寫法 `:84-91`；回 `{job_id}`）；`job_id` 一律走既有 `_job_dir()` 驗證（`:33-40`）。
- 改（新）：`MS/tests/test_live_api.py`（TestClient＋注入假模型）：無同意 400；重複 `X-Seq` 冪等；轉錄輪詢 `since` 正確；`stop` 後 `gpu_gate.active()` 為 None 且批次流程被呼叫一次；路徑穿越 job_id 400。
- 驗收：全測試綠。突變：拿掉 `consent` 檢查 → 無同意測試紅。
- commit：`feat(meeting-service): /api/live endpoints (start/audio/transcript/stop) with consent gate`。

**WC-LM-24 錄音頁面**
- 讀：`MS/templates/index.html` 整檔（`:86-172` 結構、`:175-181` `STAGES`、`:302-353` `poll()`）。
- 改：`index.html` 新增「即時錄音」卡（與上傳卡並列）：語言下拉、專有名詞輸入、同意勾選（未勾選＝開始鈕停用，文字見 §9）、「加入分享分頁／系統音訊」勾選（`getDisplayMedia({video:true, audio:true})` 取得後立刻停掉 video track；**若回傳無音訊軌 → 顯示醒目警告「沒有取得音訊，請重新分享並勾選『分享音訊』」**）、麥克風與分享音訊以 `AudioContext` 混音；**AudioWorklet 以 Blob URL 內嵌**（`app.py` 無靜態檔路由，不新增）→ 重採樣 16kHz 單聲道 PCM16 → 每 ~0.5 秒 POST（`X-Seq` 連號；失敗留在用戶端佇列重送）；逐字稿區 `aria-live="polite"`、文字大小可調、對比 ≥ 4.5:1；每行顯示語言標籤；顯示「已錄 mm:ss／延遲」；結束鈕 → `POST /stop` → 沿用現有 `poll(job_id)`（`:302`）進入原流程。
- 驗收（Playwright，**不用**內建瀏覽器；內建瀏覽器無法餵假麥克風）：`scripts` 目錄或 `MS/eval/e2e_live.py` 以 Chromium 啟動參數 `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<語料B的wav>`，服務端注入**假模型**（環境變數 `MEETING_LIVE_FAKE_MODEL=1`，只在測試用，預設關）→ 斷言：勾選同意前按鈕停用；錄 10 秒後 `live_transcript.jsonl` ≥ 1 行；按結束後 `status.stage` 進入 `transcribe`；頁面 `aria-live` 區有文字。
- 突變：拿掉同意勾選的停用邏輯 → E2E 第一條斷言紅。
- commit：`feat(meeting-service): live recording UI — mic + shared audio, consent gate, aria-live captions`。
- 註：此卡不動 `poll()`／`showSummaryStep()` 既有行為。

**WC-LM-25 崩潰／睡眠／瀏覽器關閉後救回**
- 讀：WC-LM-22 的 `repair_wav`；`MS/app.py` `index()`。
- 改：服務啟動時掃 `jobs/*/live.wav` 且 `status.json` 不存在或未 `done`／無 `finalized` 旗標者 → 寫 `status.json` `stage="interrupted"`；`GET /api/live/interrupted` 回清單；頁面載入時若有則顯示橫幅「上次錄音中斷（mm:ss 已保存），[救回並處理]」→ 呼叫 `POST /api/live/{id}/stop`（已有 `repair_wav` 流程）。
- 改（新）：`MS/tests/test_live_recovery.py`：截斷的 WAV＋無 status → 清單有它；救回後產生可讀 wav 並啟動批次；已完成的 job 不出現。
- 驗收：全測試綠。突變：拿掉「已完成不列入」判斷 → 測試紅。
- commit：`feat(meeting-service): recover interrupted live recordings`。

**WC-LM-26 刪除鈕（儲存限制）**
- 改：`DELETE /api/job/{id}`（`_job_dir` 驗證後 `shutil.rmtree`；進行中的 job 回 409）；頁面結果卡加「刪除這場會議的所有檔案」（二次確認）。
- 改（新）：`MS/tests/test_delete_job.py`：刪除成功；進行中 409；路徑穿越 400；不存在 404。
- 驗收：全測試綠。突變：拿掉進行中檢查 → 409 測試紅。
- commit：`feat(meeting-service): delete-job endpoint and button`。
- **期末閘（P2）**：全測試綠；F8 契約測試綠；`cd COS && python -m unittest discover -s tests -t . -q` 綠（確認 cognitive 沒被連帶弄壞）。

### P3 驗證與交付

**WC-LM-30 端到端重播評測（延遲＋準確度＋顯存）**
- 改（新）：`MS/eval/replay_live.py`：把語料 A–D 以 **1 倍速真實時間**經 `/api/live/*` 送入（真模型），記錄每段顯示延遲（p50／p95）、單段推論耗時比、`nvidia-smi` 顯存峰值取樣（每秒）；會後取正式版 `transcript.json` 與即時 `live_transcript.jsonl` 各自對參考稿計分；報告 `MS/eval/reports/live-YYYYMMDD.json`＋一頁表。**另測**：`ollama run gemma3:4b` 與即時轉錄同時進行時的顯存峰值與是否 OOM（回答 D5／R3），只記錄事實。
- 驗收：報告存在；§4.1 每個指標有實測值與是否達標；未達標項目列入 §7 新風險列，不放寬門檻。
- commit：`docs(meeting-service): live replay evaluation report`。

**WC-LM-31 文件、Runbook、可執行示範**
- 改：`MS/README.md` 加「即時錄音」章節（用法、限制、同意、刪除）並更新「架構」`lib/` 清單（新增 7 個模組）；新增 `MS/docs/LIVE_RUNBOOK.md`（症狀→處置：麥克風無權限、無分享音訊、顯存不足 409、上傳延遲高、救回中斷錄音；Windows 原生與 WSL2 兩條啟動路徑各驗一次並記錄結果）；在 `agency-os/docs/operations/RUNNABLE_DEMOS.md` 登記一列（指令＋預期輸出，格式照該檔既有列）；README 的「已知限制」補：夾雜語言準確度、雙重收音、即時無講者標籤。
- 驗收：README 內每個 `file` 路徑 `Glob` 存在；RUNNABLE_DEMOS 該列的指令實跑一次貼輸出。
- commit：`docs(meeting-service): live recording README, runbook and runnable demo`。

**WC-LM-32 期末閘（全計畫）**
- 全測試（MS＋COS）綠；§6 矩陣每列有證據；§4.1 全部指標有實測值；WORKLOG 四行證據＋TASKS.md 更新（經 AGENTS.md §8 指定的腳本）；critic 覆審（Codex 或無額度時書面自審＋突變證據）；操作者親自用真實會議跑一次並回報。

## §11 P4（門控；P3 過了才由期末閘執行者依 §12.5 產生卡）
1. 會後**本機小型語言模型**（Ollama：gemma3:4b／llama3.1:8b；排除中國廠商模型）一鍵整理：筆記、心智圖、魚骨圖、快速回答；輸出走 cognitive 網站既有方法的 typed record（`association.mind_map`、`root_cause.fishbone`）。
2. 即時／會後翻譯（先做會後，走 Ollama 或人工貼上）。
3. 逐字稿一鍵送進 cognitive 網站專案（`POST /projects/{id}/sources`，純文字上限 5 MiB，`COS/ai_lego/apps/api/main.py:1187`、`:1010`）——**需操作者重新決定隱私（D10）**。
4. 浮動字幕小視窗。
5. 講者分離正確率量測（DER，需標註語料）。
6. 評估 large-v3-turbo。

## §12 回滾
每卡一 commit，`git revert <sha>` 即回；D7 保證預設行為不變，回滾任一卡不影響既有上傳流程。整批回滾：revert P2、P1 卡；P0 的 WC-LM-00 建議保留（它修的是既有紅測試）。

## §13 文件關係
本檔＝計畫 SSOT；`MS/README.md`＝使用說明；`MS/docs/LIVE_RUNBOOK.md`（WC-LM-31 產出）＝故障處置；基線與重播報告＝`MS/eval/reports/`；記憶與進度＝`agency-os/WORKLOG.md`、`agency-os/TASKS.md`（只經 AGENTS.md §8 指定腳本寫入）。
