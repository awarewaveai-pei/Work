# codex-oracle review -- 2026-10-21 10:24:16 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/entitlements/expire/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/expiry.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/entitlements.e2e.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Trial subscriptions (0110 portal_complete_signup: status trial, contract grants source_ref=subscription id, ends_at=period_end+7d) never left status trial; the daily expire sweep now also cancels trial rows whose period ended and whose own contract grants are all expired (0062 status set has no expired; canceled leaves live_uniq; 0110 trigger keeps trial_started_at so no re-trial). Launcher now treats trial as open. Round 2: grant lookup now keyset-paged (GRANT_PAGE 500) after round-1 finding about the 1000-row cap.
- exit: 0 | elapsed: 129507ms | answer: 714B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/entitlements/expire/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/entitlements.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/expiry.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Trial cancellation is race-prone and can cancel a trial after a live grant is added
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts:94 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts:108
  confidence  -> CONFIRMED
  scenario    -> The grant query sees no live grant, then a concurrent signup/renewal inserts one before the update; the stale `lapsed` list still updates the subscription to `canceled`, so the launcher no longer opens it.
  why missed  -> The pagination fix focuses on complete reads, but the read and status update are separate operations with no atomic grant-existence recheck.

Final line: TOTAL: 1 finding
