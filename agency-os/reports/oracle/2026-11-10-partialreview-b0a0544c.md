# codex-oracle review -- 2026-11-10 22:32:44 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-assets.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p3-roundtrip.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/editor-media-picker.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed2-timeline.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.4 parity fix after reading the reference editor's own JS: asset card adds on double-click/Enter/+ only (single click does nothing); 上傳素材 only adds library assets listed in 本次上傳 (sessionStorage, survives reload in the tab) and no longer adds to the timeline, except kind-suffixed upload:image/upload:audio fired by other panes; 拆出音軌 saves a new audio asset (same file url and origin as the video, id <videoId>#audio so idempotent) instead of adding a clip; rights checkbox (shared VideoWorkbench.rightsCheckbox) added under the upload button; empty state text 無符合條件的素材. Tests p3-roundtrip, editor-media-picker, ed2-timeline updated for the new add gesture. Look for correctness bugs, stale state, XSS, duplicate/ghost assets.
- exit: 0 | elapsed: 295965ms | answer: 1670B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-assets.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed2-timeline.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/editor-media-picker.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p3-roundtrip.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 搜尋素材時，軌道名稱可繞過清理並執行注入的 HTML
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:110
  confidence  -> CONFIRMED
  scenario    -> 匯入備份內的軌道名稱含 `"><img src=x onerror=alert(1)>`；從該軌道按 ＋ 開啟素材面板後輸入搜尋字，未清理的卡片 HTML 由 assets.js:128 寫入 `innerHTML`，觸發程式碼執行。
  why missed  -> 一般整頁繪製會呼叫 `VideoWorkbench.sanitize`；搜尋時的局部重繪沒有。

FINDING 2: 再按「拆出音軌」會覆寫使用者已改名的音訊素材
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:230
  confidence  -> CONFIRMED
  scenario    -> 使用者拆出音軌後，在素材庫將它改名；再次按原影片的拆出音軌，固定 ID 的 `save` 會取代既有紀錄，把名稱改回「影片名（音軌）」並重設建立時間。
  why missed  -> 測試只確認相同 ID 不會產生第二筆，沒有檢查既有紀錄是否保留使用者修改。

FINDING 3: 刪除本次上傳的素材後，分頁數量仍計入已刪除項目
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:166
  confidence  -> CONFIRMED
  scenario    -> 本次上傳有 3 筆，使用者在素材庫刪除其中 1 筆；列表只能顯示 2 筆，但分頁仍顯示「本次上傳 (3)」，同一分頁重新整理後依舊如此。
  why missed  -> 數量直接取自持久化的 ID 集合；載入素材時沒有移除已不存在的 ID。

TOTAL: 3 findings
