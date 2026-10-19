# codex-oracle review -- 2026-10-15 14:54:17 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/authz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/authz.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/accounts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/log/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-portal-guards.test.ts, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 of ADR 018 product doors (round 1 artifact 2026-10-15-partialreview-199d9a92.md reviewed the whole change). This round reviews the fixes only: (1) a customer (client identity, now able to reach /api/social on social.aware-wave.com) may not open a new-channel connect attempt, because store.ts matches a new Postiz channel to a brand by timing only (requireStaffForNewChannel in authz.ts, wired in accounts/route.ts POST when accountId is absent); (2) the audit log hides staff role and auth user ids from clients (actorForViewer, log/route.ts); (3) created_by removed from POST_COLUMNS so post responses carry no actor id; (4) the social nginx vhost returns 400 on encoded dot/slash or dot segments and 404 on every path the middleware matcher skips, and a test compares middleware config.matcher against that nginx block.
- exit: 0 | elapsed: 472788ms | answer: 1202B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/accounts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/log/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-portal-guards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/authz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/authz.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Buyout product-host overrides do not reach the deployed app or nginx.

  file:line   -> `doors.ts:24` -> `docker-compose.yml:255-264`; `nginx/default.conf:462-464`
  confidence  -> CONFIRMED
  scenario    -> Set `PRODUCT_HOST_SOCIAL=posts.customer.com` for a buyout; middleware configuration supports it, but the container and both nginx layers only recognize `social.aware-wave.com`, so the request never reaches the product door.
  why missed  -> The regression test hardcodes defaults via `productHost(p, {})` at `middleware-portal-guards.test.ts:159-163`.

FINDING 2: The nginx regression test passes even when skipped descendants are no longer blocked.

  file:line   -> `middleware-portal-guards.test.ts:163-167` -> `middleware.ts:398`; `app/api/internal/social/dispatch/route.ts:27-35`
  confidence  -> CONFIRMED
  scenario    -> Add `$` to the nginx deny regex. The test still passes because it only checks captured token names, but `POST /api/internal/social/dispatch` is no longer denied; middleware skips it and the dispatch route executes with its bearer token.
  why missed  -> The test never evaluates representative descendant paths against the nginx regex.

TOTAL: 2 findings
