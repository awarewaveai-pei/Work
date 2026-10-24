# Card 03 — `woo` payment provider: a signed event from aware-wave.com names a WordPress member, the control plane finds or creates its billing account

## Decision

ADR 017 step 4b item 4b-3 (`agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-4.md` §「4b 設計更新」). Depends on card 02 (`lib/entitlements/identities.ts`).

The wp-bridge plugin (a later card, 4b-2) POSTs to the existing route `app/api/webhooks/payments/[provider]/route.ts` with `<provider> = woo`. Body:

```json
{ "event_id": "wc:woocommerce_payment_complete:1234", "wp_user_id": 57, "email": "a@b.tw", "display_name": "A B",
  "kind": "credit_pack", "units": 500, "order_ref": "1234" }
```

i.e. `event_id` + `wp_user_id` + `email` + `display_name` + every `PaymentEvent` field except `organization_id` (`lib/payments/provider.ts:9-16`). Header `X-AwareWave-Payment-Signature = base64(HMAC-SHA256(raw body, PAYMENTS_WOO_SECRET))` — the same construction as `local` (`lib/payments/local.ts:14` `signLocalPayment`).

Build:

- `lib/payments/woo-billing.ts` exporting `wooBillingProvider(env, deps?)`:
  - `name: "woo"`; `verify` = HMAC over the raw body with `env.PAYMENTS_WOO_SECRET` (reuse `signLocalPayment`'s construction — move it to a shared helper `lib/payments/hmac.ts` used by both `local.ts` and this file; under 32 characters nothing verifies, as in local).
  - `parse(rawBody)`: JSON → validate `event_id` (same regex as local), `wp_user_id` (positive safe integer; `0`/missing → `PaymentParseError("guest_checkout")`), `email` (`normalizeEmail` from `lib/accounts/client-invite.ts:37`; invalid → `PaymentParseError("invalid_email")`), `display_name` (string ≤ 200, optional). Then resolve the billing account:
    1. `findBillingAccount(db, { provider: "awarewave-wp", externalId: String(wp_user_id) })` → found → `organization_id`.
    2. Not found → `createCustomerFromWp({ wpUserId, email, displayName })`: (a) insert `organizations` root row `{ name: display_name || email, slug: <email local part, lowercased, [^a-z0-9]+ → '-', max 40 chars> + '-' + 4 random base36 chars, kind: 'customer', parent_organization_id: null }` — read how `app/api/ops/clients/**` creates an organization today and reuse that helper if one exists; (b) `inviteClientAccount(...)` from `lib/accounts/client-invite.ts:200` for that organization and email (read its signature and the route that calls it before using it; the invite mail goes to the product door the event's plan belongs to when the event has a `plan_key`, else the first `nextAdminProducts()` door); (c) `linkIdentity(...)` from card 02. Any step may be retried by the same event later: before (a) re-check `findBillingAccount`; before (b) `findAuthUserByEmail` (`client-invite.ts:58`) so a half-made account is finished, not duplicated; (c) is idempotent by its unique key. A `identity_conflict` from (c) throws `PaymentParseError("identity_conflict")`.
    3. Return `{ eventId, event: toPaymentEvent({ ...rest, organization_id }) }`.
  - Because resolution needs the database, change `PaymentProvider.parse` to return `Promise<ReceivedPayment>` (`lib/payments/provider.ts:28`); `local.ts` returns a resolved promise; the route awaits it (`route.ts:22`). Keep every existing local test green.
- `lib/payments/index.ts` `PROVIDERS` gains `woo: wooBillingProvider` (the comment on line 7 names `woo.ts`; correct it to `woo-billing.ts` — `lib/payments/woo.ts` is the wp-bridge *write* client and is not touched).
- `lib/entitlements/__tests__/import-boundary.test.ts:14` `PROVIDER_ADAPTERS`: add `"lib/payments/woo-billing.ts"`.
- Tests `lib/payments/__tests__/woo-billing.test.ts` with fakes for the identity store, the organization insert and the invite (inject through `deps`, default to the real ones).

## Constraints

- The control plane (`lib/entitlements/contracts.ts`, `billing_apply_payment_event`) is untouched: it still receives one `PaymentEvent` with `organization_id`.
- No Woo/WordPress field name leaves `lib/payments/woo-billing.ts` (import-boundary rule; `lib/payments/index.ts` only registers the factory).
- `chargeback_cleared` from `woo` is already refused by 0120 (`manual_review_only`); do not special-case it.
- No new env var is read anywhere but `woo-billing.ts` (`PAYMENTS_WOO_SECRET`). Do not edit compose, `.env.example` or docs — the operator sets prod env through `safe-infra-patch.sh` (card step-4 4b-3).
- Never log the email or the body; log `event_id` and `wp_user_id` only.

## Files

- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/woo-billing.ts` (new)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/hmac.ts` (new, shared signer/verifier)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/local.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/provider.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/index.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments/[provider]/route.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/__tests__/woo-billing.test.ts` (new)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/import-boundary.test.ts` (PROVIDER_ADAPTERS only)

## Acceptance

From `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`:

- `npx vitest run lib/payments` green; `lib/payments/__tests__/woo-billing.test.ts` has exactly these test names: `a known wp member resolves to its billing account`, `a first-time payer gets an organization, an invite and an identity in that order`, `a retry after a half-made account does not create a second organization`, `a guest checkout is refused with guest_checkout`, `an invalid signature does not verify`, `an invalid email is refused`.
- `npx vitest run "app/api/webhooks/payments/[provider]/route.test.ts"` green (existing local tests + one new: `woo answers 404 until PAYMENTS_PROVIDERS names it`).
- `npx vitest run lib/entitlements/__tests__/import-boundary.test.ts` green.
- `npx tsc --noEmit` exit 0.
- Mutation (run once, then restore): skip the `findBillingAccount` re-check before the organization insert → `a retry after a half-made account does not create a second organization` fails.
