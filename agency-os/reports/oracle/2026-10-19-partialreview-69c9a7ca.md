# codex-oracle review -- 2026-10-19 15:12:05 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/metrics/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/metrics/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/analytics/Analytics.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/analytics/analytics.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/packages/workflows/src/trigger/social-metrics.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `ee3e7bde5`
- context: C24 ?豢??? (social metrics snapshot, Postiz analytics, Bluesky public feed, Analytics page). Committed in ee3e7bde5 by a consolidation commit; review the C24 hunks only. Focus: snapshot merge correctness, Facebook day mapping (end_time offset), Bluesky engagement/posts per day, isolation of account ids, cascade on channel removal, missing values never 0.
- exit: 0 | elapsed: 444021ms | answer: 2981B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/analytics/Analytics.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/analytics/analytics.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/metrics/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/metrics/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs, lobster-factory/packages/workflows/src/trigger/social-metrics.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Missing provider counters are converted into valid-looking zeroes.
  file:line -> `lib/social/metrics.ts:45` -> `lib/social/metrics.ts:62-65,87`
  confidence -> CONFIRMED
  scenario -> Postiz returns `total: ""`, or Bluesky omits an optional engagement counter -> snapshot stores/displays `0` instead of missing data.
  why missed -> Tests cover numeric zeroes, not absent or empty counters.

FINDING 2: The collector is disabled by the publishing switch.
  file:line -> `app/api/internal/social/metrics/route.ts:26` -> `infra/hetzner-phase1-core/docker-compose.yml:389-393`
  confidence -> CONFIRMED
  scenario -> `SOCIAL_DISPATCH_ENABLED` is blank while publishing is intentionally disabled -> the daily POST returns success with `enabled:false` and writes no snapshots.
  why missed -> The route treats the disabled response as successful, so scheduling and health checks stay green.

FINDING 3: A partial first snapshot permanently prevents 90-day backfill.
  file:line -> `lib/social/metrics.ts:184-187` -> `lib/social/metrics.ts:121-124`
  confidence -> CONFIRMED
  scenario -> Bluesky feed pagination is incomplete and writes only recent days -> any existing row makes every later run use `REFETCH_DAYS=28`, leaving older missing days absent from the 90-day chart forever.
  why missed -> The test distinguishes only zero rows from nonzero rows; it does not test partial coverage.

FINDING 4: Account-specific post results can be removed by the brand-wide 200-row limit.
  file:line -> `lib/social/metrics.ts:318-325`
  confidence -> CONFIRMED
  scenario -> The brand has 200 newer posts on Facebook and an older Bluesky post; selecting Bluesky -> SQL returns only the first 200 brand posts, then JavaScript filters away all returned targets, so the Bluesky post is missing.
  why missed -> Account filtering happens after `limit(POSTS_CAP)` rather than in the database query.

FINDING 5: Snapshot post metrics are silently omitted for displayed posts beyond the arbitrary 200-target cap.
  file:line -> `lib/social/metrics.ts:211-218` -> `lib/social/metrics.ts:321-322`
  confidence -> CONFIRMED
  scenario -> More than 200 posts fall in the window and the database returns an arbitrary 200 targets -> the UI displays a post with no `social_post_metrics` row as `—`, even though it is within the page’s latest-200 result set.
  why missed -> The snapshot query has no ordering, while the read query orders by publication time.

FINDING 6: Serial per-post analytics calls can exceed the 300-second execution budget.
  file:line -> `lib/social/metrics.ts:216-218` -> `app/api/internal/social/metrics/route.ts:15`
  confidence -> CONFIRMED
  scenario -> 200 targets take 2 seconds each from Postiz -> the route exceeds its 300-second limit, leaving later post metrics/accounts uncollected and causing the Trigger retry to repeat the whole run.
  why missed -> Unit tests exercise merge and summary logic, not the real sequential API workload.

TOTAL: 6 findings
