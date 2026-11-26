# codex-oracle review -- 2026-11-26 10:43:11 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/block-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/gen-block-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/blocks.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/blocks/page.tsx, .github/workflows/block-usage-refresh.yml, agency-os/systems/registry.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator: a small helper is not a LEGO block, and feature work must never be blocked by the catalog. B-078/081/083/084/089 retired to registry shared_paths (共用小工具); block-usage.generated.json becomes {usedBy, shared, pending} via scanCatalog; the CI tests no longer gate who-imports-what (only catalog self-consistency + scan file shape); new .github/workflows/block-usage-refresh.yml regenerates after every push, commits with GITHUB_TOKEN (retry on rejected push) and dispatches next-admin-test/typecheck so check-ci-green (runs?branch=main, newest run on commit or ancestor) sees the bot commit; page shows 待歸類 and 共用小工具.
- exit: 0 | elapsed: 120609ms | answer: 1111B
- files-reviewed: agency-os/systems/registry.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/blocks/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/block-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/blocks.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/gen-block-usage.ts, .github/workflows/block-usage-refresh.yml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 新增功能仍會被目錄覆蓋測試擋住
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts:72
  confidence  -> CONFIRMED
  scenario    -> 功能開發新增一個後端 block ID，但尚未更新 LEGO 目錄 → `npm test` 因未列入 `covers` 而失敗，與「feature work must never be blocked by the catalog」相反。
  why missed  -> 作者移除了匯入關係檢查，但保留了要求新功能先登錄目錄的覆蓋檢查。

FINDING 2: 新的 scan file shape 測試會放過錯誤的 `usedBy` 值
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts:100
  confidence  -> CONFIRMED
  scenario    -> `usedBy` 含有 `"B-001": "social"` 而非字串陣列，且 `shared`、`pending` 是空陣列 → shape 測試通過；`withImporters` 隨後把字串展開成單一字元，產生錯誤的系統關聯。
  why missed  -> 測試只驗證 `usedBy` 的鍵是否為既有編號，沒有驗證其值；TypeScript 型別轉換不會檢查 JSON。

TOTAL: 2 findings