# codex-oracle review -- 2026-10-25 20:15:35 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0133_seller_sites.sql, lobster-factory/packages/db/migrations/0133_seller_sites.down.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/can.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py, lobster-factory/packages/db/scripts/0133_seller_sites_down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 decision #12 (seller axis), cards 4c-4 and 4c-1. 4c-4: seller licence keys <product>.resell live in can.ts SELLER_LICENCES (NOT in products.ts features, because the door menu app/ProductDoorShell.tsx lists every feature and the 0118 all-features sweep lib/entitlements/tables.ts registeredFeatures grants every feature, which would make the managed client Soulful a reseller); decide() answers them: internal sells everything, a customer needs a live comp/contract row. 4c-1: migration 0133 adds seller_sites (one row per cash-register site, ed25519 public key or hmac-env for the legacy aware-wave.com row), customer_identities keyed per site, organizations.sold_by_organization_id, plans.owner_organization_id, payment_events.site_id, and billing_apply_payment_event gains p_site_id with refusals site_disabled / buyer_belongs_to_another_seller / plan_not_sellable_here / local_has_no_site; the function body is 0128's text plus four marked additions. Day one must change nothing for aware-wave.com. Not yet applied to prod; 4c-2 (route side) is not in this change. Round 3: partialreview-05afd543 findings fixed: customer_identities.site_id defaults to the aware-wave.com row until 4c-2; the plan-owner check runs only for events from a site (local = operator may cancel/refund); seller_sites.key_id and seller_organization_id are fixed by trigger. Earlier: findings 1-2 of partialreview-20ba3e0c (event ids and order numbers are per site) were fixed by an inbox key (provider, site_id, event_id) with old woo rows backfilled to aware-wave.com, and ledger/contract keys namespaced woo@<key_id> (aware-wave.com unchanged). Look hardest at: money paths that could now refuse a legitimate aware-wave.com payment, replay handling, the down migration's safety, and any way a buyer or event can choose its seller.
- exit: 0 | elapsed: 303545ms | answer: 1754B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/can.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py, lobster-factory/packages/db/migrations/0133_seller_sites.down.sql, lobster-factory/packages/db/migrations/0133_seller_sites.sql, lobster-factory/packages/db/scripts/0133_seller_sites_down.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `can()` grants an unlicensed customer permission to sell in shadow mode
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts:240
  confidence  -> CONFIRMED
  scenario    -> `ENTITLEMENT_MODE` is unset, a webhook actor checks `social.resell`, and the customer has no licence row. `decide()` denies it, but `can()` returns `allowed: true` with `shadow: true`. The new tests call `verdictOf()`, so they do not catch this result.
  why missed  -> The licence tests bypass `can()`’s shadow-mode branch.

FINDING 2: A live seller licence depends on an unrelated permit signing key
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts:182
  confidence  -> CONFIRMED
  scenario    -> A customer has a live `social.resell` row, but `ENTITLEMENT_SIGNING_KEY` is empty, as the compose default permits. `d.permit()` calls `signingKey()` (`runtime.ts:37`), which throws (`runtime.ts:26–27`); `verdictOf()` returns `infrastructure_error` instead of recognizing the licence.
  why missed  -> The tests supply a mocked permit dependency with a key.

FINDING 3: The down migration can reactivate a disabled cash register
  file:line   -> lobster-factory/packages/db/migrations/0133_seller_sites.down.sql:9
  confidence  -> CONFIRMED
  scenario    -> The aware-wave.com site is disabled after its HMAC secret is compromised. The down guard still passes, drops `seller_sites` (`:341`), and restores the old payment function without a site-status check. A correctly signed event using that compromised secret is accepted again.
  why missed  -> The rollback guard checks for additional sellers and sites, but not the legacy site’s security state.

TOTAL: 3 findings
