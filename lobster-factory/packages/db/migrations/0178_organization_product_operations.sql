-- 0178: who operates a product for an account (ADR 017 §0 operation axis; ADR 021 §2 代操, G3; DISPATCH M2). Not on
-- organization_product_subscriptions: that is the commercial axis, and an account served under an all-features row
-- (Soulful: contract, edd-research: comp) has no subscription row to carry it.
-- Invariant: no row = 'customer' (the customer operates it themself); a row exists only after staff switched the
-- product on the client hub (帳務). One row per (root account, product); a brand (child organization) or an internal
-- account is refused here -- the app writes on the brand's root, the account can() reads. Reselling is not stored
-- (a live <product>.resell row says it); buyout is not in this table.
-- product_key has no list here on purpose: products keep being added, and a second hard-coded copy of 0110's list
-- would have to be widened with every one. The writer checks it against next-admin lib/portal/products.ts; a reader
-- skips a key the registry no longer has.
-- No data is written: who operates what is set by staff on the page, never guessed here.
-- APPLY:  node scripts/apply-db-migration.mjs 0178   (revert = 0178_organization_product_operations.down.sql; revert the app first)
begin;
set local lock_timeout = '5s';

create table public.organization_product_operations (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_key text not null check (length(btrim(product_key)) > 0),
  operated_by text not null check (operated_by in ('customer','awarewave')),
  updated_at timestamptz not null default now(),
  updated_by text not null check (length(btrim(updated_by)) > 0),
  primary key (organization_id, product_key)
);
alter table public.organization_product_operations enable row level security;
revoke all on table public.organization_product_operations from public, anon, authenticated;
grant all on table public.organization_product_operations to service_role;
create policy organization_product_operations_service_role on public.organization_product_operations
  for all to service_role using (true) with check (true);

-- A root customer or test account only (the same accounts 0175's entitlement_staff_account admits).
create function public.organization_product_operations_account_check() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.organizations where id = new.organization_id
                 and parent_organization_id is null and kind in ('customer','test')) then
    raise exception 'operation:not_a_customer_account';
  end if;
  return new;
end $$;
revoke all on function public.organization_product_operations_account_check() from public, anon, authenticated;
grant execute on function public.organization_product_operations_account_check() to service_role;
create trigger organization_product_operations_account_check before insert or update
  on public.organization_product_operations for each row execute function public.organization_product_operations_account_check();

notify pgrst, 'reload schema';
commit;
