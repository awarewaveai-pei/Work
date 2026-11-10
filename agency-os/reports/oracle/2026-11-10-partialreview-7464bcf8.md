# codex-oracle review -- 2026-11-10 22:03:23 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-export-dialog.js  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.8 export dialog rewrite: platform presets (ratio+1080P), custom quality, watermark overlay clip injected into the exported COPY of the project, no backend change. Check correctness of edExportProject vs backend/editor-export.cjs validateProject/overlay layout, and the dialog state handling.
- exit: 0 | elapsed: 272765ms | answer: 1167B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-export-dialog.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 剛好達到後端片段上限的專案，套用浮水印後會匯出失敗  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-export-dialog.js:28  
  confidence  -> CONFIRMED  
  scenario    -> 專案有 64 個非文字片段，原本可匯出；按「套用」會新增第 65 個圖片片段，後端 `backend/editor-export.cjs:128` 因超過 64 個而拒絕。  
  why missed  -> 驗收只使用一個影片片段，未碰到既有的後端上限。

FINDING 2: 載入資料完成時會重新啟用正在送出的匯出按鈕  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-export-dialog.js:94  
  confidence  -> CONFIRMED  
  scenario    -> 使用者在浮水印或投遞比例資料尚未載完時按「開始匯出」；按鈕於第 133 行停用，但資料回來後 `refresh()` 重建按鈕。若第一次建立任務仍在等待，使用者可再按一次；請求未帶 `idempotencyKey`，後端會建立兩個匯出任務。  
  why missed  -> 驗收等待對話框狀態穩定才匯出，未涵蓋載入與送出重疊的時序。

TOTAL: 2 findings
