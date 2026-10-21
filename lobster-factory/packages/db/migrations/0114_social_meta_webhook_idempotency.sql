-- 0114: persist Meta's provider post/media id and claim webhook events before replying.

begin;
set local lock_timeout = '5s';

alter table public.social_post_targets add column if not exists meta_post_id text
  check (meta_post_id is null or length(meta_post_id) between 1 and 200);
create index if not exists social_post_targets_meta_idx
  on public.social_post_targets (organization_id, meta_post_id) where meta_post_id is not null;

create table if not exists public.social_auto_rule_events (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 500),
  rule_id uuid,
  post_id uuid,
  status text not null default 'claimed' check (status in ('claimed', 'replied', 'failed')),
  error text check (length(error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, event_id)
);
create index if not exists social_auto_rule_events_status_idx
  on public.social_auto_rule_events (organization_id, status, updated_at);

alter table public.social_auto_rule_events enable row level security;
drop policy if exists "service_role only" on public.social_auto_rule_events;
create policy "service_role only" on public.social_auto_rule_events to service_role using (true) with check (true);
revoke all on public.social_auto_rule_events from public, anon, authenticated;
grant all on public.social_auto_rule_events to service_role;

commit;
