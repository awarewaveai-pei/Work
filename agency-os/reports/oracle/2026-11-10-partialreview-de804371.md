# codex-oracle review -- 2026-11-10 11:17:12 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj3-arrange.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card PJ.3 round 3. Invariants now enforced: (1) clip.slot marks a clip the episode placed; only edArrange/edSpineSubtitles/edPlaceSpine set it, and edPlace copies drop slot/jobId, so a redo removes only episode clips; (2) a paid voice job is sent only on click, once per (shot id, line text) unless the earlier job failed/cancelled (edUnvoiced checks settled steps and the job list); (3) p.spinePlaced records placed voice jobIds and survives undo/redo, so a deleted or undone voice-over never returns. Round 2 fixed: partial-failure retry double charge; copied shot clip removed on re-arrange. Report only real defects in these functions.
- exit: 0 | elapsed: 118353ms | answer: 1314B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj3-arrange.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 服務端明確拒絕的配音任務會永久擋住重試
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js:981
  confidence  -> CONFIRMED
  scenario    -> 配音送出時服務端回 503；runtime 將任務記為 `blocked` 並標記 `submissionRejected`（shared/runtime.js:327–334）。使用者排除故障後再按配音，`edUnvoiced` 仍把該任務視為「已送出」，不建立新任務。
  why missed  -> 重試條件只排除 `failed`、`cancelled`，漏了上游用來表示「確認未送出」的 `blocked`。

FINDING 2: 重新排鏡頭後，已放置的配音和字幕留在舊時間
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js:928
  confidence  -> CONFIRMED
  scenario    -> 第一鏡原在 0 秒，已有對齊的配音與字幕；使用者刪除第一鏡並在 0–3 秒放入自己的片段，再按「排成時間軸」。第一鏡被重建在 3 秒，但此函式只替換主軌鏡頭；原配音和字幕仍從 0 秒開始。`spinePlaced` 又使配音不會重新放置（tools-editor.js:1025）。
  why missed  -> 測試驗證了首次放置與重排後保留使用者片段，沒有驗證重排前已存在的跨軌內容是否仍對齊。

TOTAL: 2 findings
