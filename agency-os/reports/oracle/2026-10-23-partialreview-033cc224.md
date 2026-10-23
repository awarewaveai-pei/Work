# codex-oracle review -- 2026-10-23 21:12:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0120_payment_events.sql, lobster-factory/packages/db/migrations/0120_payment_events.down.sql, lobster-factory/packages/db/scripts/0120_payment_events-local-verify.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/contracts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/record-payment.mjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/contracts.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 step 4a: local payment connector, payment_events inbox + one-transaction contract/grant/ledger state machine (0120 billing_apply_payment_event), /ops/billing read-only. Money path: check replay, refund-only-unused, chargeback freeze, forged-request refusal, one-live-grant invariant, down-migration safety, and anything this depends on outside the diff (0062/0066/0110/0118 schema, daily sweep, can()). If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 482509ms | answer: 1834B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments/[provider]/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments/[provider]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/contracts.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/contracts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/__tests__/local.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/index.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/local.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/provider.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/record-payment.mjs, lobster-factory/packages/db/migrations/0120_payment_events.down.sql, lobster-factory/packages/db/migrations/0120_payment_events.sql, lobster-factory/packages/db/scripts/0120_payment_events-local-verify.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The webhook route fails TypeScript compilation because a dynamic route string is passed to a union-typed provider factory.  
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments/[provider]/route.ts:16 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/index.ts:15  
  confidence  -> CONFIRMED  
  scenario    -> `next build` type-checks `params.provider` as `string` against `PaymentProviderName`, causing a type error and preventing deployment.  
  why missed  -> Runtime tests transpile the route without enforcing the production type-check.

FINDING 2: Concurrent credit-pack events can bypass the cross-account order-ownership check.  
  lobster-factory/packages/db/migrations/0120_payment_events.sql:260 -> lobster-factory/packages/db/migrations/0120_payment_events.sql:264  
  confidence  -> CONFIRMED  
  scenario    -> Two accounts submit different events with the same provider and `order_ref`; both ownership checks see no committed row, one inserts the grant, and the other’s `ON CONFLICT DO NOTHING` returns `{ok:true, units:0, already_granted:true}` instead of `order_belongs_to_another_account`.  
  why missed  -> Tests exercise ownership sequentially, not the cross-account race.

FINDING 3: Credit-pack refunds can refund another pack’s credits.  
  lobster-factory/packages/db/migrations/0120_payment_events.sql:296 -> lobster-factory/packages/db/migrations/0120_payment_events.sql:300  
  confidence  -> CONFIRMED  
  scenario    -> Pack A grants 100, pack B grants 100, then A’s 100 are spent; refunding A sees the shared balance of 100 and deducts 100 from B’s remaining credits.  
  why missed  -> The test uses only one pack, while the implementation calculates “unused” from the account-wide balance.

Final line: TOTAL: 3 findings
