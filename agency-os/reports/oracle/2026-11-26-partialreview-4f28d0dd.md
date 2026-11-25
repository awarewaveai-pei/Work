# codex-oracle review -- 2026-11-26 01:33:14 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: not a fix. Operator: a block is a part you can assemble into different systems, like LEGO. (1) blocks.ts: 24 platform/ops bricks added (B-066..B-089: AI gateway, ops inbox, repair, schedules, change gate, client context, kb, R2, payments, invites, roles, security, tenant guard, audit, login, ...), B-001/B-005 now cover lib/entitlements/ and lib/portal/, product modules cover their lib folder; new layer ops. usedBy computed from real @/ imports. (2) blocks.test.ts: importer check handles folder and app entries; new check: every file imported via @/ by >=2 registry systems must be inside a live block entry or registry shared_paths. (3) overview.ts: overviewGroup() extracted from overviewCounts (same semantics) and reused by the blocks page system filter buttons (全部/開發中/待確認/維護與已完成/沒用積木, grp param in catalogHref).
- exit: 0 | elapsed: 146709ms | answer: 661B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/blocks/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/blocks.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/overview.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 共用檔案檢查會漏掉有效的 JavaScript 與 JSON 匯入
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts:117
  confidence  -> CONFIRMED
  scenario    -> 兩個已登記系統都透過 `@/` 匯入同一個未列入積木的 `.js` 或 `.json` 檔案時，程式可依 `tsconfig.json` 的 `allowJs` 與 `resolveJsonModule` 設定使用它；測試卻只嘗試解析 `.ts`／`.tsx`，因此不會把該檔加入共用檔案檢查，仍會通過。
  why missed  -> 新檢查沿用了只掃 TypeScript 檔案的解析範圍，未對照專案允許的模組類型。

TOTAL: 1 findings