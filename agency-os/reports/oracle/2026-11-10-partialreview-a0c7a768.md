# codex-oracle review -- 2026-11-10 11:38:41 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-compositor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-rig.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/tools.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj4-stale.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card PJ.4 per lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/pj-project-spine-spec-20261106.md section 2 PJ.4: one staleness rule EpisodeSpine.isStale; current/staleClip/outputStale/lineage; editor marks stale episode clips, 換成新的 swap, 重新配音這句 one paid line on click only, a new voice for a changed line takes over the stale clip; projects page 要重新輸出/開啟工具 and 怎麼做的 dialog; compositor and rig use isStale. Only report defects that break behaviour, lose data, or send paid jobs without a click.
- exit: 0 | elapsed: 161007ms | answer: 807B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-compositor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-rig.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/tools.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj4-stale.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1:「怎麼做的」會把未用於成片的舊素材列為製作來源  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js:242`  
  confidence  -> CONFIRMED  
  scenario    -> 鏡頭換圖後，舊圖仍留在剪輯檔的素材庫（`tools-editor.js:1142-1145`）。匯出任務帶入整份剪輯檔（`editor-export-dialog.js:54-57`），`settle` 將其中所有本機 URL 記為來源（`episode-spine.js:168`）；`lineage` 因而追溯舊圖的生成步驟，即使實際匯出只使用目前的片段（`backend/editor-export.cjs:448-449`）。對話框會錯誤宣稱舊圖參與了這支成片。  
  why missed  -> PJ.4 測試的匯出範例只列實際使用的素材，沒有包含剪輯檔素材庫中的舊圖。

TOTAL: 1 findings
