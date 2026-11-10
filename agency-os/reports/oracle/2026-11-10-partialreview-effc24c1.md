# codex-oracle review -- 2026-11-10 11:48:01 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj5-deleted-edit.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/pj-project-spine-spec-20261106.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card PJ.5 per lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/pj-project-spine-spec-20261106.md section 3.4: after an edit file or a project is deleted -- (a) an episode whose edit file is gone shows 剪輯檔已刪除 and 建立剪輯檔 makes and attaches a new one; (b)(c) EpisodeSpine.adopt takes known = edit ids ever linked (runtime stores it in preferences spine.linkedEdits) so a file whose episode or project was deleted is never adopted back. The editor list file scripts/editor-project-list.js belongs to another card and is not changed. Only report defects that break behaviour, lose data, or redden the main path.
- exit: 0 | elapsed: 136071ms | answer: 615B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/pj-project-spine-spec-20261106.md, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/pj5-deleted-edit.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 專案頁無法刪除專案或集，PJ.5 的刪除情境只能靠測試直接改寫資料
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js:133
  confidence  -> CONFIRMED
  scenario    -> 使用者要刪除已連結剪輯檔的專案或一集 → 專案頁只有開啟專案、新增集等控制項，沒有刪除入口；測試在 tests/pj5-deleted-edit.cjs:79-82 直接改寫儲存資料，因此仍可通過。
  why missed  -> 作者驗證了刪除後的 `adopt` 行為，測試卻繞過了使用者實際需要的刪除操作。

TOTAL: 1 findings
