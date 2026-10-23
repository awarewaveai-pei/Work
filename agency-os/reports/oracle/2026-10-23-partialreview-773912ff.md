# codex-oracle review -- 2026-10-23 17:18:11 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/doors.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tarot/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tarot/page.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 018 section 2 door rules (2026-10-23). doors.ts: doorApis(product) = own door.api + door.api of every product in its dependsOn closure + PLATFORM_APIS (/api/tools/designs, /api/entitlements/features); isProductPath now uses it, so routeOnProductDoor (which APIs pass on a door) and middleware isClientOutsideDoor (which paths a client identity may use) agree. Optional products' APIs are deliberately not served. Tests: registry-code gate 1 uses doorApis; new gate 3: every route under a served door's doorApis imports (transitively) lib/tenant-guard or lib/social/authz; platform routes must reach lib/tenant-guard. products.test staffSegments: a route-group dir with the door page's name is a clash for an OPEN door (reserved doors may share, see middleware-door.test.ts). Tarot door opened: app/tarot/{layout,page}.tsx reuse TarotStudio, registry enabled flag removed (DNS/nginx not touched: going live is a separate step). Check: does serving dependsOn/platform APIs on a door widen what a client identity can reach beyond what those routes authorize; does the transitive-import check for authorization accept a route that imports tenant-guard but never uses it on its data path; any door now reachable that should not be.
- exit: 0 | elapsed: 310645ms | answer: 650B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/doors.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tarot/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tarot/page.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Authorization gate proves only import presence, not authorization on the data path
  `lib/portal/__tests__/registry-code.test.ts:205` -> `lib/portal/doors.ts:84`
  confidence  -> CONFIRMED
  scenario    -> A served API route imports `tenant-guard` but returns tenant data without invoking it; the test passes because `importClosure()` finds the file, while `isProductPath()` exposes that route on every matching product door, allowing cross-tenant data access.
  why missed  -> The gate equates transitive import presence with runtime authorization and does not inspect calls, control flow, or query scoping.

Final line: TOTAL: 1 findings
