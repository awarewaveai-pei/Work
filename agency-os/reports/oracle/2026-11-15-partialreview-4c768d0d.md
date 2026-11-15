# codex-oracle review -- 2026-11-15 21:40:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed6-audio.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator asked how to find music later; adds a search box to the editor audio pane: every space-separated word must appear (case-insensitive) in a built-in item's title/use/genre key/genre label, or a library asset's name; genre button counts follow the search; no-match message; the input repaints via edRedraw and restores focus/caret (same pattern as text.js). Only the search hunks in audio.js and the new search block in tests/ed6-audio.cjs are this change. Look for: XSS in the no-match message, broken empty states, the library list let/const change, caret/focus loss, interaction with genre selection when the selected genre disappears from results.
- exit: 0 | elapsed: 150084ms | answer: 1592B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed6-audio.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 搜尋結果讓已選曲風消失後，畫面顯示「全部」，清除搜尋卻會跳回舊曲風
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js:231
  confidence  -> CONFIRMED
  scenario    -> 選「Lo-fi」→ 搜尋只符合「流行」的曲目，畫面顯示「全部」已選取 → 清除搜尋；清單重新只顯示 Lo-fi，因為 `edAudUi.genre` 從未改成「全部」。
  why missed  -> 測試先按「全部」才搜尋，沒有從已選曲風開始。

FINDING 2: 曲庫載入完成時的非同步重繪會奪走搜尋框焦點
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js:647
  confidence  -> CONFIRMED
  scenario    -> 開啟音訊面板，在素材清單仍載入時開始輸入 → 這次輸入會恢復焦點；隨後 `edAudLoad()` 完成並在第 76 行再次重繪，搜尋框被替換，後續按鍵不再輸入其中。
  why missed  -> 測試等到曲庫項目出現後才操作搜尋框。

FINDING 3: 中文輸入法組字期間重建搜尋框，會中斷尚未確認的文字
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js:647
  confidence  -> PLAUSIBLE
  scenario    -> 使用中文輸入法輸入「旅遊」→ 組字中的 `input` 事件觸發整頁重繪並替換正在組字的元素；候選字確認可能失敗或只留下部分文字。
  why missed  -> 新測試只用 `fill()` 輸入已完成的字串，沒有測組字事件。

TOTAL: 3 findings