# codex-oracle review -- 2026-10-23 21:27:16 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0120_payment_events.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/expiry.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/packages/db/scripts/0120_payment_events-local-verify.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2, ADR 017 step 4a payments: fixes after round 1 (agency-os/reports/oracle/2026-10-23-partialreview-033cc224.md) and a db-expert review. Changed: credit-pack refund is first-in-first-out (unused = balance beyond later grants net of their refunds); same order on two accounts re-checked after insert; cancel keeps the contract active and endLapsedTrials (tables.ts) now ends trial/active/past_due contracts past their period whose grants are gone, re-checking current_period_end in the UPDATE; chargeback sets contracts past_due, cleared restores active; a feature another live contract grants is refused instead of ended; one-live-grant check only after subscription_paid/chargeback_cleared on touched features; no delete/truncate for service_role; period_end needs an offset; plan limits must be objects. Check these fixes for new holes, especially the sweep change against portal_complete_signup trials and the e2e suite. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 578304ms | answer: 11B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/expiry.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/packages/db/migrations/0120_payment_events.sql, lobster-factory/packages/db/scripts/0120_payment_events-local-verify.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
