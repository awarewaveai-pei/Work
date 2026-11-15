# codex-oracle review -- 2026-11-15 12:30:53 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/r2-delete-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/storage/r2.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/cleanup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/r2-delete-shape.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/r2-delete-guard.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: R2DEL production data-loss fix. Bug: deleting ONE workbench video (gallery DELETE /api/video/[id], or the weekly cleanup cron for mp4 rows older than 30 days) passed video/workbench/<org>/<sha>.mp4 to deleteVideoObjects, whose regex took dir = workbench/<org> and listed+deleted every object of the organization's workbench library. Invariant: a delete removes only what belongs to that video. The key shape decides (no workbench special case): a content-addressed key (file name = 64-hex sha256, r2.ts isContentAddressedKey) is a single shared object -> deleted alone, and only when no OTHER media_assets row (object_key raw or percent-encoded, excluding the rows the caller is deleting: exceptAssetIds) uses it; no exceptAssetIds or a failed check = nothing deleted; a still-used object answers ok deleted 0 kept shared so the caller drops only its own row. video/<dir>/<format>.mp4 keeps one-folder-per-video. r2.ts deleteVideoObjects itself refuses a content-addressed key (defense in depth). Tests run the real r2.ts delete code against an in-memory bucket; four mutations (each guard, both, the shared check) each turn a named test red.
- exit: 0 | elapsed: 154415ms | answer: 732B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/cleanup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/r2-delete-guard.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/r2-delete-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/storage/r2.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/r2-delete-shape.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 並行上傳可在引用檢查後建立新資料列，隨後刪除其 R2 物件
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/r2-delete-guard.ts:179
  confidence  -> CONFIRMED
  scenario    -> 刪除程序查到沒有其他資料列；同時，工作台上傳程序先將相同內容寫入 R2，後建立新的 `media_assets` 資料列（`app/api/internal/video/workbench/assets/route.ts:209,221`）。刪除程序接著執行 R2 DELETE（`r2-delete-guard.ts:198`），新資料列便指向已刪除的物件。
  why missed  -> 新測試只在固定資料列集合上執行刪除，沒有交錯執行實際的「先上傳物件、後建立資料列」流程。

TOTAL: 1 findings
