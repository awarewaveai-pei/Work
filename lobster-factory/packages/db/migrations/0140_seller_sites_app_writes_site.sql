-- 0140: ADR 017 #12, 4c-2 (cards/step-4-seller.md). The app now names the site on every identity it writes
-- (lib/entitlements/identities.ts linkIdentity, site from the request's signing key: lib/payments/sites.ts), so 0133's
-- stop-gap default (customer_identities.site_id = aware-wave.com, Codex 2026-10-25 partialreview-05afd543 finding 1)
-- goes: an identity without a site is now a bug, and must fail rather than fall into aware-wave.com.
-- Also: an aware-wave.com account made after 0133's backfill but before 4c-2 (the app did not yet write
-- sold_by_organization_id) gets its seller, AwareWave, the same fact 0133 backfilled.
begin;
set local lock_timeout = '5s';

alter table public.customer_identities alter column site_id drop default;

update public.organizations
   set sold_by_organization_id = (select id from public.organizations where kind = 'internal' and parent_organization_id is null)
 where metadata->>'source' = 'awarewave-wp' and parent_organization_id is null and kind = 'customer'
   and sold_by_organization_id is null;

notify pgrst, 'reload schema';
commit;
