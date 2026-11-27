# codex-oracle review -- 2026-11-27 15:45:37 +08:00

- mode: `review`
- scope: whole repo
- target: `f344fec80..43b200bc8`
- context: U25: feature-layer catalog fields with one inheritance function featureCatalog(), 50 features filled, cognitive 300 methods' tasks derived from a prefix->group table, new-product.mjs asks feature tasks. U24: portal launcher server component reads ops_audit_events entitlement.usage for ONLY the signed-in person (payload actor == client:<org>:<uid>, org from requireClientOrg, uid from x-ops-user-id) and shows recent 5 / top 3 in 30 days. Focus: privacy (another person's or another unit's usage leaking), actor format matching can.ts, inheritance correctness.
- exit: 0 | elapsed: 190078ms | answer: 1105B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/RecentSection.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/__tests__/recent.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/catalog-vocab.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, scripts/new-product.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 一次付費 AI 使用會被算成兩次「常用」。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/RecentSection.tsx:39
  confidence  -> CONFIRMED
  scenario    -> 使用者完成一次有費用的文章生成：`gateway.ts:19` 的 `recordUse()` 寫入一筆 `entitlement.usage`，`log-ai-call.ts:197` 的 `report()` 又經 `can.ts:209` 寫入一筆；此處逐筆加總，畫面顯示「2 次」。
  why missed  -> 新測試每次使用只造一筆 audit row，沒有走實際計費流程。

FINDING 2: 超過 1,000 筆使用時，「常用」不再是 30 天內真正的前三名。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/RecentSection.tsx:61
  confidence  -> CONFIRMED
  scenario    -> 同一人 30 天內最近 1,000 筆都使用 A，之前另有 1,001 筆使用 B；查詢截掉 B，畫面把 A 列為最常用，儘管 B 的總次數較高。
  why missed  -> 新測試的資料量遠低於上限，且最近清單與頻率排行共用同一批截斷資料。

TOTAL: 2 findings