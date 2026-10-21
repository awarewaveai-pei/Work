-- 0116 — map Meta provider assets to brands. Tokens remain deployment secrets.
begin;
set local lock_timeout = '5s';

create table if not exists public.social_meta_assets (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  kind              text not null check (kind in ('facebook_page', 'instagram_account', 'ad_account')),
  external_id       text not null check (length(btrim(external_id)) between 1 and 200),
  page_external_id  text check (page_external_id is null or length(btrim(page_external_id)) between 1 and 200),
  label             text check (label is null or length(btrim(label)) between 1 and 200),
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (kind, external_id),
  check (kind <> 'instagram_account' or page_external_id is not null)
);

create index if not exists social_meta_assets_org_idx
  on public.social_meta_assets (organization_id, kind, enabled);

alter table public.social_meta_assets enable row level security;
drop policy if exists "service_role only" on public.social_meta_assets;
create policy "service_role only" on public.social_meta_assets
  to service_role using (true) with check (true);
revoke all on public.social_meta_assets from public, anon, authenticated;
grant all on public.social_meta_assets to service_role;

commit;
