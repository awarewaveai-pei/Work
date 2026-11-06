# codex-oracle review -- 2026-11-06 14:58:14 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/pages/projects.html, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/pages/tools.html, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/app-entry.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-results.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-3d.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-compositor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p5-workspace.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/remotion-title-project.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj1-legacy-ui.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj1-spine-unit.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card PJ.1 of docs/pj-project-spine-spec-20261106.md (video-workbench): old editor projects are adopted into the projects page as episodes without changing the stored edit files; child pages whole-list writes must not drop runtime-owned episode fields (keepSpine); editor list now comes from episodes. Focus: data loss of tools.editor.projects, stale-copy overwrite races between iframes, broken existing flows.
- exit: 0 | elapsed: 134023ms | answer: 1259B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/pages/projects.html, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/pages/tools.html, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/app-entry.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-results.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-3d.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-compositor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p5-workspace.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj1-legacy-ui.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj1-spine-unit.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/remotion-title-project.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 從專案頁開啟既有 FilmCraft 剪輯檔時，不會開啟指定檔案
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js:817
  confidence  -> CONFIRMED
  scenario    -> 某集的 `edit` 指向已存的 FilmCraft 檔案 → 按「開啟剪輯」只切到 `edit-pro`；`acceptAsset` 沒有處理該檔案 ID，而 FilmCraft 必須經 `engineOpenProject(id)` 才會載入內容（`scripts/tools-engine-host.js:372-379`）→ 使用者看到空白引擎。
  why missed  -> 新測試只確認 `acceptAsset` 回傳 `{ ok: true }`，沒有確認引擎載入了原檔。

FINDING 2: 新存的 FilmCraft 剪輯檔不會立即進入專案頁
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js:187
  confidence  -> CONFIRMED
  scenario    -> 使用者在 FilmCraft 新建並儲存檔案 → `engineSaveProject` 只寫 `tools.engine.projects`（`scripts/tools-engine-host.js:316-320`），沒有呼叫 `spine.adopt` → 專案頁沒有對應集，直到整個主頁重新載入才會被收編。
  why missed  -> 收編測試覆蓋了啟動時的舊資料，以及一般剪輯器的新檔流程；FilmCraft 的儲存路徑是另一條。

TOTAL: 2 findings
