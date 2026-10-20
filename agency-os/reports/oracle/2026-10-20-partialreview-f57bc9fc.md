# codex-oracle review -- 2026-10-20 08:26:28 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/doors.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/middleware-door.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Let anonymous visitors reach the public smart link page /smartlink/<slug> (and its /go/<item> GET redirect) ONLY on the social product door (social.aware-wave.com, host from config), 404 on staff/portal/other doors, with all client identity headers stripped. Mechanism: products.ts door.anonymous prefixes (SSOT); doors.ts isAnonymousPath, included in isProductPath (so routeOnProductDoor passes instead of rewriting under /social) and productPageOwner (so isWrongHostForProductPage 404s other doors); middleware.ts passthrough for an anonymous path on its own door, placed after the door/host checks and header stripping, before the session gate. Matcher and nginx unchanged. Registry test: anonymous prefixes do not overlap any door page/api, files under them live in app/(public), no 'use server', routes export GET and no write methods. Look for auth bypass, host confusion, path-boundary, rewrite or header-spoof holes.
- exit: 0 | elapsed: 148804ms | answer: 710B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/doors.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/middleware-door.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Portal’s nginx rewrite bypasses the new wrong-host guard, so anonymous portal requests redirect to login instead of returning 404.
  `nginx/default.conf:442` -> `apps/next-admin/middleware.ts:236,312,162`
  confidence  -> CONFIRMED
  scenario    -> Anonymous `GET https://portal.aware-wave.com/smartlink/soulful` is rewritten to `/portal/smartlink/soulful`; `productPageOwner` no longer recognizes `/smartlink`, the anonymous branch is skipped, and middleware returns a login redirect instead of 404.
  why missed  -> The test sends `/smartlink/soulful` directly to middleware at `lib/portal/__tests__/middleware-door.test.ts:26`; it does not model nginx’s `/portal/` rewrite.

TOTAL: 1 findings
