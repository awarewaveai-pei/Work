# Meeting Service — 會議錄音 → 逐字稿 → 會議記錄 → PPT / Word / Excel → 報告教練

錄音/影片上傳 → 本機轉錄 → 講者分離 → AI 摘要（預設貼上式，零費用；選填 API 自動處理，見下方）→ PPT + Word + Excel + 報告教練。**全程本機執行，音檔不外流**。

## 執行環境：Windows 優先，SAC 擋住才退 WSL2（自動判斷）

**預設走 Windows 原生**（GPU：轉錄 7.0x realtime、講者分離 24.4x realtime）。
`start_server.ps1` 每次啟動會實測 `python -c "import av, faster_whisper"`，
成功就走 Windows，失敗才自動退到 WSL2（CPU 2.1x，較慢但能動）。

**為什麼需要這個判斷**：Smart App Control（SAC）會封鎖新安裝套件裡未簽章的 `.pyd`
（`ImportError: DLL load failed ... 應用程式控制原則已封鎖此檔案`），`av` 踩過這個坑。
**但這個封鎖通常是暫時的**——SAC 先擋、待雲端信譽評估完成後放行（見下方「安裝細節」
第 4 條）。2026-08-27 當天上午 `av` 被擋、當晚同一支套件同一個檔案就正常了，中間
沒有重裝也沒有改設定。

⚠️ **歷史教訓**：當天曾因為「查了 registry 確認 SAC 完全鎖定、查了官方說明確認無法
從 UI 關閉」就判定 Windows 永久不可用，把整套搬到 WSL2 —— 代價是轉錄掉到 CPU 速度、
講者分離完全消失。宣告任何環境永久失效前，先查本檔既有記錄（R4 VBC）。

**對操作者的使用方式完全不變**（兩條路徑都是同一個網址）：

```powershell
# 一樣雙擊桌面捷徑，或直接跑（會自動偵測並啟動 WSL2 內的服務）
.\start_server.ps1
# 一樣開 http://127.0.0.1:8420
```

WSL2 的 `localhostForwarding` 預設開啟，服務綁在 WSL2 內的 `127.0.0.1:8420`，
Windows 瀏覽器直連即可（2026-08-27 實測 HTTP 200 / 27ms）。

### WSL2 環境建立（新機或重建時）

```bash
wsl --install -d Ubuntu          # 若尚未安裝
wsl -d Ubuntu -- bash -lc "sudo apt-get update && sudo apt-get install -y python3-pip python3-venv"
wsl -d Ubuntu -- bash -lc "python3 -m venv ~/mtg-venv && ~/mtg-venv/bin/pip install -r /mnt/d/Work/lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/requirements.txt"
```

**模型不要在 WSL2 內重新下載。** 實測 WSL2 下載數 GB 大檔會斷流卡死（medium 模型
12 分鐘下載 0 bytes），而 Windows 端 `~/.cache/huggingface` 早已有 large-v3（2.9GB）
與 medium（1.5GB）。模型檔是**資料不是可執行碼，SAC 不擋**，直接讓 WSL2 讀 Windows
那份即可 —— `start_server.sh` 已預設把 `HF_HOME` 指過去，不需要手動設定。

也可以在 WSL2 內直接啟動（不經 PowerShell）：
```bash
wsl -d Ubuntu -- bash /mnt/d/Work/.../apps/meeting-service/start_server.sh
```

⚠️ **WSL2 後備環境目前是「未建置」狀態**（2026-08-27 起）。當初為了繞過 SAC 而在
WSL2 建的 venv 已移除，因為 SAC 封鎖被證實是暫時的、Windows 才是正常路徑，
留著只是佔 1.4GB。**Ubuntu distro 本身保留**（裡面有操作者 2026-04 自己裝的
Slack CLI 等，不屬於本工具，勿一併刪除）。

若 SAC 又擋住 Windows，`start_server.ps1` 會試著退到 WSL2 並回報找不到 venv，
此時依上方「WSL2 環境建立」重建即可（約 5 分鐘，模型不用重下）。多數情況下
更省事的做法是**等 SAC 信譽評估完成自動放行**（實測當天內就好了）。

## ⚠️ 為什麼只能本機跑，不部署到 SG/EU

**GPU 只在你的筆電上。** SG（4GB，無 GPU）、EU CPX32（純 CPU）都跑不動這個負載。

2026-08-17 用真實 60 分鐘會議錄音實測（`BU5.m4a`）：

| 階段 | GPU（RTX 5060） | CPU |
|---|---|---|
| 轉錄 faster-whisper large-v3 | **7.0x realtime**（510s） | 0.3x（**3.6 小時**）※見下方訂正 |
| 講者分離 pyannote 3.1 | **24.4x realtime**（147s） | 1.03x（58 分鐘） |

⚠️ **2026-08-27 訂正**：CPU 轉錄實測為 **2.1x realtime**（WSL2，large-v3 int8，
50.4 分鐘音檔 → 1444 秒跑完），與上表的 0.3x 差 7 倍。上表數字**過度悲觀**，
「純 CPU 不可用」的結論已被推翻——50 分鐘會議 24 分鐘跑完是堪用的。原因未追查
（推測舊測法未帶 `cpu_threads` 或量測方式不同）。兩筆並存不刪舊值（無法確認舊
環境不會重現），但**決策請以 2.1x 為準**。

GPU 仍快 3 倍以上且講者分離差 20 倍以上，所以有 GPU 時仍應優先用 GPU。在有 GPU 的機器（Hetzner dedicated + GPU 卡）到位前，這支服務**刻意不走 `sg-deploy.sh`**，不進 6 項部署 SOP，`app.py` 只 bind `127.0.0.1`。等買了 GPU 機，這裡的 `lib/` 全部可以原封不動搬過去，只是 `app.py` 換成 API + 佇列架構（見下方「未來：多人版」）。

## 使用方式

**本機（這台筆電）**：雙擊桌面捷徑，或跑 `.\start_server.ps1`，然後開
`http://127.0.0.1:8420`。實際執行在 WSL2，原因見上方「執行環境」章節。

**其他機器 / 未來有 GPU 的環境**（SAC 不擋的環境可直接原生跑）：
```bash
cd apps/meeting-service
pip install -r requirements.txt
# torch 預設裝 CPU 版，要手動換 CUDA 版（見下方「安裝細節」）；
# 不裝 torch/pyannote 也能跑，只是沒有講者分離
python app.py
# 開啟 http://127.0.0.1:8420
```

需要的環境變數（在 `mcp/user-env.ps1`，不要問使用者要）：
- `HF_TOKEN` — 講者分離需要；沒設定會自動跳過講者分離，其他階段照跑
- `MEETING_DRIVE_BASE` — Google Drive 同步目的地（例：`H:\我的雲端硬碟\ECT\會議記錄`）；
  沒設定就安全停用同步功能，不影響其他功能。**刻意不寫死在程式碼裡**——這支
  服務可能被複製給別人（例如給家人自己電腦裝一份），寫死路徑等於把操作者的
  客戶名稱、帳號路徑帶去別人的機器。別人拿到這份程式碼時這裡天生是空的，
  勾選同步選項只會安全回報「未設定」，**不會觸發任何登入畫面、不會用到操作者
  的任何帳號**——這功能全程只是檢查本機檔案路徑，從來不呼叫 Google 的登入 API。

**摘要階段預設不需要 API key**（人工回路模式）。想用 API 自動處理見下方「摘要階段二：API 自動處理」。

## 會議工作區（2026-11-24）

`http://127.0.0.1:8420/workspace`：一頁五個可停靠面板（字幕、回覆、講稿、查詢、摘要），可拖曳換位、拉分隔線、疊成分頁，
版面存 `.workspace.json`。取代 OwnVoice Meet 的漂浮視窗與舊的查詢側欄（`lookup_panel.py` 已刪）。
卡片、定案與進度：`docs/WORKSPACE_PAGE_CARDS.md`；移植來源與授權：`lib/live/NOTICE.md`（OwnVoice Meet，Apache-2.0）。

| 功能 | 怎麼用 | 程式 |
|---|---|---|
| 即時字幕＋中文 | 字幕面板按「聆聽」。聲音來源「麥克風／電腦聲音」可同開。辨識二選一：「Gemini（計費）」說話中就有灰字，約 NT$17／小時；「本機（免費）」用這台的顯卡，講完一句才出字 | `lib/live/`、`WebSocket /api/live/ws` |
| 閒置暫停 | Gemini 連線中靜音也計費：沒有新字幕 3 分鐘先斷線不計費，有聲音自動接回；30 分鐘自動結束。兩個數字在面板底列可改，0 = 不啟用 | `lib/live/idle.py` |
| 查詢 | 頁面內反白 ≥ 2 個字 → 查詢面板自動搜尋網路（Serper，每次約 NT$0.03）。「問 AI（計費）」按了才呼叫：先搜尋一次，再把結果與這場會議的字幕交給模型整理，答案下方列出被引用的來源（每次約 NT$0.05、3–6 秒；理由與實測見 `lib/lookup.py` 檔頭）。「心智圖」按了才呼叫 | `lib/lookup.py`、`POST /api/lookup/ask` |
| 存檔 | 字幕面板的「存檔」（預設開，聆聽中不能改）：錄音（16 kHz 單聲道）與逐字稿存到 `文件 › OwnVoice Meet › YYYY-MM-DD HHMM`，格式與 OwnVoice 相同，首頁「OwnVoice 會議」卡的「會後整理」可直接用。「新段落」開新的一段（新錄音檔、新逐字稿段落），點段名可改名；閒置暫停期間錄音不停；剩餘空間不到 1 GB 就這場不存檔（照常聆聽） | `lib/live/archive.py` |
| 會議中摘要 | 摘要面板打開「會議中摘要（計費）」（預設關，聆聽中不能改），每 N 分鐘（預設 5）且至少 3 句新字幕才呼叫一次模型，停止時補最後一批；有存檔就寫 `summary.md` | `lib/live/summary.py` |

- 金鑰都在伺服器端：Gemini 讀環境變數 `GEMINI_API_KEY`；翻譯用設定頁的 Anthropic key（Claude Haiku），沒填就用同一把 Gemini key（Flash-Lite）。
- 今日用量（NT$，依牌價估算）顯示在字幕面板右下，存 `.live-usage.json`。
- 本機辨識與「會後整理」不同時用顯卡（`lib/gpu_gate.py`）：一邊在跑，另一邊會被告知要等；本機聆聽停止時會卸載模型。
- 只收本機來的請求：`TrustedHostMiddleware`（Host 只認 127.0.0.1／localhost）＋ WebSocket 檢查 Origin。
- 存檔位置與「OwnVoice 整合」同一個（`lib/ownvoice.base_dir()`，測試用環境變數 `OWNVOICE_SESSIONS_DIR` 指到暫存資料夾）；沒開「存檔」就不寫任何檔。
- 沒有的：字幕不能浮在會議軟體上、沒有全域快捷鍵、別的程式裡反白的字要貼進查詢面板。
- 未實測：真實麥克風與「電腦聲音」收音（開發時的測試瀏覽器沒有收音裝置）；Anthropic 翻譯與摘要對真實 API；存檔與摘要面板在真實瀏覽器裡的點擊操作。

## OwnVoice Meet 整合（2026-11-23）

**不改 OwnVoice 的程式**：只讀它存下的會議資料夾（文件 › OwnVoice Meet › `YYYY-MM-DD HHMM`），格式只有 `lib/ownvoice.py` 知道。
OwnVoice 設定的存檔模式要選「錄音與逐字稿」才有錄音可做會後整理。

| 功能 | 怎麼用 | 程式 |
|---|---|---|
| 會後整理 | 首頁「OwnVoice 會議」卡 →「會後整理」：各段錄音接成一檔，走跟上傳相同的流程；語言跟 OwnVoice 設定 | `lib/ownvoice.py`、`POST /api/ownvoice/import` |
| 心智圖 | 從**逐字稿**產生：會議中 `/mindmap?session=latest`（OwnVoice 目前為止的 transcript.md）；會後 `/mindmap?job=<id>`（diarized.txt，沒有就 merged.txt）。預設「複製 prompt → 貼回 AI 的 JSON」零費用；有 API key 可直接產生（計費）。結果存 `jobs/<id>/mindmap.json` 或 `jobs/ownvoice-mindmaps/` | `lib/mindmap.py`、`templates/mindmap.html` |

- OwnVoice Meet.exe 沒有簽章，SAC 偶爾會暫時擋它（2026-11-23 10:45 擋、16:00 放行，檔案未變）；這不是本工具能處理的，等它放行。
- 搜尋用環境變數 `SERPER_API_KEY`。搜尋與問 AI 都會把反白的文字送出這台電腦。
  問 AI 另外會附上這場會議逐字稿的最後一段當上下文（工作區這場的字幕；沒有才取 OwnVoice 30 分鐘內還在更新的那一場）。
- 只在 Windows 原生模式可用；伺服器退到 WSL2 時讀不到 OwnVoice 的資料夾，首頁不顯示該卡。
- 會議還在錄音時不能做會後整理（`lib/ownvoice.py` join_wavs 會拒絕），先在 OwnVoice 按停止。
- 為什麼不改 OwnVoice：SAC 擋本機建出的未簽章執行檔（`cargo build` 在 build script 就 os error 4551）。

## 摘要階段一：貼上式人工回路（預設，零費用）

轉錄/合併/幻覺偵測/講者分離全自動跑完後，頁面停在「等待貼上摘要」：
1. 頁面顯示一段完整 prompt，複製貼進**任一** AI 對話（Claude、免費版 ChatGPT 皆可，用既有額度不額外收費）
2. 把 AI 回傳的 JSON 貼回頁面，送出
3. 頁面接手生 PPT / 報告教練 / 會議記錄

品質提醒：免費層級模型（如免費版 ChatGPT）對細節判斷（例如區分「未否認」與「否認」、
判斷該不該把閒聊硬套決議格式）通常弱於 Claude Sonnet/Opus。`validate()` 只擋結構性
錯誤（頁數不符），不驗證內容判斷是否準確——貼回去前建議先看一眼 JSON 內容合不合理。

**為什麼預設不是全自動呼叫 API**：操作者本人用這支服務要求零額外花費，只用訂閱額度。
原本設計呼叫 Claude API（見 git 歷史），但那是按量計費。改用 `claude` CLI headless 模式
（`claude -p`，走訂閱 session 不計 API 費）在 2026-08-17 經三次真實測試證實
在 Windows + Git Bash 巢狀呼叫環境下不可靠——process 變成孤兒、stdout 管線斷裂，
拿不到輸出。人工回路是操作者自用時唯一驗證過會動、且零額外花費的路。

`lib/summarize.py` 的 `validate()` 會檢查貼回的 JSON 頁數是否與投影片頁數一致
（`deck.plan_slides()` 是唯一真相源），不一致會擋下並回報錯誤，不會靜默產生
講稿與投影片錯位的成品。

## 摘要階段二：API 自動處理（選填，2026-08-20 新增，給客戶用）

人工回路的前提是使用者能操作 Claude Code 對話視窗——**客戶沒有這個**，所以給客戶的版本
需要「自己貼上」或「真正的 API」兩選一。API 模式讓客戶不用複製貼上，全自動跑完：

1. 網頁最上方「⚙ API 設定」展開，貼入自己的 Anthropic API key，按儲存
   （key 只存在本機 `.settings.json`，`.gitignore` 排除，絕不進版本控制、絕不上傳）
2. 上傳檔案時會多出「自動處理（用 API，會計費，跳過手動貼上）」勾選框（key 未設定時不顯示）
3. 勾選後上傳，整個流程（含摘要）全自動跑到 done，不停在等待貼上

API 呼叫失敗（key 失效、額度用完、網路問題）時**不會判定整個工作失敗**——自動退回
人工回路，`prompt.txt` 已經寫好，頁面照樣顯示貼上步驟，轉錄/講者分離的成果不會浪費。
`GET/POST /api/settings` 管理 key（`lib/settings.py`）；`summarize.summarize_via_api()`
用同一份 `validate()` 把關，驗證失敗會自動重試一次帶錯誤訊息的修正 prompt。

**真的會計費**，跟人工回路（用訂閱額度）不同，是兩條路並存，不是取代關係。

## 安裝細節

**1. CUDA torch**（pip 預設裝 CPU 版，`torch==2.13.0+cu128` 和 `2.13.0` 在 pip 眼中同版號會被跳過安裝）：
```bash
pip install --force-reinstall --index-url https://download.pytorch.org/whl/cu128 torch torchaudio
```

**2. HuggingFace 帳號需同意三個 gated repo**（官方文件只寫兩個，pyannote 4.x 額外拉一個 PLDA 元件，缺一會 403）：
- https://huggingface.co/pyannote/segmentation-3.0
- https://huggingface.co/pyannote/speaker-diarization-3.1
- https://huggingface.co/pyannote/speaker-diarization-community-1

**3. Windows 無開發者模式**：`huggingface_hub` 快取預設用 symlink，Windows 沒開 Developer Mode 會失敗。`huggingface_hub` 本身會自動降級成複製（只印警告），但 `speechbrain`（若改用它做講者分離）會直接 `WinError 1314` 崩潰——本服務用 pyannote，已在 `lib/diarize.py` 走過這條坑但改用 pyannote 後不受影響；若未來換回 speechbrain 系方案，記得傳 `local_strategy=LocalStrategy.COPY`。

**4. Windows Smart App Control**：新裝套件的 DLL 首次載入可能被暫時封鎖（信譽評估中），重試一次通常就過。

## 架構

```
app.py            FastAPI，僅 bind 127.0.0.1，/upload /status /log /download
pipeline.py       串接全流程，寫 jobs/<job_id>/status.json 供輪詢
lib/
  transcribe.py   faster-whisper + GPU 探針（建構成功 != 能推論，見下方坑 3）
  merge_segments.py  VAD 切碎段落合併成可讀輪次
  hallucination.py   信心分數抓不到的幻覺偵測（見下方坑 1）
  diarize.py      pyannote 講者分離 + 三層貼標回退
  settings.py     本機 API key 存取（給客戶端填自己的 key，不進版本控制）
  summarize.py    build_prompt()（人工回路）+ summarize_via_api()（選填自動）共用同一份 schema/validate()
  deck.py         minutes -> PPTX，plan_slides() 是頁數對齊的唯一真相源
  speaker_notes.py   講稿寫入 PPT 備忘稿（頁數不符會硬失敗）
  word.py         minutes -> 會議記錄 docx + 報告教練 docx（文件類輸出的唯一格式）
  excel.py        minutes -> 五工作表 xlsx
  archive.py      選擇性同步交付物到 Google Drive（不含音檔）
start_server.ps1  Windows 端啟動器（呼叫 WSL2）
start_server.sh   WSL2 端實際啟動邏輯
templates/index.html   單頁：拖拉上傳 + 進度 + 下載
jobs/<job_id>/    執行期輸出，.gitignore 排除
```

**新增輸出格式時要一起改的地方**（2026-08-27 加 Word 時漏掉 `archive.py`，
同步結果少一個檔且不會報錯）：
`lib/<new>.py` → `pipeline.py` `_finalize_from_minutes()` → `app.py` `DOWNLOADS` →
`templates/index.html` 的 `STAGES` + `DOWNLOAD_LABELS` → `lib/archive.py` 的 `plan`
→ `requirements.txt`。

## 已知限制（誠實列出，不要粉飾）

- **講者標籤是演算法推定，非人工核對**。單聲道、噪音環境下逐句歸屬會有錯置（實測發現過歸屬滲漏）。每份輸出的 `_provenance` 欄位會誠實寫明限制，前端也帶「僅限本機」徽章。
- **幻覺約佔 3% 內容**（重複型幻覺，`avg_logprob` 抓不到，見 `lib/hallucination.py` 開頭說明），已從摘要輸入排除但逐字稿本身仍保留原文供查證。
- **不是每段錄音都是會議**。約 40-60% 可能是社交閒聊；`lib/summarize.py` 的 system prompt 明確禁止硬套決議格式。
- 講者分離的 whisper VAD 與 pyannote 分割不同調，約 10% 段落靠時間鄰近推定補標。

## 未來：多人版（買 GPU 機之後）

不要重寫 `lib/`。架構改成：
```
next-admin 上傳頁（任何機器） -> Supabase 佇列 -> worker（GPU 機，同一份 lib/）-> 結果回寫 + Telegram 通知
```
`lib/` 裡的函式都已經是 job_dir 隔離、無副作用的形式，可直接被新的 worker 呼叫，不需要碰 `transcribe.py`/`diarize.py`/`deck.py` 內部邏輯。

## 相關記憶

`~/.claude/projects/D--Work/memory/project_meeting_to_ppt_pipeline.md`（實測數字與踩坑細節的完整版）。
