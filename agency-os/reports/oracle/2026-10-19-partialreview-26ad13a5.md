# codex-oracle review -- 2026-10-19 15:08:27 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/smartlink.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/smartlink-rules.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/smartlink, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(public)/smartlink, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/smartlinks, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/smartlink.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/smartlink-real-db.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `ee3e7bde5^!`
- context: C26 smart link page (SOCIAL_MANAGER_PLAN.md C26): editor + public /smartlink/<slug> page + /go/<item> click route counting via social_smart_link_click (0105). Adversarial focus: slug/url validation holes, click-count bypass (robots, repeats, HEAD), open redirect via item id, anonymous access to unpublished page info leak, brand isolation in save (other brand item ids), service_role exposure, the 409 path.
- exit: 0 | elapsed: 181459ms | answer: 2585B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(public)/smartlink/[slug]/go/[item]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(public)/smartlink/[slug]/not-found.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(public)/smartlink/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/smartlinks/LinkPage.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/smartlinks/SmartLinks.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/smartlinks/link-page.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/smartlinks/smartlinks.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/smartlink/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/smartlink.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/smartlink-rules.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/smartlink.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/smartlink-real-db.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Clicks can be counted twice within one brand-local day around UTC midnight  
  file:line   -> `app/(public)/smartlink/[slug]/go/[item]/route.ts:21` -> `lib/social/smartlink.ts:24-26`  
  confidence  -> CONFIRMED  
  scenario    -> A Taipei visitor clicks at 07:59 local and again at 08:01; the gate sees two UTC dates while the database uses the same brand date, so both clicks increment the count.  
  why missed  -> The code acknowledges the UTC/brand-day mismatch but treats the duplicate as acceptable.

FINDING 2: A failed or invalid click permanently consumes the visitor’s daily gate  
  file:line   -> `app/(public)/smartlink/[slug]/go/[item]/route.ts:21-22` -> `lib/social/smartlink.ts:112-118`  
  confidence  -> CONFIRMED  
  scenario    -> The gate records a visitor, `countClick` fails and returns 503, then the visitor retries; the retry bypasses counting and only redirects, leaving the click uncounted.  
  why missed  -> Gate mutation is embedded in a boolean expression before the awaited database operation.

FINDING 3: Process restarts or multiple workers bypass once-per-day deduplication  
  file:line   -> `app/(public)/smartlink/[slug]/go/[item]/route.ts:10` -> `lib/social/smartlink.ts:107-109`  
  confidence  -> CONFIRMED  
  scenario    -> A visitor clicks once, the Next.js worker restarts, and the same visitor clicks again that day; the new in-memory map is empty and the database count increments twice.  
  why missed  -> The end-to-end test exercises one process and does not cover worker restart or replica routing.

FINDING 4: Filling the gate capacity erases all deduplication state  
  file:line   -> `lib/social/smartlink.ts:116-118`  
  confidence  -> CONFIRMED  
  scenario    -> 50,000 distinct visitors fill the map; the next distinct visitor clears it, then the first visitor clicks again and is counted a second time that day.  
  why missed  -> The cap protects memory by clearing globally, but silently removes the security invariant for every existing visitor.

FINDING 5: Brand-day counting is wrong across daylight-saving transitions  
  file:line   -> `lib/social/smartlink.ts:24-26` -> `lib/social/smartlink.ts:43`  
  confidence  -> CONFIRMED  
  scenario    -> For `America/New_York`, `brandDay("America/New_York", 1, new Date("2024-03-11T04:30:00Z"))` returns March 9 instead of the previous calendar day March 10, shifting the 28-day click window around the spring transition.  
  why missed  -> The implementation subtracts fixed 24-hour durations instead of calendar days in the target timezone.

TOTAL: 5 findings
