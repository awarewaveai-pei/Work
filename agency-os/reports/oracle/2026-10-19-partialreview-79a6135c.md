# codex-oracle review -- 2026-10-19 19:57:32 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/metrics-real-db.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C24 social metrics round 3. Invariant applied: everything the snapshot did not complete (channel not started after deadline, Bluesky feed cut short, post not reached, post fetch failed) lands in result.errors and no new work starts after the deadline; plus a real-DB e2e (throwaway Postgres+PostgREST, Bluesky public API). Known boundary not fixed: publishedTargets reads all targets before the 200 cap (needs 100k posts per brand in 90 days). Check the invariant holds and the e2e cannot touch production.
- exit: 0 | elapsed: 124198ms | answer: 1946B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/metrics-real-db.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Unreached posts are silently omitted from `result.errors`.

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts:234,240-242,260-261`
  confidence  -> CONFIRMED
  scenario    -> A published Facebook target has no `postiz_post_id`, or a Bluesky target’s `release_url` is absent from the fetched feed. `postNumbers` returns `null`; only rejected fetches increment `failed`, so the target is neither stored nor reported.
  why missed  -> The new failure accounting wraps promise rejections but does not distinguish a successful lookup returning “not reached”.

FINDING 2: Work can start after the run deadline.

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts:210,223-235`
  confidence  -> CONFIRMED
  scenario    -> An account begins before the deadline, but `checkProductionChangeAllowed` or a prior analytics call runs past it. The subsequent Facebook analytics call or `blueskyFeed` still starts, and later database writes can also begin after the deadline.
  why missed  -> The deadline is checked at account dispatch and inside the post-fetch pool, but not before the account’s source fetches or writes.

FINDING 3: The e2e test can be pointed at production and perform destructive writes.

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.e2e.test.ts:9,27-36`
  confidence  -> CONFIRMED
  scenario    -> An operator runs the test directly with `METRICS_REST=https://production.example` and `METRICS_JWT_SECRET` set to the production JWT secret. The proxy forwards Supabase requests to that host, while the test deletes and updates metrics/accounts through the service-role JWT.
  why missed  -> The shell wrapper supplies a localhost URL, but the test itself accepts and forwards any `METRICS_REST` value without enforcing localhost or a throwaway host.

TOTAL: 3 findings
