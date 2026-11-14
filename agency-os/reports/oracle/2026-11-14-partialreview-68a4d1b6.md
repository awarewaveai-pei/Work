# codex-oracle review -- 2026-11-14 09:20:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.1 round 3: free cover candidates at export. Round-2 fixes: covers stop on the job signal (cancel/deadline) or their own 120s limit, and the export returns without marking succeeded when job.status became cancelled meanwhile (cancel wins, as at api.cjs music path); cover.cjs removes the JPEG being written when a run fails (test with a failing runner)
- exit: 0 | elapsed: 200853ms | answer: 700B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 匯出逾時後仍會標成成功，瀏覽器卻已停止追蹤任務
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:653
  confidence  -> CONFIRMED
  scenario    -> 編輯器匯出在 10 分鐘期限前完成影片儲存，但製作封面時期限到達；job signal 中止封面，`addCovers` 吞下錯誤後只檢查 `cancelled`，接著把任務標成 `succeeded`。瀏覽器的追蹤條件已在 `shared/runtime.js:411` 因 `deadlineAt` 過期而停止，使用者不會即時看到成功結果。
  why missed  -> 修正聚焦於「取消優先」，沒有同時檢查期限訊號與瀏覽器停止追蹤的條件。

TOTAL: 1 findings
