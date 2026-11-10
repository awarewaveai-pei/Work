# codex-oracle review -- 2026-11-10 11:12:56 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj3-arrange.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card PJ.3 second round after fixes. Round 1 findings: F3 (undo of an auto-placed voice-over re-placed it) fixed by p.spinePlaced record kept across undo/redo in edAction undo branch; F2 (video shorter than shot.seconds shifts later shots) intentionally NOT changed: a kept gap exports as black and the editor's magnetic main track closes gaps on the next edit, so clips follow actual footage; F1 (FilmCraft episodes) out of scope per spec section 8 C4. Check the PJ.3 functions edArrange/edSpineSubtitles/edSpineVoice/edPlaceSpine/edSpineButtons/edSpineAction/edIntent and the undo change for regressions.
- exit: 0 | elapsed: 130768ms | answer: 1199B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj3-arrange.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 部分配音任務送出失敗後，重按按鈕會重複建立已送出的付費任務
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js:982
  confidence  -> CONFIRMED
  scenario    -> 第一、二句配音已建立，第三句送出失敗；使用者重按「配音」，迴圈從第一句重新建立任務，造成重複計費。每次建立任務都取得新的提交識別碼（shared/runtime.js:301）。
  why missed  -> 只處理單次按鈕操作中的連續送出，未處理部分成功後的重試。

FINDING 2: 重排會刪除使用者複製的鏡頭片段
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js:928
  confidence  -> CONFIRMED
  scenario    -> 使用者複製一段已排上的鏡頭；複製功能保留原片段的 `slot`（tools-editor.js:2359）。再次按「排成時間軸」時，所有帶 `slot` 的主軌片段都被移除，使用者複製的片段因此消失，與確認視窗「你自己加的片段不會動」相反。
  why missed  -> 測試只用 `edAdd` 加入沒有 `slot` 的片段，未涵蓋複製既有鏡頭。

TOTAL: 2 findings
