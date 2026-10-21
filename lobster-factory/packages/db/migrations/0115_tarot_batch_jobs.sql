-- 0115: tarot background batch progress as rows (replaces the in-memory Map in
-- apps/next-admin/lib/tarot/batch-store.ts; same move as 0047 video_jobs).
-- Invariant: one row per (job_id, card_index). A retried card callback claims or reads that row,
-- so it can neither count twice nor generate (and bill) twice. Job state is derived from the card
-- rows + deadline_at, so a run killed by Trigger cannot leave the job "running" forever.
-- Access: service_role only (next-admin getSupabaseWriteClient). Short-lived (7-day TTL in the store);
-- the images themselves live in R2 under tarot-batch/{job_id}/.

begin;
set local lock_timeout = '5s';

create table if not exists public.tarot_batch_jobs (
  id uuid primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid,
  run_id text check (run_id is null or length(run_id) between 1 and 200),
  model text not null check (length(model) between 1 and 200),
  aspect_ratio text not null check (length(aspect_ratio) between 1 and 20),
  total_cards integer not null check (total_cards between 1 and 78),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error', 'timed_out')),
  error text check (length(error) <= 2000),
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tarot_batch_jobs_org_idx on public.tarot_batch_jobs (organization_id, created_at desc);
create index if not exists tarot_batch_jobs_creator_idx on public.tarot_batch_jobs (created_by, created_at desc);
create index if not exists tarot_batch_jobs_created_at_idx on public.tarot_batch_jobs (created_at);

create table if not exists public.tarot_batch_cards (
  job_id uuid not null references public.tarot_batch_jobs(id) on delete cascade,
  card_index integer not null check (card_index between 0 and 77),
  card_name text not null check (length(card_name) between 1 and 200),
  status text not null check (status in ('generating', 'done', 'error')),
  url text check (length(url) <= 2000),
  error text check (length(error) <= 2000),
  attempts integer not null default 1,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (job_id, card_index),
  check (status <> 'done' or url is not null),
  check (status <> 'error' or error is not null)
);

alter table public.tarot_batch_jobs enable row level security;
drop policy if exists "service_role only" on public.tarot_batch_jobs;
create policy "service_role only" on public.tarot_batch_jobs to service_role using (true) with check (true);
revoke all on public.tarot_batch_jobs from public, anon, authenticated;
grant all on public.tarot_batch_jobs to service_role;

alter table public.tarot_batch_cards enable row level security;
drop policy if exists "service_role only" on public.tarot_batch_cards;
create policy "service_role only" on public.tarot_batch_cards to service_role using (true) with check (true);
revoke all on public.tarot_batch_cards from public, anon, authenticated;
grant all on public.tarot_batch_cards to service_role;

-- Claim a card before generating it. Outcomes: 'claimed' (caller generates), 'done' (return done_url,
-- do not generate), 'in_progress' (another attempt holds a fresh claim), 'no_job'.
-- An 'error' row or a claim older than p_lease_seconds can be claimed again; a 'done' row never is.
drop function if exists public.tarot_batch_claim_card(uuid, integer, text, integer);
create function public.tarot_batch_claim_card(p_job_id uuid, p_card_index integer, p_card_name text, p_lease_seconds integer)
returns table (claim_outcome text, done_url text)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_url text;
begin
  if not exists (select 1 from public.tarot_batch_jobs j where j.id = p_job_id) then
    return query select 'no_job'::text, null::text;
    return;
  end if;

  insert into public.tarot_batch_cards as c (job_id, card_index, card_name, status, claimed_at)
  values (p_job_id, p_card_index, p_card_name, 'generating', now())
  on conflict (job_id, card_index) do update
    set status = 'generating', card_name = excluded.card_name, error = null, claimed_at = now(),
        attempts = c.attempts + 1, updated_at = now()
    where c.status = 'error'
       or (c.status = 'generating' and c.claimed_at < now() - make_interval(secs => p_lease_seconds))
  returning c.status into v_status;
  if found then
    return query select 'claimed'::text, null::text;
    return;
  end if;

  select c.status, c.url into v_status, v_url
    from public.tarot_batch_cards c where c.job_id = p_job_id and c.card_index = p_card_index;
  if v_status = 'done' then
    return query select 'done'::text, v_url;
  else
    return query select 'in_progress'::text, null::text;
  end if;
end $$;

-- Record a card's outcome. A 'done' row is final: a late error (or a second success) never overwrites it.
-- Returns the row's status after the call, or null when the row does not exist.
drop function if exists public.tarot_batch_finish_card(uuid, integer, text, text);
create function public.tarot_batch_finish_card(p_job_id uuid, p_card_index integer, p_url text, p_error text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  update public.tarot_batch_cards c
     set status = case when p_url is not null then 'done' else 'error' end,
         url = p_url,
         error = case when p_url is not null then null else left(coalesce(p_error, 'unknown_error'), 2000) end,
         claimed_at = null,
         updated_at = now()
   where c.job_id = p_job_id and c.card_index = p_card_index and c.status <> 'done'
  returning c.status into v_status;
  if found then return v_status; end if;
  select c.status into v_status from public.tarot_batch_cards c where c.job_id = p_job_id and c.card_index = p_card_index;
  return v_status;
end $$;

revoke all on function public.tarot_batch_claim_card(uuid, integer, text, integer) from public, anon, authenticated;
grant execute on function public.tarot_batch_claim_card(uuid, integer, text, integer) to service_role;
revoke all on function public.tarot_batch_finish_card(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.tarot_batch_finish_card(uuid, integer, text, text) to service_role;

commit;
