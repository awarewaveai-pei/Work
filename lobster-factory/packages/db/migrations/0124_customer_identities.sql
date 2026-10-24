-- 0124: ADR 017 step 4b. A WordPress member maps to one customer billing account and auth user.
-- The identity is immutable: re-linking is a new product decision, never an update to this row.
begin;
set local lock_timeout = '5s';

create table public.customer_identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('awarewave-wp')),
  external_id text not null check (length(external_id) between 1 and 100),
  user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (provider, external_id),
  unique (provider, user_id)
);

create index customer_identities_user_id_idx on public.customer_identities(user_id);
create index customer_identities_organization_id_idx on public.customer_identities(organization_id);

lock table public.plans in access exclusive mode;
do $$ begin
  if exists (select 1 from public.plans) then
    raise exception 'plans has rows: 0124 requires an explicit data migration';
  end if;
end $$;
alter table public.plans drop column woo_product_ids;

do $$ declare t text; begin
  foreach t in array array['customer_identities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('revoke all on table public.%I from service_role', t);
    execute format('grant select, insert on table public.%I to service_role', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
