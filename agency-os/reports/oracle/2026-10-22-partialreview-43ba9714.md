# codex-oracle review -- 2026-10-22 23:15:34 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/designs-list.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/asset-group.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: My Designs filter chips: numbers and items kept changing. Fix: product/theme/brand chip SETS are computed on the scope only (org + tab), so picking another filter never removes a row or chip (zero counts shown); each chip count stays faceted (other dimensions applied, its own omitted); each row's ?券 now uses facets.all[dim] = count with that row's own filter omitted (it showed the fully-filtered total). TAROT_SOURCES is the single tarot source list and gains 'tarot-preview-edit' (counted under ?券 only before); assetToolGroup and the gallery's assetProduct/isTarotSrc read it. Check: org visibility guard still applied to every scope query (applyFilters), and the extra count queries. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 431645ms | answer: 594B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/asset-group.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/designs-list.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Scope facet discovery silently omits valid theme/brand chips after the first 2,000 rows.
  file:179,190-193   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/designs-list.ts:179,190-193
  confidence  -> CONFIRMED
  scenario    -> An org/tab scope has 2,000 assets with theme `A` and a 2,001st asset with theme `B`; the unbounded scope query is limited to 2,000 rows, so `B` is absent and its chip never appears.
  why missed  -> The new test exercises only three added studio assets, so it never crosses the existing `limit(2000)` boundary.

TOTAL: 1 findings
