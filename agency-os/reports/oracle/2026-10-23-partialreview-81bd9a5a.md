# codex-oracle review -- 2026-10-23 15:30:14 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ProductDoorShell.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/social/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/products/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 order 8 / ADR 018 product doors, phase 0. Two gate tests in lib/portal/__tests__/registry-code.test.ts apply to every served door (doors.ts servedNextAdminProducts): (1) every /api URL that the door's pages request (scanner field `calls`: string/template passed to a call or `new`, or a JSX attribute; type-only imports skipped) is under the product's own door.api, because routeOnProductDoor 404s any other API on a product door; (2) no file transitively imported from the signed-in door page directory imports lib/supabase-server (service role), because a customer on a door must see only brands they belong to (ADR 018 section 1). No-login pages (door.anonymous) are excluded from (2) on purpose: they are public by declaration and lib/social/smartlink.ts publicPage returns published data only. Route files are not traversed (pages fetch them; routes authorize themselves). Also: app/ProductDoorShell.tsx shared frame (social layout uses it, markup unchanged), new staff page app/(shell)/ops/products rendering products.ts, registered in BACK_OFFICE and the sidebar. Check: can either gate be satisfied while the invariant is violated (false negatives that matter), is excluding anonymous pages from (2) sound, does skipping type-only imports hide a runtime import. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 450042ms | answer: 1368B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/social/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/products/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ProductDoorShell.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The API gate misses URLs wrapped in expressions.
  file:line   -> registry-code.test.ts:46-51; doors.ts:73-76
  confidence  -> CONFIRMED
  scenario    -> `fetch("/api/tools/studio" as const)` on the social door -> `calls` records nothing, the gate passes, but the request receives 404.
  why missed  -> The scanner only inspects the direct argument node; it does not unwrap `as`, parentheses, or similar expressions.

FINDING 2: Template scanning trusts only the literal prefix.
  file:line   -> registry-code.test.ts:30-33, 46-51; doors.ts:73-76
  confidence  -> CONFIRMED
  scenario    -> `fetch(\`/api/social${"/../tools/studio"}\`)` -> scanner records `/api/social`, but the normalized request reaches `/api/tools/studio` and 404s.
  why missed  -> `apiText` discards everything after the template head.

FINDING 3: The service-role gate misses valid runtime imports outside import declarations and supported extensions.
  file:line   -> registry-code.test.ts:46-51, 73, 96-103; supabase-server.ts:26-38
  confidence  -> CONFIRMED
  scenario    -> A signed-in page uses `require("@/lib/supabase-server")` or imports `@/lib/supabase-server.js` -> traversal stops or records no import, the gate passes, and service-role code runs.
  why missed  -> The graph recognizes only import/export declarations and a narrow `.ts`/`.tsx` resolver.

TOTAL: 3 findings
