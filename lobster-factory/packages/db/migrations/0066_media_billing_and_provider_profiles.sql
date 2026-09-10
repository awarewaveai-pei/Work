-- 0066: Media LEGO billing, credit ledger and provider profiles.
-- Additive, service-role writes only. API secrets remain in Supabase Vault.
begin;
set lock_timeout = '3s';

create table if not exists public.media_billing_accounts (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  plan text not null default 'free' check (plan in ('free','subscription','enterprise')),
  status text not null default 'active' check (status in ('active','past_due','canceled')),
  monthly_credit_limit integer not null default 0 check (monthly_credit_limit >= 0),
  hard_credit_limit integer not null default 0 check (hard_credit_limit >= 0),
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.media_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  units integer not null check (units <> 0),
  entry_type text not null check (entry_type in ('grant','debit','refund','adjustment')),
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 128),
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists media_credit_ledger_org_idx on public.media_credit_ledger(organization_id, created_at desc);

create table if not exists public.media_provider_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null check (provider in ('anthropic','openai','replicate','pexels','elevenlabs')),
  mode text not null check (mode in ('agency','byo')),
  secret_ref text,
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);
create index if not exists media_provider_profiles_org_idx on public.media_provider_profiles(organization_id);

create or replace function public.media_credit_reserve(
  p_organization_id uuid, p_units integer, p_idempotency_key text,
  p_reference_type text default null, p_reference_id text default null
) returns table(allowed boolean, balance integer, ledger_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_balance integer; inserted_id uuid; hard_limit integer; account_status text;
begin
  if p_units <= 0 then raise exception 'p_units must be positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  if exists (select 1 from public.media_credit_ledger where idempotency_key = p_idempotency_key and organization_id <> p_organization_id) then raise exception 'idempotency key belongs to another organization'; end if;
  select id into inserted_id from public.media_credit_ledger where idempotency_key = p_idempotency_key and organization_id = p_organization_id;
  if inserted_id is not null then
    select coalesce(sum(units), 0)::integer into current_balance from public.media_credit_ledger where organization_id = p_organization_id;
    return query select true, current_balance, inserted_id; return;
  end if;
  select coalesce(sum(units), 0)::integer into current_balance from public.media_credit_ledger where organization_id = p_organization_id;
  select status, hard_credit_limit into account_status, hard_limit from public.media_billing_accounts where organization_id = p_organization_id;
  if account_status is not null and account_status <> 'active' then return query select false, current_balance, null::uuid; return; end if;
  if hard_limit is not null and hard_limit > 0 and current_balance - p_units < -hard_limit then return query select false, current_balance, null::uuid; return; end if;
  if current_balance < p_units then return query select false, current_balance, null::uuid; return; end if;
  insert into public.media_credit_ledger(organization_id, units, entry_type, idempotency_key, reference_type, reference_id)
    values (p_organization_id, -p_units, 'debit', p_idempotency_key, p_reference_type, p_reference_id)
    on conflict (idempotency_key) do nothing returning id into inserted_id;
  if inserted_id is null then select id into inserted_id from public.media_credit_ledger where idempotency_key = p_idempotency_key and organization_id = p_organization_id; end if;
  return query select true, (current_balance - p_units), inserted_id;
end $$;
revoke all on function public.media_credit_reserve(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.media_credit_reserve(uuid, integer, text, text, text) to service_role;

do $$ declare t text; begin foreach t in array array['media_billing_accounts','media_credit_ledger','media_provider_profiles'] loop execute format('alter table public.%I enable row level security', t); execute format('revoke all on table public.%I from anon, authenticated', t); execute format('grant all on table public.%I to service_role', t); end loop; end $$;
reset lock_timeout;
notify pgrst, 'reload schema';
commit;
