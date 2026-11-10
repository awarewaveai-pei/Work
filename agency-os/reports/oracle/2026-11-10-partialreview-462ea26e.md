# codex-oracle review -- 2026-11-10 16:11:17 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-audio.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed6-audio.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/assets/audio-library.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card ED.6: editor audio pane (spec lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/editor-parity-spec-20261106.md section 1.3 audio). Six usage categories by asset tag, target track A2/A1, built-in library read from assets/audio-library.json (files flat in assets/, exporter backend/editor-export.cjs:466 reads them), audio settings stored on p.audioSettings {snap,duck,loop} working through existing clip fields (duck from ED.3, loop = copies marked loopOf, master volume = target track volume via the core track-db field), AI narration posts the existing type audio/operation voice job with price shown first by shared/paid-price.js. Old projects without audioSettings must be unchanged. Shared files (tools-editor.js, editor-model.js, editor-export.cjs) intentionally not changed. Look for correctness bugs: undo/save, loop copies validity in the exporter, duck semantics, favourites preference races, XSS via esc, upload tagging.
- exit: 0 | elapsed: 165248ms | answer: 1956B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/assets/audio-library.json, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-audio.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed6-audio.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 短音檔循環會超過匯出器的片段上限
  file:line   -> `scripts/editor-panes/audio.js:135`, `backend/editor-export.cjs:128`
  confidence  -> CONFIRMED
  scenario    -> 70 秒影片搭配 1 秒配樂並開啟循環，會產生 69 個複本；匯出器因非文字片段超過 64 個而拒絕整個專案。
  why missed  -> 測試只用 4 秒音檔與 12 秒影片，沒有碰到匯出器的既有上限。

FINDING 2: 影片長度改變後，循環不會跟著更新
  file:line   -> `scripts/editor-panes/audio.js:204`, `scripts/tools-editor.js:1817`, `backend/editor-export.cjs:261`
  confidence  -> CONFIRMED
  scenario    -> 開啟循環後再加入一段主影片，新增影片會正常儲存及匯出，但配樂複本仍停在舊片尾，新段影片沒有配樂。
  why missed  -> 循環只在加入音訊或切換設定時重算；既有主影片編輯流程不會呼叫它。

FINDING 3: 開啟循環後新增配樂，可能被舊複本推到片尾之外
  file:line   -> `scripts/editor-panes/audio.js:185`, `scripts/editor-panes/audio.js:204`, `scripts/editor-panes/audio.js:127`
  confidence  -> CONFIRMED
  scenario    -> 60 秒影片已有配樂循環到片尾；在第 3 秒加入另一首配樂時，尋找空位會把舊循環複本算作佔用，將新配樂放在第 60 秒之後；隨後舊複本被刪除，影片內反而留下配樂空白。
  why missed  -> 新增流程先找空位，之後才移除並重建循環複本。

FINDING 4: 音量關鍵影格會使不足一輪的最後複本建立失敗
  file:line   -> `scripts/editor-panes/audio.js:150`, `shared/editor-model.js:170`
  confidence  -> CONFIRMED
  scenario    -> 10 秒影片、4 秒配樂，配樂在第 3 秒有音量關鍵影格；開啟循環時最後一份複本只有 2 秒，驗證函式因關鍵影格超出複本長度而拋錯，循環設定無法完成。
  why missed  -> 測試音檔沒有音量關鍵影格。

TOTAL: 4 findings
