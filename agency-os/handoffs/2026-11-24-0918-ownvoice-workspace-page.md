---
slug: ownvoice-workspace-page
created_utc: 2026-11-24T01:18:00Z
hint: "把 OwnVoice Meet 的功能搬進 meeting-service，做成一頁四面板可停靠工作區；操作者決定壓縮後由同一 session 接手"
source_session_summary: "OwnVoice Meet × meeting-service 整合（查詢側欄、會後整理、逐字稿心智圖）做完後，操作者要求四個視窗合成一頁"
---

**續接語**：「續做 OwnVoice 工作區頁面：讀 agency-os/handoffs/2026-11-24-0918-ownvoice-workspace-page.md，從讀 D:\tmp\ownvoice-src\ownvoice-meet\docs\ARCHITECTURE.md 與 §5 列的 Rust 檔開始，交一份工作卡清單給操作者看；完成 = 她看過清單並說開工。建議模型：Fable／Opus（寫計畫），卡寫死後派 fullstack-engineer 或 Codex」

### 1. 任務目標

操作者原話（2026-11-24）：「原來的 OWN 有 3 個漂浮視窗＋你加上去的現在已經固定的視窗，共 4 個，我全部都要固定到一個完整頁面，但可以調整位置，就像 ADOBE 的工作區一樣」。
= meeting-service 內一個瀏覽器頁面，四個面板：字幕（英文＋中文翻譯）、回覆（打中文出英文）、講稿、查詢（搜尋網路／問 AI）。面板可拖曳換位、拉分隔線改大小、收合；版面記住。沒有任何漂浮視窗。完成後不再需要開 OwnVoice。

### 2. 為什麼做

她不要漂浮視窗。OwnVoice 的三個視窗寫死在它的執行檔裡，改不了（§3），所以只能把功能搬進我們自己的網頁。她 2026-11-24 明確選了這條路（「那就把功能搬進我們自己網頁」「那就 compact 後交給你做」）。

### 3. 已試過（不要重試）

- 改 OwnVoice 原始碼重建：這台筆電 Smart App Control 擋本機建出的未簽章執行檔（`cargo build` 在 build script 即 os error 4551）。不准關 SAC、不准繞過。直接改現成執行檔同理（改一個位元組就是新檔案）。
- 用 appbar 側欄與 OwnVoice 並排：可用但 OwnVoice 字幕視窗壓到側欄那一條時會自己跳位（WORKLOG 2026-11-23 續12）。
- OwnVoice Meet.exe 本身 2026-11-23 10:45–16:00 被 SAC 暫擋後自行放行；這是搬離它的另一個理由。
- 尚未驗證：在 GitHub 上建置未簽章的改版再下載執行會不會被擋（未試，且每版都是新檔案）。

### 4. 卡在哪

沒有卡點，尚未開始。下一步是交計畫，**未經操作者看過不動手**（跨多模組新功能）。計畫必須回答三件事：停靠面板的做法（meeting-service 沒有前端建置流程，要能用單一檔案載入）、即時語音辨識走哪一家（決定每月費用，她要看這一項）、延遲目標。

### 5. 下一步指令

1. 整檔讀 `D:\tmp\ownvoice-src\ownvoice-meet\docs\ARCHITECTURE.md`（124 行），再讀同資料夾 `src-tauri\src\` 的 captions.rs、prompts.rs、llm.rs、gemini.rs、openai_rt.rs、stt_chunk.rs、vad.rs、sentences.rs、gloss.rs、summary.rs、archive.rs，與 `src\captions\main.ts`、`src\reply\main.ts`、`src\script\main.ts`。
2. 讀 `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/` 的 README.md「OwnVoice Meet 整合」段、app.py、lib/ownvoice.py、lib/lookup.py、lib/mindmap.py、lookup_panel.py、docs/LIVE_MULTILINGUAL_MASTER_PLAN.md §5／§7／P2（既有瀏覽器收音計畫：getDisplayMedia＋AudioWorklet；有衝突先停下回報）。
3. 交工作卡清單（預估 8–12 張；每張：目標、改哪些檔、怎麼驗收），分三段交付，每段做完就能用：
   - 段 1：一頁四面板＋字幕＋翻譯＋查詢（做完就沒有漂浮視窗）
   - 段 2：回覆、講稿
   - 段 3：存檔、會議中摘要
4. 她說開工後：貴模型只寫計畫與驗收；卡寫死後派 `fullstack-engineer` 或 `/codex-do`（Codex 額度擋到 2026-11-24 11:02，先 `scripts/oracle-quota.ps1 -Action check -Tool codex`）。

限制（寫進每張卡）：
- 音訊在瀏覽器收（分享分頁／系統音訊＋麥克風）；金鑰只放伺服器端。
- 不裝會帶未簽章 .pyd／.exe 的新套件（SAC 會擋），先 import 實測再用。
- 不用下拉選單；頁面文字繁體中文白話；不可用中國廠商的模型。
- 問 AI、心智圖維持「按了才呼叫」；即時字幕翻譯是持續計費，頁面上要看得到用量。
- 存檔沿用 OwnVoice 的資料夾格式，`lib/ownvoice.py` 的會後整理不用改。
- OwnVoice 是 Apache-2.0：可移植邏輯與提示詞，保留 LICENSE／NOTICE 聲明。
- 做完後刪 `lookup_panel.py` 與 `start_server.ps1` 的 `Start-LookupPanel`，並列出刪了什麼。
- 不做無效益測試：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。

驗收（整體）：
- 一個頁面四個面板都在，沒有漂浮視窗；可拖曳、可拉大小；重新整理後版面不變。
- 播一段英文（Windows 語音合成）：字幕出現英文、下面跟著中文；延遲用數字回報。
- 回覆面板打一句中文，出現可照唸的英文。
- 在字幕上反白 → 查詢面板出現搜尋結果。
- 按停止後首頁「OwnVoice 會議」卡出現這場會議，「會後整理」跑得出分角色逐字稿。
- 用真實畫面截圖證明。

### 6. 相關資源

- **Files**: `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/`（app.py、lib/、templates/、lookup_panel.py、start_server.ps1）；參考原始碼 `D:\tmp\ownvoice-src\ownvoice-meet`（暫存位置，會被清；上游 https://github.com/Zaious/ownvoice-meet，本機那份是 v0.2.3+1 commit 08e3ab3）；操作者的執行檔 `D:\OwnVoice Meet 0.2.3 portable`。
- **Commits**: 81bb61fb4 OwnVoice 整合（查詢／會後整理／逐字稿心智圖）；fd0f023d6 查詢面板改右側 appbar 側欄；0a1b1334a 側欄與 OwnVoice 視窗位置的說明。
- **Known landmines**:
  - 心智圖必須從逐字稿產生，不是摘要（她更正過）。
  - 快捷鍵 Ctrl+Shift+Space／F8／F9 是 OwnVoice 的，現行查詢用 F7。
  - 會議工具設定頁沒有 Anthropic key：問 AI 與 API 心智圖從未對真實 API 跑過。
  - 本機 main 與 origin 分歧（別線未提交的 `agency-os/TASKS.md` 與遠端衝突，`git-parity-merge.py` 停手）；推送用 memory `reference_diverged_push_shared_worktree` 的做法。
  - 未追蹤的 `$WORK_ROOT/Projects/internal/ownvoice-meet` 是廢棄的原始碼副本（rm -rf 閘擋下，未刪）。
  - 即時語音辨識與翻譯按用量向供應商計費，她用 OwnVoice 時本來就在付。
