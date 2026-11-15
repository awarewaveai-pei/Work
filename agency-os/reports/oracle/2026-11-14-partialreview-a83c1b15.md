# codex-oracle review -- 2026-11-14 09:31:44 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/cover.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.2: register the workbench's cover candidates into media_assets. Workbench settleOnce registers each cover (after the video) as an image with X-VW-Meta coverOf=<video asset id>, coverKind, vwJobId cover:<job>:<i>; failure = job.coverRegisterError, retried by the next GET like releaseText. next-admin assets route accepts coverOf/coverKind (both or neither), refuses before any upload unless the target is a video of the same org and the file is an image. Which cover a video shows is decided only from the cover rows in lib/content/video/cover.ts coversOf (newest chosenAt, else auto candidate 0, else oldest); the video row is never written. cover.ts also holds chosenCovers/coverForRelease used by later cards.
- exit: 0 | elapsed: 191859ms | answer: 1181B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/cover.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 封面登記失敗後，工作台不會自動發出承諾的下一次 GET
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js:401
  confidence  -> CONFIRMED
  scenario    -> 成功的工作已有 `result.assetId`，但封面登記失敗並留下 `coverRegisterError` → `reconcileJobs` 因工作已成功且已有本地素材而排除它；後端只有收到下一次 GET 才重試，封面因而持續缺失。
  why missed  -> 新增了後端重試條件，卻沒有同步檢查瀏覽器決定哪些工作需要再次 GET 的條件。

FINDING 2: 封面查詢超過 PostgREST 回傳上限時，可能選到錯誤封面
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts:36
  confidence  -> CONFIRMED
  scenario    -> 使用預設 `PGRST_DB_MAX_ROWS=1000`，查詢範圍內已有 1001 張封面，最新選中的封面落在被截掉的資料列 → `coversOf` 看不到該列，改選舊封面；查詢沒有排序、分頁或截斷檢查。
  why missed  -> 單元測試直接交給 `coversOf` 完整列集，沒有經過 PostgREST 的回傳上限。

TOTAL: 2 findings
