# codex-oracle review -- 2026-10-21 10:21:10 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/entitlements/expire/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/expiry.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/entitlements.e2e.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Trial subscriptions (0110 portal_complete_signup: status trial, contract grants source_ref=subscription id, ends_at=period_end+7d) never left status trial; the daily expire sweep now also cancels trial rows whose period ended and whose own contract grants are all expired (0062 status set has no expired; canceled leaves live_uniq; 0110 trigger keeps trial_started_at so no re-trial). Launcher now treats trial as open.
- exit: 0 | elapsed: 196502ms | answer: 683B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/entitlements/expire/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/entitlements.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/expiry.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The grant lookup is truncated at PostgREST’s 1000-row cap, causing trials to be canceled during grace.

  file:line   -> `tables.ts:88-94` -> `lobster-factory/infra/supabase/docker-compose.yml:47`
  confidence  -> CONFIRMED
  scenario    -> 200 lapsed trials each have 6 still-live grace grants (1,200 rows). The `.in("source_ref", ids)` query returns only 1,000 rows, so omitted subscriptions appear to have no live grants and are marked `canceled` before their grace ends.
  why missed  -> Subscription IDs are paginated, but the matching entitlement rows are fetched in one unbounded query; the existing 1,000-row PostgREST cap is easy to overlook.

TOTAL: 1 findings
