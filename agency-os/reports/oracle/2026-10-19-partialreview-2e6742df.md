# codex-oracle review -- 2026-10-19 15:22:32 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C24 metrics re-review after fixing six findings (count empty string, 90-day backfill always, publishedTargets helper shared by snapshot and read with brand/account/period filter, newest-200 ordering, concurrency pool 5 and 240s deadline). Check the fixes and any new defect.
- exit: 0 | elapsed: 251932ms | answer: 2121B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/metrics.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Per-post analytics failures are silently reported as a successful snapshot.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts:254 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/metrics/route.ts:30
  confidence  -> CONFIRMED
  scenario    -> Postiz returns errors for every post before the deadline -> all fetches become null, `posts` is 0, `errors` stays empty, and the route returns HTTP 200 with `ok: true`.
  why missed  -> Deadline skips are counted, but failed started requests remain swallowed by the existing catch.

FINDING 2: The 240-second deadline does not bound account-level API work, so the 300-second route can still time out.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts:203,209-218 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/metrics/route.ts:15
  confidence  -> CONFIRMED
  scenario    -> Two Bluesky accounts each require the profile request plus ten feed-page requests at their 20-second timeout -> account processing exceeds 300 seconds before the post pool can check the deadline, so Next/Trigger aborts the run without a response.
  why missed  -> The deadline is applied only inside `pool`; account enumeration, daily-source fetches, and database work remain sequential and unbounded.

FINDING 3: The newest-200 cap is applied only after reading and sorting every matching target.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts:173-186,251,355 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/supabase-paging.ts:13-19
  confidence  -> CONFIRMED
  scenario    -> A brand has 100,000 published targets in the 90-day window and each 1,000-row page takes three seconds -> `selectAll` scans all pages, retains and sorts all rows, and the 300-second route times out even though only 200 posts are displayed or collected.
  why missed  -> Moving filtering into SQL avoided the old post-cap bug, but the shared helper has no SQL limit and materializes the complete result set.

TOTAL: 3 findings
