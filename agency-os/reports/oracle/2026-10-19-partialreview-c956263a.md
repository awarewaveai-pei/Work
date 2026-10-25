# codex-oracle review -- 2026-10-19 19:59:31 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/smartlink.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(public)/smartlink/[slug]/go/[item]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/smartlink.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C26 smart link click gate re-review. ClickGate split into allows() (pure check) and mark() (called by route.ts only after countClick returned a url), replacing the earlier reserve-then-release. 25h hold per visitor+link (brand day is computed in DB by 0105 in brand tz; gate does not know tz). Cap evicts only the oldest entry. brandDay uses calendar-day subtraction. Known, accepted: in-memory gate forgets on restart/second worker (F3) and concurrent clicks racing the first count's round trip may each count; both documented. Look for remaining correctness bugs only.
- exit: 0 | elapsed: 501735ms | answer: 525B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(public)/smartlink/[slug]/go/[item]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/smartlink.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/smartlink.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A committed click can be counted again when the RPC response is lost.
  file:line   -> route.ts:24-27; smartlink.ts:91; packages/db/migrations/0105_social_v16.sql:898-899
  confidence  -> CONFIRMED
  scenario    -> `allows()` passes, the database increment commits, but the RPC response fails; the route returns 503 without `mark()`, so the visitor retries and the database increments again.
  why missed  -> The test models an RPC failure before commit, not a commit-then-response-loss failure.

TOTAL: 1 findings
