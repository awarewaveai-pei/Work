# codex-oracle review -- 2026-11-10 11:09:12 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj3-arrange.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card PJ.3 (spec lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/pj-project-spine-spec-20261106.md section PJ.3): shot.line field; /director/shots returns line; editor top bar 排成時間軸 (edArrange: shots with picture -> main-track clips with slot shot:<id>, length shot.seconds, user clips without slot untouched, one undo step), 用旁白產生字幕 (edSpineSubtitles: text clips slot line:<id> timed as the shot clip), 配音（照旁白逐句） (edSpineVoice: one paid voice job per line with link target line:<id>, only on click), edPlaceSpine (settled voice steps placed once per jobId on first audio track at shot clip start; queued); projects page steps 6-8 open the editor with editIntent (paid one only focuses its button). Look for: double placement, lost user clips, paid job created without a click, wrong timing, undo breakage, races between vw:changed and render.
- exit: 0 | elapsed: 151324ms | answer: 1588B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj3-arrange.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: FilmCraft 剪輯檔的第 6–8 步無法執行新增動作
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js:643
  confidence  -> CONFIRMED
  scenario    -> 某集的 `edit.engine` 是 `filmcraft` → 專案頁開啟 `edit-pro`，但此處只在 `tool === "edit"` 時處理 `editIntent` → 排時間軸、字幕與配音按鈕都不會出現或執行。
  why missed  -> 改動集中在自製剪輯器；專案頁原有的 FilmCraft 開檔路由不在這段 diff。

FINDING 2: 短於鏡頭時長的影片會讓後續鏡頭與字幕提前
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js:932
  confidence  -> CONFIRMED
  scenario    -> 第一鏡設定 8 秒、影片素材只有 4 秒，第二鏡設定 5 秒 → `Math.min` 把第一段排成 4 秒，第二鏡及其字幕從第 4 秒開始，而非規格要求的第 8 秒。
  why missed  -> 測試影片長於鏡頭設定時長，沒有覆蓋短素材。

FINDING 3: 復原自動放置的配音後，配音會再次被放上時間軸
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js:1011
  confidence  -> CONFIRMED
  scenario    -> 已結算配音自動上軌 → 使用者按「復原」，快照同時移除音訊片段及 `spinePlaced` 記錄 → 存檔廣播 `vw:changed` 後，此條件再次把同一任務列入待放清單，復原失效。
  why missed  -> 測試只驗證連續呼叫不重複，沒有驗證復原後的事件回放。

TOTAL: 3 findings
