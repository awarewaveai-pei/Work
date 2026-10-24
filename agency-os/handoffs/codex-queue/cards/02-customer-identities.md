# Card 02 — customer_identities: a WordPress member maps to one billing account

## Decision

ADR 017 step 4b (card `agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-4.md` §「4b 設計更新」, item 4b-1). A payment event or a login handoff from aware-wave.com names a WordPress user id; the control plane must turn it into exactly one billing account (`organizations` root row, `kind='customer'`) and one auth user. One table holds that mapping; nothing else does.

- Migration `lobster-factory/packages/db/migrations/0124_customer_identities.sql` (+ `.down.sql`):
  - `create table public.customer_identities (id uuid primary key default gen_random_uuid(), provider text not null check (provider in ('awarewave-wp')), external_id text not null check (length(external_id) between 1 and 100), user_id uuid not null references public.profiles(id) on delete restrict, organization_id uuid not null references public.organizations(id) on delete restrict, created_at timestamptz not null default now(), unique (provider, external_id), unique (provider, user_id))`.
  - RLS + grants exactly like `0120_payment_events.sql` (the `do $$ … foreach t in array array[…]` block: enable RLS, revoke from public/anon/authenticated, service_role gets select/insert only — no update, no delete; policy for service_role). Rows are never updated or deleted (an identity is a fact; re-linking is a new product decision, not a row edit).
  - `alter table public.plans drop column woo_product_ids;` — the Woo product → plan mapping lives in the WordPress product meta `_awarewave_plan_key` (card step-4 §商品→方案), so this column has no owner. `plans` has 0 rows in prod (TASKS.md 「第一個方案列（plans 0 筆）」).
  - `.down.sql`: refuse (raise) when `customer_identities` has rows; otherwise drop the table and add `woo_product_ids integer[] not null default '{}'` back. Mirror the style of `0120_payment_events.down.sql`.
  - Both files: `begin; set local lock_timeout = '5s'; … notify pgrst, 'reload schema'; commit;` like 0120.
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/identities.ts`:
  - `export interface Identity { provider: "awarewave-wp"; externalId: string }`
  - `export async function findBillingAccount(db: SupabaseClient, id: Identity): Promise<{ organizationId: string; userId: string } | null>` — one select on `customer_identities`; a Supabase error throws (never returns null on error: null means "no such member", an error means "cannot tell").
  - `export async function linkIdentity(db: SupabaseClient, input: Identity & { userId: string; organizationId: string }): Promise<{ organizationId: string; userId: string; created: boolean }>` — insert; on unique violation (Postgres code `23505`) re-read the existing row: when it names the same user and organization return it with `created:false`; when it names a different account throw `new Error("identity_conflict")`. Never update.
  - Store access through the same client pattern as `lib/entitlements/tables.ts` (service role; read that file first and follow its import of the Supabase client).
- Tests `lib/entitlements/__tests__/identities.test.ts` with a fake Supabase client (follow the fake-client style already used in `lib/payments/__tests__/local.test.ts` or `lib/entitlements/__tests__/can.test.ts` — read one before writing).

## Constraints

- Do not touch `can.ts`, `contracts.ts`, `0120_*`, `lib/payments/**`, or any route. 4b-3 (card 03) consumes this module.
- The three entitlement tables and this one are read only from `lib/entitlements/**` and `app/portal/**` (`lib/entitlements/__tests__/import-boundary.test.ts:11` `tableAllowed`). Add `"customer_identities"` to that test's `TABLES` set so a future import elsewhere fails the build.
- `external_id` is the WordPress user id as a string, never an email (ADR 015 §2: email changes).
- No prices, no plan seeds, no data migration.
- Commit message in the repo's house style (see `git log -5 --format=%s`).

## Files

- `lobster-factory/packages/db/migrations/0124_customer_identities.sql`
- `lobster-factory/packages/db/migrations/0124_customer_identities.down.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/identities.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/identities.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/import-boundary.test.ts` (TABLES set only)

## Acceptance

From `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`:

- `npx vitest run lib/entitlements/__tests__/identities.test.ts` green, test names include exactly: `an unknown identity resolves to null`, `a store error is thrown, not read as unknown`, `linking the same identity twice is a no-op`, `one wp user cannot link to two accounts`.
- `npx vitest run lib/entitlements/__tests__/import-boundary.test.ts` green (and its new expectation: `from("customer_identities")` in `lib/social/store.ts` is a violation).
- `npx tsc --noEmit` exit 0.
- Mutation (run once, then restore): remove the `23505` re-read in `linkIdentity` → `linking the same identity twice is a no-op` fails.

Applying 0124 to prod is the operator's step (High), not this card's.

## Decision made

Yes: `0124_customer_identities.sql` drops `plans.woo_product_ids` (and the down file adds it back). Approved by the card author 2026-10-24; `plans` has 0 rows; applying to production is the operator's separate step, not this card's. No further confirmation needed.
