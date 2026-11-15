# codex-oracle review -- 2026-11-15 11:36:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/cover.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.2 round 3. Round-2 fix: backend/cover.cjs pickTimes now returns candidates best-first (index 0 = highest contrast = the default cover read by next-admin cover.ts as cover:<job>:0); tests pin it. cover.cjs also gains stillJpeg/framePng (a behaviour-preserving refactor of the JPEG step plus an untitled-frame PNG helper for the later AI-cover card); autoCovers output is unchanged otherwise.
- exit: 0 | elapsed: 243166ms | answer: 1255B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/cover.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 封面登記逾時後失敗，瀏覽器可能永遠不觸發重試  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js:401  
  confidence  -> CONFIRMED  
  scenario    -> 影片已取得 `assetId`，封面登記仍在進行；10 秒等待到期時，`api.cjs:966` 不會回傳 `ledgerPending`。若登記隨後失敗，瀏覽器保存的任務既沒有 `coverRegisterError`，也已有對應資產，`runtime.js:401-403` 不再查詢；伺服器雖記下錯誤，卻等不到下一次 GET 重試。  
  why missed  -> 測試讓封面登記在首次回應前失敗，沒有覆蓋逾時後才失敗的情況。

FINDING 2: 缺少第 0 張候選時，資料庫查詢會選錯預設封面  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts:42  
  confidence  -> CONFIRMED  
  scenario    -> 一支影片有較早上傳的封面和 `cover:<job>:1` 自動候選，但第 0 張候選已刪除。`coversOf` 依規則選第 1 張自動候選；`chosenCover` 只查 `:0`，因此退回較早上傳的封面。  
  why missed  -> 測試涵蓋第 0 張存在，以及完全沒有自動候選；沒有涵蓋只剩後續候選的狀態。

TOTAL: 2 findings
