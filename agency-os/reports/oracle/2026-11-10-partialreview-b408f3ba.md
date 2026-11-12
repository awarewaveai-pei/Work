# codex-oracle review -- 2026-11-10 22:27:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/fillers.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-fillers.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed11-fillers.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card ED.11 剪贅字 pane: FillerCut (pure, in fillers.js, require()-able by the test) plans cut ranges from word times on a text track (TranscriptWords.cutRanges, same recording = the V1/A1 clip under each word) and applies them to a project in frames: main video, overlays, narration A1 and text tracks are split/shortened and close up; music (audio tracks other than A1) is never cut, only shortened where it ran to the old picture end; subtitle words shift with their sound and a spelled line drops cut words; markers move. Pane: slider, filler checkbox, language, recognition via the ED.10 whole-project job priced first, result into a hidden text track. Look for: frame math errors, source offset with speed, keys windowing, words mapping, sync between V1 and A1, music handling, undo/magnet interaction, priced-run guard.
- exit: 0 | elapsed: 197135ms | answer: 2318B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/fillers.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-fillers.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed11-fillers.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 多次剪除後，專案會超過匯出的片段上限
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs:127
  confidence  -> CONFIRMED
  scenario    -> 專案原有一段 V1 和一段 A1，剪除 32 處停頓後各變成 33 段；66 段非文字片段超過匯出的 64 段上限。「剪掉」可完成，但匯出報「片段資料無效」。
  why missed  -> 上限設在 diff 以外的匯出驗證器，測試只剪兩處。

FINDING 2: 第二段以後的音量與變形關鍵影格取自已裁短的第一段
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/fillers.js:125
  confidence  -> CONFIRMED
  scenario    -> 原片在影格 0 與 90 有不同音量，影格 30–42 被剪掉；第一段先將 `c.volumeKeys` 裁至影格 30，下一段再從這組已裁短的鍵計算，因此原本影格 90 的音量變化消失。`transformKeys` 在第 126 行同樣受影響。
  why missed  -> `pieces.forEach` 的第一輪直接修改原片段，後續輪次仍把它當作原始資料。

FINDING 3: 字幕句的所有字被剪掉時，畫面仍顯示原文
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/fillers.js:109
  confidence  -> CONFIRMED
  scenario    -> 一句字幕長 2 秒，文字與唯一逐字項都是「嗯」，語音只佔中間 0.5 秒；剪除該字後字幕片段仍有長度，程式刪除 `words` 卻保留 `text: "嗯"`，匯出會把「嗯」當靜態字幕顯示。
  why missed  -> 文字改寫條件要求 `kept.length` 非零，測試只涵蓋一句還留有其他字的情況。

FINDING 4: 片段開頭位於剪除範圍時，後續分段的來源起點累加兩次
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/fillers.js:124
  confidence  -> CONFIRMED
  scenario    -> 片段從影格 60 開始，剪除範圍是 30–90 與 120–135；第一個保留段將原片段的 `sourceStartFrame` 加上 30，第二個保留段又以已修改的值加上從原起點算出的 75，結果跳到來源影格 105，正確值應為 75。
  why missed  -> 測試中的 V1、A1 都從影格 0 開始，第一個保留段沒有來源偏移。

TOTAL: 4 findings
