# codex-oracle review -- 2026-11-10 09:07:00 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/transcript-words.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed10-subtitles-backend.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card ED.10 backend: whisper-1 word timestamps + per-segment confidence score (needsReview < 0.8) on POST /transcriptions (opt-in words:true; old SRT callers unchanged); whole-project transcription job editor-transcribe (mix audible V1+A1 clips into one mono mp3 with 1s gaps between stretches, split under 25MB at gaps, map file time back to timeline time, free quote, charged on success = quote, transcript stored in dataDir/transcripts/<jobId>.json, listed per projectId); filler/pause helpers for ED.11; editor export burns 8 subtitle styles incl 逐字高亮/卡拉 OK from words (relative to clip start), falling back to static when words do not spell the clip text. Legacy text clips (no subtitleStyle) must render byte-identical. Look for: billing correctness, path traversal via job ids, ffmpeg arg injection, timing mapping bugs, chunk splitting bugs, ASS injection, backward compat.
- exit: 0 | elapsed: 251999ms | answer: 1689B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/transcript-words.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed10-subtitles-backend.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 儲存的字幕結果在工作紀錄達上限後會失聯
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:1242
  confidence  -> CONFIRMED
  scenario    -> 全域累積超過 `JOB_HISTORY_LIMIT` 筆已完成工作後，`persist()` 會從 `jobs.json` 淘汰舊工作；伺服器重啟後，舊字幕 JSON 仍在，但列表不再顯示，依 ID 讀取也回 404。
  why missed  -> 新功能把字幕另存檔案，讀取路徑卻仍以受上限限制的工作紀錄為索引。

FINDING 2: 整片辨識會收錄剪輯輸出中已靜音的片段
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs:182
  confidence  -> CONFIRMED
  scenario    -> 專案的 V1 軌設為 `muted`，來源影片仍有音軌；剪輯輸出會排除其聲音（`editor-export.cjs:809–815`），但辨識只檢查來源是否有音軌，仍混入並轉寫該聲音，產生影片中聽不到的字幕。
  why missed  -> 辨識沿用來源檔的音軌檢查，沒有套用既有剪輯輸出的靜音規則。

FINDING 3: 合法的逐字文字可截斷 ASS 字幕事件
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs:94
  confidence  -> CONFIRMED
  scenario    -> 字幕文字為 `hello world`，第一個 word 的文字為 `he\nllo`；驗證允許內部換行，`spells()` 忽略空白後判定相符，但 `escapeAss()` 保留換行。產生的 `Dialogue` 被拆成兩個實體行，後半句無法按預期顯示。
  why missed  -> 靜態字幕會把換行轉成 `\N`，新的逐字路徑只處理大括號和反斜線。

TOTAL: 3 findings
