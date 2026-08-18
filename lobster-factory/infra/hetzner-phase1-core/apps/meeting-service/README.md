# Meeting Service — 會議錄音 → 逐字稿 → 會議記錄 → PPT → 報告教練

錄音/影片上傳 → 本機轉錄 → 講者分離 → AI 摘要（貼上式，Claude/ChatGPT 皆可）→ PPT + 報告教練。**全程本機執行，音檔不外流**，零 API 費用。

## ⚠️ 為什麼只能本機跑，不部署到 SG/EU

**GPU 只在你的筆電上。** SG（4GB，無 GPU）、EU CPX32（純 CPU）都跑不動這個負載。

2026-08-17 用真實 60 分鐘會議錄音實測（`BU5.m4a`）：

| 階段 | GPU（RTX 5060） | CPU |
|---|---|---|
| 轉錄 faster-whisper large-v3 | **7.0x realtime**（510s） | 0.3x（**3.6 小時**） |
| 講者分離 pyannote 3.1 | **24.4x realtime**（147s） | 1.03x（58 分鐘） |

CPU 路線差 20-27 倍，不是「慢一點」，是不可用。在有 GPU 的機器（Hetzner dedicated + GPU 卡）到位前，這支服務**刻意不走 `sg-deploy.sh`**，不進 6 項部署 SOP，`app.py` 只 bind `127.0.0.1`。等買了 GPU 機，這裡的 `lib/` 全部可以原封不動搬過去，只是 `app.py` 換成 API + 佇列架構（見下方「未來：多人版」）。

## 使用方式

```bash
cd apps/meeting-service
pip install -r requirements.txt
# torch 預設裝 CPU 版，要手動換 CUDA 版（見下方「安裝細節」）
python app.py
# 開啟 http://127.0.0.1:8420
```

需要的環境變數（在 `mcp/user-env.ps1`，不要問使用者要）：
- `HF_TOKEN` — 講者分離需要；沒設定會自動跳過講者分離，其他階段照跑

**摘要階段不需要 API key**，見下方「為什麼摘要是人工回路」。

## 摘要階段：貼上式人工回路

轉錄/合併/幻覺偵測/講者分離全自動跑完後，頁面停在「等待貼上摘要」：
1. 頁面顯示一段完整 prompt，複製貼進**任一** AI 對話（Claude、免費版 ChatGPT 皆可，用既有額度不額外收費）
2. 把 AI 回傳的 JSON 貼回頁面，送出
3. 頁面接手生 PPT / 報告教練 / 會議記錄

品質提醒：免費層級模型（如免費版 ChatGPT）對細節判斷（例如區分「未否認」與「否認」、
判斷該不該把閒聊硬套決議格式）通常弱於 Claude Sonnet/Opus。`validate()` 只擋結構性
錯誤（頁數不符），不驗證內容判斷是否準確——貼回去前建議先看一眼 JSON 內容合不合理。

**為什麼不是全自動呼叫 API**：使用者要求零額外花費，只用訂閱額度。原本設計呼叫
Claude API（見 git 歷史），但那是按量計費。改用 `claude` CLI headless 模式
（`claude -p`，走訂閱 session 不計 API 費）在 2026-08-17 經三次真實測試證實
在 Windows + Git Bash 巢狀呼叫環境下不可靠——process 變成孤兒、stdout 管線斷裂，
拿不到輸出。人工回路是目前唯一驗證過會動、且零額外花費的路。

`lib/summarize.py` 的 `validate()` 會檢查貼回的 JSON 頁數是否與投影片頁數一致
（`deck.plan_slides()` 是唯一真相源），不一致會擋下並回報錯誤，不會靜默產生
講稿與投影片錯位的成品。

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
  summarize.py    Claude API 兩段式呼叫：核心 minutes -> 對齊頁數的講稿
  deck.py         minutes -> PPTX，plan_slides() 是頁數對齊的唯一真相源
  speaker_notes.py   講稿寫入 PPT 備忘稿 + 報告教練 md（頁數不符會硬失敗）
  minutes_md.py   minutes -> 會議記錄 md
templates/index.html   單頁：拖拉上傳 + 進度 + 下載
jobs/<job_id>/    執行期輸出，.gitignore 排除
```

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
