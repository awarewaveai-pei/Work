# codex-oracle review -- 2026-10-24 20:59:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ProductDoorShell.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/door-access.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/door-access.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/door-holds.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/hosts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Taking the video and design product doors live (ADR 018), with a new operator rule (2026-10-24): every feature is bought separately or given by us. (1) ProductDoorShell (the frame every door page renders in) now asks doorAccess: a client (x-ops-user-kind=client, set by middleware) enters only if its organization holds an active, current organization_entitlements row (contract or comp) of that product; otherwise it gets a not-enabled page; a failed lookup shows an error page, never the door; staff pass. The read is lib/entitlements/door-holds.ts (service-role, the table is service-role-only), scoped to x-ops-org-id; it is listed as the one exception in the door service-role gate. Applies to every door (social, tarot, studio live; video, design now). The only customer account (Soulful) holds all products. (2) Host-name helpers moved from doors.ts to hosts.ts (doors.ts re-exports) so a page can import them without the router. (3) video and design drop enabled:false; both hostnames join the shared lobster-nginx door block and the host nginx server_name lines. Verify: can a client without the product reach any door page or bypass the shell (a page or layout not wrapped in ProductDoorShell, a route group, loading/error files, parallel routes); can x-ops-org-id or x-ops-user-kind be supplied by the browser on a door host; is anything else needed for video or design to work on their hosts (APIs their pages call, static files the door nginx denies). Known and out of scope: API routes on a door are not gated by holding the product (each paid one asks can() per feature); points-only accounts are a pending ADR decision.
- exit: 0 | elapsed: 406268ms | answer: 1030B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ProductDoorShell.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/door-holds.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/door-access.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/door-access.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/hosts.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Invalid or missing tenant metadata is treated as staff, bypassing product entitlement checks  
  `middleware.ts:251-255` -> `lib/portal/door-access.ts:12-16`  
  confidence -> CONFIRMED  
  scenario -> An authenticated customer has missing/invalid `app_metadata.user_kind` -> middleware emits `"staff"`, and every product door opens without an entitlement row.  
  why missed -> The gate assumes every non-`client` identity is trusted staff instead of failing closed.

FINDING 2: The new service-role exception test does not verify organization scoping  
  `lib/portal/__tests__/registry-code.test.ts:298-306` -> `lib/entitlements/door-holds.ts:10-12`  
  confidence -> CONFIRMED  
  scenario -> A later edit removes `.eq("organization_id", organizationId)` while retaining the service-role import -> the registry test still passes although the entitlement query can read another organization’s data.  
  why missed -> The allowlist checks only the file/import, not the security-critical predicate.

TOTAL: 2 findings
