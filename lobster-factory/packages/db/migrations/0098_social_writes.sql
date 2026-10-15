-- 0098 — social manager writes (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C4; tables in 0096).
-- supabase-js has no transactions, so the writes that must land together are SQL functions:
--   * social_save_post: a post's content with its targets and media, one version bump, compare-and-set on version
--     (0096: child edits must touch the parent in the same transaction so version covers them), plus its audit row.
--     Children are upserted, never deleted and re-inserted. INVARIANT (review 2026-10-15, three rounds): what a target
--     went out with is a fact. Once any target is queued or published, the sent target rows (custom_body, format) and
--     the post-level content they carried (body, first_comment, link_url, link_utm, the media set with its order and
--     alt text) stay exactly as they are: SC409 otherwise. A target holding a Postiz post id is never removed by a
--     save (that id is the only handle on the Postiz post; plan C5 deletes the post, then clears the id). A failed
--     target stays editable; C5 deletes its Postiz ERROR post before sending it again.
--   * social_set_state: a state change (with scheduled_at / list slot / deleted_at) plus its audit row. The caller
--     decides the transition against the row at p_expected_version; every update bumps version, so the CAS also
--     proves the state is the one it decided against.
--   * social_save_list: a rotation list with its account set, in one transaction.
-- Which transitions are legal, and for whom, lives in the app (lib/social/state.ts); the database keeps 0096's shape
-- invariants and refuses edits outside the editable states. Errors: SQLSTATE SC404 (no such row in this brand),
-- SC409 (version moved: someone else saved first, the post left the editable states, or a sent target was touched).
-- Lock order: the post row first, then its children. A writer that locks targets before their post can deadlock
-- with a save (plan C5 claims the post row first).
-- social_connect_attempts: who pressed "connect" for which platform when (ADR 016 §4). Postiz does not say which brand a
-- new integration belongs to and every brand shares one Postiz workspace, so a new id is matched by time: one open
-- new-channel attempt per Postiz instance at a time (two at once could not be told apart), one open attempt per brand.
-- Changing a function signature later: drop the old one in the same migration (create or replace adds an overload,
-- and PostgREST then refuses the call as ambiguous, PGRST203).
--
-- APPLY WITH (Medium, additive; after 0096, in the same deploy as C4): node scripts/apply-db-migration.mjs 0098
-- DOWN: packages/db/scripts/0098_social_writes_down.sql
-- LOCAL PROOF: bash packages/db/scripts/0098_social_writes-local-verify.sh

begin;
set local lock_timeout = '5s';

create table if not exists public.social_connect_attempts (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  postiz_instance       text not null default 'ks-aw-01' check (postiz_instance ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  platform              text not null check (platform ~ '^[a-z][a-z0-9-]{0,30}$'),
  refresh_account_id    uuid,
  known_integration_ids text[] not null,
  started_by            text not null check (length(started_by) <= 320),
  started_at            timestamptz not null default now(),
  outcome               text check (outcome in ('connected', 'expired', 'cancelled')),
  resolved_at           timestamptz,
  account_id            uuid,
  foreign key (refresh_account_id, organization_id) references public.social_accounts (id, organization_id) on delete cascade,
  foreign key (account_id, organization_id) references public.social_accounts (id, organization_id) on delete set null (account_id),
  check ((outcome is null) = (resolved_at is null)),
  check (outcome = 'connected' or account_id is null)
);
create unique index if not exists social_connect_attempts_open_idx on public.social_connect_attempts (organization_id)
  where outcome is null;
create unique index if not exists social_connect_attempts_new_channel_idx on public.social_connect_attempts (postiz_instance)
  where outcome is null and refresh_account_id is null;
create index if not exists social_connect_attempts_org_idx on public.social_connect_attempts (organization_id, started_at desc);
create index if not exists social_connect_attempts_refresh_idx on public.social_connect_attempts (refresh_account_id)
  where refresh_account_id is not null;
create index if not exists social_connect_attempts_account_idx on public.social_connect_attempts (account_id)
  where account_id is not null;

create or replace function public.social_save_post(
  p_org uuid, p_post_id uuid, p_expected_version integer, p_post jsonb, p_targets jsonb, p_media jsonb, p_actor text)
returns table (saved_post_id uuid, saved_version integer)  -- not post_id: it would shadow the children's column
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_version integer;
  v_action text;
  v_old public.social_posts%rowtype;
begin
  p_post := coalesce(p_post, '{}'::jsonb);
  -- one row per account / media item: a duplicate would pass the sent-target check with its first copy and rewrite
  -- the target with its second
  if p_targets is not null and (select count(*) <> count(distinct n->>'account_id') from jsonb_array_elements(p_targets) n) then
    raise exception 'an account appears twice in the targets' using errcode = '22023';
  end if;
  if p_media is not null and (select count(*) <> count(distinct n->>'media_id') from jsonb_array_elements(p_media) n) then
    raise exception 'a media item appears twice' using errcode = '22023';
  end if;
  if p_post_id is not null then
    -- the row lock first (0098 lock order; the lock the UPDATE below takes anyway), so the checks cannot race the sender
    select * into v_old from public.social_posts where id = p_post_id and organization_id = p_org for no key update;
    if found and exists (select 1 from public.social_post_targets t where t.post_id = p_post_id and t.state in ('queued', 'published'))
       and ((p_post ? 'body' and coalesce(p_post->>'body', '') is distinct from v_old.body)
         or (p_post ? 'first_comment' and p_post->>'first_comment' is distinct from v_old.first_comment)
         or (p_post ? 'link_url' and p_post->>'link_url' is distinct from v_old.link_url)
         or (p_post ? 'link_utm' and coalesce((p_post->>'link_utm')::boolean, false) is distinct from v_old.link_utm)
         or (p_media is not null and (
               (select count(*) from jsonb_array_elements(p_media)) <> (select count(*) from public.social_post_media m where m.post_id = p_post_id)
            or exists (select 1 from jsonb_array_elements(p_media) n where not exists (
                 select 1 from public.social_post_media m where m.post_id = p_post_id and m.media_id = (n->>'media_id')::uuid
                   and m.position = coalesce((n->>'position')::smallint, 0) and m.alt_text is not distinct from n->>'alt_text'))))) then
      raise exception 'social post %: its content already went out to a channel; give the other channels their own text instead', p_post_id
        using errcode = 'SC409';
    end if;
  end if;
  if p_post_id is null then
    insert into public.social_posts (organization_id, body, first_comment, link_url, link_utm, notes, source_url, created_by)
    values (p_org, coalesce(p_post->>'body', ''), p_post->>'first_comment', p_post->>'link_url',
            coalesce((p_post->>'link_utm')::boolean, false), p_post->>'notes', p_post->>'source_url', p_actor)
    returning id into v_id;
    v_action := 'create';
  else
    -- every save updates the row, so version goes up once and covers the children changed below
    update public.social_posts s set
      body          = case when p_post ? 'body' then coalesce(p_post->>'body', '') else s.body end,
      first_comment = case when p_post ? 'first_comment' then p_post->>'first_comment' else s.first_comment end,
      link_url      = case when p_post ? 'link_url' then p_post->>'link_url' else s.link_url end,
      link_utm      = case when p_post ? 'link_utm' then coalesce((p_post->>'link_utm')::boolean, false) else s.link_utm end,
      notes         = case when p_post ? 'notes' then p_post->>'notes' else s.notes end,
      source_url    = case when p_post ? 'source_url' then p_post->>'source_url' else s.source_url end
    where s.id = p_post_id and s.organization_id = p_org and s.version = p_expected_version
      and s.state in ('draft', 'review', 'scheduled', 'error', 'rotation')
    returning s.id into v_id;
    if v_id is null then
      if exists (select 1 from public.social_posts where id = p_post_id and organization_id = p_org) then
        raise exception 'social post % changed since version % or is not editable in its state', p_post_id, p_expected_version
          using errcode = 'SC409';
      end if;
      raise exception 'no social post % in this brand', p_post_id using errcode = 'SC404';
    end if;
    v_action := 'edit';
  end if;

  if p_targets is not null then
    if exists (
      select 1 from public.social_post_targets t
      where t.post_id = v_id and t.state in ('queued', 'published')
        and not exists (select 1 from jsonb_array_elements(p_targets) n
                        where (n->>'account_id')::uuid = t.account_id and n->>'custom_body' is not distinct from t.custom_body
                          and coalesce(n->>'format', 'post') = t.format)) then
      raise exception 'social post %: a target already sent cannot be changed or removed', v_id using errcode = 'SC409';
    end if;
    if exists (
      select 1 from public.social_post_targets t
      where t.post_id = v_id and t.postiz_post_id is not null
        and not exists (select 1 from jsonb_array_elements(p_targets) n where (n->>'account_id')::uuid = t.account_id)) then
      raise exception 'social post %: a target with a Postiz post cannot be removed until the sender deletes that post', v_id
        using errcode = 'SC409';
    end if;
    delete from public.social_post_targets t where t.post_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_targets) n where (n->>'account_id')::uuid = t.account_id);
    insert into public.social_post_targets (organization_id, post_id, account_id, custom_body, format)
    select p_org, v_id, (n->>'account_id')::uuid, n->>'custom_body', coalesce(n->>'format', 'post')
    from jsonb_array_elements(p_targets) n
    on conflict (post_id, account_id) do update set custom_body = excluded.custom_body, format = excluded.format
      where (social_post_targets.custom_body, social_post_targets.format) is distinct from (excluded.custom_body, excluded.format);
  end if;
  if p_media is not null then
    delete from public.social_post_media m where m.post_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_media) n where (n->>'media_id')::uuid = m.media_id);
    insert into public.social_post_media (organization_id, post_id, media_id, position, alt_text)
    select p_org, v_id, (n->>'media_id')::uuid, coalesce((n->>'position')::smallint, 0), n->>'alt_text'
    from jsonb_array_elements(p_media) n
    on conflict (post_id, media_id) do update set position = excluded.position, alt_text = excluded.alt_text
      where (social_post_media.position, social_post_media.alt_text) is distinct from (excluded.position, excluded.alt_text);
  end if;

  select version into v_version from public.social_posts where id = v_id;
  insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
  values (p_org, p_actor, v_action, v_id, jsonb_build_object(
    'fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_post) k),
    'targets', case when p_targets is null then null else jsonb_array_length(p_targets) end,
    'media', case when p_media is null then null else jsonb_array_length(p_media) end));
  return query select v_id, v_version;
end $$;

create or replace function public.social_set_state(
  p_org uuid, p_post_id uuid, p_expected_version integer, p_state text, p_scheduled_at timestamptz,
  p_list_id uuid, p_list_position integer, p_actor text, p_action text, p_detail jsonb)
returns table (saved_post_id uuid, saved_version integer)  -- not post_id: it would shadow the children's column
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_version integer;
  v_from text;
begin
  select state into v_from from public.social_posts where id = p_post_id and organization_id = p_org;
  if v_from is null then
    raise exception 'no social post % in this brand', p_post_id using errcode = 'SC404';
  end if;
  update public.social_posts s set
    state = p_state, scheduled_at = p_scheduled_at, list_id = p_list_id, list_position = p_list_position,
    deleted_at = case when p_state = 'deleted' then coalesce(s.deleted_at, now()) else null end
  where s.id = p_post_id and s.organization_id = p_org and s.version = p_expected_version
  returning s.id, s.version into v_id, v_version;
  if v_id is null then
    raise exception 'social post % changed since version %', p_post_id, p_expected_version using errcode = 'SC409';
  end if;
  insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
  values (p_org, p_actor, p_action, v_id,
          coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('from', v_from, 'to', p_state, 'scheduled_at', p_scheduled_at));
  return query select v_id, v_version;
end $$;

create or replace function public.social_save_list(
  p_org uuid, p_list_id uuid, p_name text, p_weekdays smallint[], p_send_time time, p_active boolean, p_account_ids uuid[])
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  p_account_ids := coalesce(p_account_ids, '{}');
  if p_list_id is null then
    insert into public.social_lists (organization_id, name, weekdays, send_time, active)
    values (p_org, p_name, p_weekdays, p_send_time, p_active) returning id into v_id;
  else
    update public.social_lists set name = p_name, weekdays = p_weekdays, send_time = p_send_time, active = p_active
    where id = p_list_id and organization_id = p_org returning id into v_id;
    if v_id is null then
      raise exception 'no social list % in this brand', p_list_id using errcode = 'SC404';
    end if;
  end if;
  delete from public.social_list_accounts la where la.list_id = v_id and la.account_id <> all (p_account_ids);
  insert into public.social_list_accounts (list_id, account_id, organization_id)
  select v_id, a, p_org from unnest(p_account_ids) a
  on conflict (list_id, account_id) do nothing;
  return v_id;
end $$;

alter table public.social_connect_attempts enable row level security;
drop policy if exists "service_role only" on public.social_connect_attempts;
create policy "service_role only" on public.social_connect_attempts to service_role using (true) with check (true);
revoke all on public.social_connect_attempts from public, anon, authenticated;
grant all on public.social_connect_attempts to service_role;
revoke all on function public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text),
  public.social_set_state(uuid, uuid, integer, text, timestamptz, uuid, integer, text, text, jsonb),
  public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text),
  public.social_set_state(uuid, uuid, integer, text, timestamptz, uuid, integer, text, text, jsonb),
  public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[]) to service_role;

notify pgrst, 'reload schema';

commit;
