# codex-oracle review -- 2026-11-25 23:31:23 +08:00

- mode: `review`
- scope: -Path agency-os/systems/registry.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/README.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/sidebar-coverage.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: not a fix. Final version after round 1 (round 1 findings fixed: coverage test now reads the backend registry listAll() so loop-built Apify ids search/dcard|x|tiktok|instagram are covered by B-008; heat map rows = every registered system plus catalog-only slugs). LEGO block catalog lib/systems/blocks.ts + test, page /ops/systems/blocks, shared parts.tsx, overview.projectAll, [slug] used blocks, README pointer, registry phase lego-catalog, sidebar-coverage entry.
- exit: 0 | elapsed: 178191ms | answer: 1209B
- files-reviewed: agency-os/systems/registry.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/__tests__/systems-access.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/parts.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/sidebar-coverage.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/README.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/overview.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/blocks/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/blocks.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 設定自訂 RSS 後，積木覆蓋測試會錯誤地擋下部署  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts:77`  
  confidence  -> CONFIRMED  
  scenario    -> 設定有效的 `CONTENT_TRENDING_FEEDS`，例如 ID 為 `hn` 的來源；`trending-sources.ts:506–519` 會註冊 `search/hn`，但 B-008 的 `covers`（`blocks.ts:106–107`）只列固定 ID，測試因此失敗。  
  why missed  -> 測試環境沒有設定自訂來源時，`listAll()` 只回傳固定 ID，測試會通過。

FINDING 2: 事件讀取達上限時，新頁面仍把不完整的系統進度當成完整結果顯示  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/blocks/page.tsx:172`  
  confidence  -> CONFIRMED  
  scenario    -> 狀態事件超過 `store.ts:15` 的 5,000 筆上限時，`readProjectionInput` 回傳 `capped: true`；積木頁忽略該值，仍在熱圖顯示可能算錯的狀態與完成度。原總覽頁在 `page.tsx:264` 會提示資料截斷。  
  why missed  -> 共用 `projectAll` 時沿用了投影結果，卻沒有一併沿用截斷警示。

TOTAL: 2 findings