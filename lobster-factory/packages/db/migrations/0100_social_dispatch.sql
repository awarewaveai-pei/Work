-- 0100 — social sender (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C5; tables 0096, user writes 0098).
-- The dispatcher (next-admin lib/social/dispatch.ts, called every 5 minutes by the Trigger task social-dispatch) moves a
-- post scheduled -> queued -> published | error and is the only writer of a target's send columns. Each step that
-- must land together is one function here; every one locks the post row before its targets (0098 lock order).
--
-- INVARIANTS:
--   * A post is claimed once: social_claim_due takes scheduled rows FOR UPDATE SKIP LOCKED, so two overlapping runs
--     never both queue (and send) it.
--   * A Postiz post is created at most once per target send. social_begin_send stamps send_started_at (a lease) and
--     picks send_key BEFORE the Postiz call; the sender stores it in the Postiz post's settings (awarewave_send_key:
--     Postiz v2.25.1's public create keeps unknown settings keys and GET /posts returns them). A stamp without a Postiz
--     id after the lease is an UNCERTAIN send (the run died between the call and the write-back): it gets the SAME key
--     back, finds the post by that exact key if Postiz has it, and only otherwise sends again with it
--     (review 2026-10-15: matching by text could adopt a person's post or one with another link; Postiz does not
--     take a caller's post id -- its create branch assigns its own).
--   * Write-backs land only on the claim they belong to: post still queued at the version the run read. A user who
--     withdrew the post (social_release_post bumps version) makes the late write-back return false; in the same
--     transaction the Postiz id goes into social_postiz_orphans, and every run deletes the orphans it holds there until
--     Postiz confirms (a failed delete is retried, never forgotten -- review 2026-10-15: a withdrawn post must not go out).
--   * A published target is never reset to pending (that would send it twice). The post's state follows its targets
--     (social_record_outcome): all published -> published; any pending/queued -> queued; otherwise error.
--   * social_release_post (a person reschedules, unschedules, deletes or publishes-now a queued post) refuses while a
--     send is in flight or uncertain, and refuses when a queued target holds a Postiz id the caller did not delete.
--
-- APPLY WITH (Medium, additive; ship with C5): node scripts/apply-db-migration.mjs 0100
-- DOWN: packages/db/scripts/0100_social_dispatch_down.sql
-- LOCAL PROOF: bash packages/db/scripts/0100_social_dispatch-local-verify.sh

begin;
set local lock_timeout = '5s';

alter table public.social_post_targets add column if not exists send_started_at timestamptz;
alter table public.social_post_targets add column if not exists send_key text check (send_key is null or length(send_key) between 8 and 100);

-- Postiz posts no target owns (a write-back refused after the create): deleted by the next runs, then removed here
create table if not exists public.social_postiz_orphans (
  postiz_post_id  text primary key check (length(postiz_post_id) between 1 and 100),
  postiz_instance text not null default 'ks-aw-01',
  found_at        timestamptz not null default now(),
  attempts        integer not null default 0,
  last_error      text check (length(last_error) <= 2000)
);

-- 429 backoff per Postiz instance: Postiz says when its hourly budget resets; every run until then sends nothing
create table if not exists public.social_dispatch_state (
  postiz_instance text primary key check (postiz_instance ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  backoff_until   timestamptz,
  updated_at      timestamptz not null default now()
);

create or replace function public.social_claim_due(p_until timestamptz, p_limit integer, p_actor text)
returns table (claimed_post_id uuid, claimed_org uuid, claimed_version integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    update public.social_posts s set state = 'queued'
    where s.id in (select d.id from public.social_posts d
                   where d.state = 'scheduled' and d.scheduled_at <= p_until
                   order by d.scheduled_at, d.id limit greatest(p_limit, 0)
                   for update skip locked)
    returning s.id, s.organization_id, s.version, s.scheduled_at
  loop
    insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
    values (r.organization_id, p_actor, 'queue', r.id,
            jsonb_build_object('from', 'scheduled', 'to', 'queued', 'scheduled_at', r.scheduled_at));
    claimed_post_id := r.id; claimed_org := r.organization_id; claimed_version := r.version;
    return next;
  end loop;
end $$;

-- lease: 'go' = send it with send_key; 'uncertain' = an earlier send with this same send_key may have reached Postiz:
-- look it up by that id, else send it again with it; 'busy' = another run holds the lease; 'done' = nothing to send
-- for this target; 'stale' = the post is no longer this run's claim. 'go' and 'uncertain' take the lease.
create or replace function public.social_begin_send(p_org uuid, p_post_id uuid, p_version integer, p_target_id uuid, p_lease interval)
returns table (lease text, send_key text)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_post public.social_posts%rowtype;
  v_t public.social_post_targets%rowtype;
  v_key text;
begin
  select * into v_post from public.social_posts where id = p_post_id and organization_id = p_org for no key update;
  if not found or v_post.state <> 'queued' or v_post.version <> p_version then
    return query select 'stale'::text, null::text;
    return;
  end if;
  select * into v_t from public.social_post_targets where id = p_target_id and post_id = p_post_id for update;
  if not found or v_t.state <> 'pending' or v_t.postiz_post_id is not null then
    return query select 'done'::text, null::text;
    return;
  end if;
  if v_t.send_started_at is not null and v_t.send_started_at > now() - p_lease then
    return query select 'busy'::text, null::text;
    return;
  end if;
  v_key := case when v_t.send_started_at is not null and v_t.send_key is not null then v_t.send_key else gen_random_uuid()::text end;
  update public.social_post_targets t set send_started_at = now(), send_key = v_key where t.id = p_target_id;
  return query select case when v_t.send_started_at is null then 'go' else 'uncertain' end, v_key;
end $$;

-- One target's send result. p_postiz_post_id set = in Postiz (queued); p_error set = refused for good (error); both
-- null = nothing reached Postiz (a 429): the lease is dropped and the target stays pending.
-- false = the post is no longer this claim: the caller deletes the Postiz post it made.
create or replace function public.social_record_send(p_org uuid, p_post_id uuid, p_version integer, p_target_id uuid,
  p_postiz_post_id text, p_error text, p_actor text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_post public.social_posts%rowtype;
  v_n integer;
begin
  select * into v_post from public.social_posts where id = p_post_id and organization_id = p_org for no key update;
  if not found or v_post.state <> 'queued' or v_post.version <> p_version then
    if p_postiz_post_id is not null
       and not exists (select 1 from public.social_post_targets where postiz_post_id = p_postiz_post_id) then
      insert into public.social_postiz_orphans (postiz_post_id) values (p_postiz_post_id) on conflict do nothing;
    end if;
    return false;
  end if;
  if p_postiz_post_id is not null then
    update public.social_post_targets set state = 'queued', postiz_post_id = p_postiz_post_id, error = null, send_started_at = null, send_key = null
    where id = p_target_id and post_id = p_post_id and state = 'pending' and postiz_post_id is null;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      -- already recorded with this id (a retried write-back) is fine; anything else is not this send's target any more
      return exists (select 1 from public.social_post_targets where id = p_target_id and postiz_post_id = p_postiz_post_id);
    end if;
  elsif p_error is not null then
    update public.social_post_targets set state = 'error', error = left(p_error, 4000), send_started_at = null, send_key = null
    where id = p_target_id and post_id = p_post_id and state = 'pending';
  else
    update public.social_post_targets set send_started_at = null, send_key = null
    where id = p_target_id and post_id = p_post_id and state = 'pending' and postiz_post_id is null;
    return true;
  end if;
  insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
  values (p_org, p_actor, case when p_postiz_post_id is not null then 'send' else 'send_failed' end, p_post_id,
          jsonb_strip_nulls(jsonb_build_object('target_id', p_target_id, 'postiz_post_id', p_postiz_post_id, 'error', left(p_error, 500))));
  return true;
end $$;

-- A failed target goes back to pending once its Postiz ERROR post was deleted (C4 review: resend only pending/error
-- targets, and never leave the failed Postiz post behind).
create or replace function public.social_reset_target(p_org uuid, p_post_id uuid, p_version integer, p_target_id uuid,
  p_deleted_postiz_post_id text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_post public.social_posts%rowtype;
  v_n integer;
begin
  select * into v_post from public.social_posts where id = p_post_id and organization_id = p_org for no key update;
  if not found or v_post.state <> 'queued' or v_post.version <> p_version then
    return false;
  end if;
  update public.social_post_targets
  set state = 'pending', postiz_post_id = null, release_url = null, error = null, send_started_at = null, send_key = null
  where id = p_target_id and post_id = p_post_id and state = 'error' and postiz_post_id is not distinct from p_deleted_postiz_post_id;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

-- What Postiz reported for queued targets: p_targets = [{id, state: published|error, release_url?, error?}]. Only a
-- queued target moves (a published one is final). Then the post follows its targets. Returns the post's state, or
-- null when the post is no longer this claim.
create or replace function public.social_record_outcome(p_org uuid, p_post_id uuid, p_version integer, p_targets jsonb, p_actor text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_post public.social_posts%rowtype;
  v_next text;
  v_open integer; v_err integer; v_all integer;
begin
  select * into v_post from public.social_posts where id = p_post_id and organization_id = p_org for no key update;
  if not found or v_post.state <> 'queued' or v_post.version <> p_version then
    return null;
  end if;
  update public.social_post_targets t set
    state = n.state,
    release_url = case when n.state = 'published' then n.release_url else t.release_url end,
    error = case when n.state = 'error' then left(coalesce(n.error, 'Postiz reported an error'), 4000) else null end
  from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb)) as n(id uuid, state text, release_url text, error text)
  where t.id = n.id and t.post_id = p_post_id and t.state = 'queued' and n.state in ('published', 'error');

  select count(*) filter (where state in ('pending', 'queued')), count(*) filter (where state = 'error'), count(*)
    into v_open, v_err, v_all
  from public.social_post_targets where post_id = p_post_id;
  v_next := case when v_open > 0 then 'queued' when v_err > 0 or v_all = 0 then 'error' else 'published' end;
  if v_next <> 'queued' then
    update public.social_posts set state = v_next, published_at = case when v_next = 'published' then now() else null end
    where id = p_post_id;
    insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
    values (p_org, p_actor, case when v_next = 'published' then 'published' else 'failed' end, p_post_id,
            jsonb_build_object('from', 'queued', 'to', v_next, 'errors', v_err, 'targets', v_all));
  end if;
  return v_next;
end $$;

-- A person changes a queued post: the caller has already deleted p_deleted_postiz_ids in Postiz. Those targets go back
-- to pending; the post takes the new state. SC409 while a send is in flight or uncertain, when a queued target holds
-- an id the caller did not delete, or when one of them was published meanwhile.
create or replace function public.social_release_post(p_org uuid, p_post_id uuid, p_expected_version integer,
  p_deleted_postiz_ids text[], p_state text, p_scheduled_at timestamptz, p_actor text, p_action text, p_detail jsonb)
returns table (saved_post_id uuid, saved_version integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_post public.social_posts%rowtype;
  v_version integer;
begin
  p_deleted_postiz_ids := coalesce(p_deleted_postiz_ids, '{}');
  select * into v_post from public.social_posts where id = p_post_id and organization_id = p_org for no key update;
  if not found then
    raise exception 'no social post % in this brand', p_post_id using errcode = 'SC404';
  end if;
  if v_post.state <> 'queued' or v_post.version <> p_expected_version then
    raise exception 'social post % changed since version %', p_post_id, p_expected_version using errcode = 'SC409';
  end if;
  if p_state not in ('scheduled', 'draft', 'deleted') then
    raise exception 'a queued post can only be rescheduled, unscheduled or deleted, not moved to %', p_state using errcode = '22023';
  end if;
  if exists (select 1 from public.social_post_targets where post_id = p_post_id and state = 'pending' and send_started_at is not null) then
    raise exception 'social post %: a channel is being sent right now; try again in a few minutes', p_post_id using errcode = 'SC409';
  end if;
  if exists (select 1 from public.social_post_targets where post_id = p_post_id and state = 'queued'
             and not (postiz_post_id = any (p_deleted_postiz_ids))) then
    raise exception 'social post %: a channel was sent after you loaded it; reload', p_post_id using errcode = 'SC409';
  end if;
  if exists (select 1 from public.social_post_targets where post_id = p_post_id and state = 'published'
             and postiz_post_id = any (p_deleted_postiz_ids)) then
    raise exception 'social post %: a channel already published; reload', p_post_id using errcode = 'SC409';
  end if;
  update public.social_post_targets
  set state = 'pending', postiz_post_id = null, release_url = null, error = null, send_started_at = null, send_key = null
  where post_id = p_post_id and state in ('queued', 'error') and postiz_post_id = any (p_deleted_postiz_ids);
  update public.social_posts s set
    state = p_state, scheduled_at = case when p_state = 'scheduled' then p_scheduled_at else s.scheduled_at end,
    list_id = null, list_position = null,
    deleted_at = case when p_state = 'deleted' then now() else null end
  where s.id = p_post_id
  returning s.version into v_version;
  insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
  values (p_org, p_actor, p_action, p_post_id, coalesce(p_detail, '{}'::jsonb) || jsonb_build_object(
    'from', 'queued', 'to', p_state, 'scheduled_at', p_scheduled_at, 'withdrawn', cardinality(p_deleted_postiz_ids)));
  return query select p_post_id, v_version;
end $$;

-- a failed post raises an ops incident (source 'social'): 0097's list plus 'social'
do $$
begin
  if to_regclass('public.ops_incidents') is not null then
    alter table public.ops_incidents drop constraint if exists ops_incidents_source_check;
    alter table public.ops_incidents add constraint ops_incidents_source_check
      check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch','schedule','social'));
  end if;
end $$;

alter table public.social_postiz_orphans enable row level security;
drop policy if exists "service_role only" on public.social_postiz_orphans;
create policy "service_role only" on public.social_postiz_orphans to service_role using (true) with check (true);
revoke all on public.social_postiz_orphans from public, anon, authenticated;
grant all on public.social_postiz_orphans to service_role;

alter table public.social_dispatch_state enable row level security;
drop policy if exists "service_role only" on public.social_dispatch_state;
create policy "service_role only" on public.social_dispatch_state to service_role using (true) with check (true);
revoke all on public.social_dispatch_state from public, anon, authenticated;
grant all on public.social_dispatch_state to service_role;

revoke all on function public.social_claim_due(timestamptz, integer, text),
  public.social_begin_send(uuid, uuid, integer, uuid, interval),
  public.social_record_send(uuid, uuid, integer, uuid, text, text, text),
  public.social_reset_target(uuid, uuid, integer, uuid, text),
  public.social_record_outcome(uuid, uuid, integer, jsonb, text),
  public.social_release_post(uuid, uuid, integer, text[], text, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.social_claim_due(timestamptz, integer, text),
  public.social_begin_send(uuid, uuid, integer, uuid, interval),
  public.social_record_send(uuid, uuid, integer, uuid, text, text, text),
  public.social_reset_target(uuid, uuid, integer, uuid, text),
  public.social_record_outcome(uuid, uuid, integer, jsonb, text),
  public.social_release_post(uuid, uuid, integer, text[], text, timestamptz, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
