-- 0101 — rotation lists (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C7; tables 0096, writes 0098, sender 0100).
-- A list's items are its state='rotation' posts in list_position order; social_lists.cursor counts the items used so far
-- (item = cursor mod n). The daily task social-rotation (lib/social/rotation.ts) materialises the next 7 days of the
-- list's weekday x send_time slots into ordinary scheduled posts that carry list_id; the sender (0100) sends them.
--
-- INVARIANTS:
--   * A slot is materialised once: materialized_until is the last slot done, and (origin_list_id, origin_slot) -- both
--     set when a post is materialised and never changed, unlike list_id and scheduled_at -- is unique over every state,
--     so a slot whose post a person edited, moved or deleted (list_id cleared: 0096/0098 transitions, and from here a
--     content edit) is never made again (review 2026-10-15, twice: keying on list_id, then on scheduled_at, did).
--   * The schedule follows the list: every save (rename, new time, new channels, pause) withdraws every materialised
--     post not yet sent (state scheduled and still list_id -- also one already due that the sender has not claimed;
--     a claimed one is queued, already in Postiz, and stays), gives their items back (cursor -= n) and resets
--     materialized_until to now; the caller materialises again.
--   * Items are reordered in one transaction (social_reorder_list), only as a permutation of the current items.
--   * A list is deleted only when it holds no items (SC409), withdrawing its unsent materialised posts first.
-- social_save_post is 0098's function with one change (list_id cleared on edit outside rotation); social_save_list is
-- 0098's plus the withdrawal and an audit row, with p_actor (so the 7-argument 0098 version is dropped: two overloads
-- would make PostgREST refuse the call, PGRST203). Generated from 0098's text by a script so the copies match it.
--
-- APPLY WITH (Medium, additive; ship with C7): node scripts/apply-db-migration.mjs 0101
-- DOWN: packages/db/scripts/0101_social_rotation_down.sql
-- LOCAL PROOF: bash packages/db/scripts/0101_social_rotation-local-verify.sh

begin;
set local lock_timeout = '5s';

alter table public.social_lists add column if not exists materialized_until timestamptz;
alter table public.social_posts add column if not exists origin_list_id uuid;
alter table public.social_posts add column if not exists origin_slot timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_posts_origin_list_fk') then
    alter table public.social_posts add constraint social_posts_origin_list_fk
      foreign key (origin_list_id, organization_id) references public.social_lists (id, organization_id) on delete set null (origin_list_id);
  end if;
end $$;
create unique index if not exists social_posts_origin_slot_idx on public.social_posts (origin_list_id, origin_slot)
  where origin_list_id is not null;

-- withdraw a list's unsent materialised posts (callers hold or take the list row lock); returns how many
create or replace function public.social_withdraw_list(p_org uuid, p_list uuid, p_reason text, p_actor text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  perform 1 from public.social_lists where id = p_list and organization_id = p_org for update;
  if not found then
    return 0;
  end if;
  with gone as (
    delete from public.social_posts p
    where p.list_id = p_list and p.organization_id = p_org and p.state = 'scheduled'
    returning p.id
  )
  select count(*) into v_n from gone;
  update public.social_lists set cursor = greatest(cursor - v_n, 0), materialized_until = now() where id = p_list;
  if v_n > 0 then
    insert into public.social_audit_log (organization_id, actor, action, detail)
    values (p_org, p_actor, 'rotation_withdraw', jsonb_build_object('list_id', p_list, 'posts', v_n, 'reason', p_reason));
  end if;
  return v_n;
end $$;

-- materialise the given slots (sorted, the caller's brand time zone) of an active list; returns how many posts
create or replace function public.social_materialize_list(p_list uuid, p_slots timestamptz[], p_actor text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_list public.social_lists%rowtype;
  v_items uuid[];
  v_item public.social_posts%rowtype;
  v_slot timestamptz;
  v_new uuid;
  v_done integer := 0;
begin
  select * into v_list from public.social_lists where id = p_list for update;
  if not found or not v_list.active then
    return 0;
  end if;
  select array_agg(id order by list_position) into v_items from public.social_posts where list_id = p_list and state = 'rotation';
  if v_items is null or not exists (select 1 from public.social_list_accounts where list_id = p_list) then
    return 0;
  end if;
  foreach v_slot in array coalesce(p_slots, '{}') loop
    continue when v_slot <= now() or v_slot <= coalesce(v_list.materialized_until, '-infinity');
    select * into v_item from public.social_posts where id = v_items[(v_list.cursor % cardinality(v_items)) + 1];
    insert into public.social_posts (organization_id, state, body, scheduled_at, list_id, origin_list_id, origin_slot, first_comment,
                                     link_url, link_utm, source_url, created_by)
    values (v_list.organization_id, 'scheduled', v_item.body, v_slot, p_list, p_list, v_slot, v_item.first_comment,
            v_item.link_url, v_item.link_utm, v_item.source_url, p_actor)
    on conflict do nothing   -- the slot already has its post (origin or list slot index): done, the item is not used
    returning id into v_new;
    if v_new is not null then
      insert into public.social_post_targets (organization_id, post_id, account_id, custom_body, format)
      select v_list.organization_id, v_new, la.account_id, t.custom_body, coalesce(t.format, 'post')
      from public.social_list_accounts la
      left join public.social_post_targets t on t.post_id = v_item.id and t.account_id = la.account_id
      where la.list_id = p_list;
      insert into public.social_post_media (organization_id, post_id, media_id, position, alt_text)
      select v_list.organization_id, v_new, m.media_id, m.position, m.alt_text from public.social_post_media m where m.post_id = v_item.id;
      insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
      values (v_list.organization_id, p_actor, 'rotation_post', v_new,
              jsonb_build_object('list_id', p_list, 'item', v_item.id, 'scheduled_at', v_slot));
      v_list.cursor := v_list.cursor + 1;
      v_done := v_done + 1;
    end if;
    v_list.materialized_until := v_slot;
    v_new := null;
  end loop;
  update public.social_lists set cursor = v_list.cursor, materialized_until = v_list.materialized_until where id = p_list;
  return v_done;
end $$;

-- the list's items in a new order: p_post_ids must be exactly its current items
create or replace function public.social_reorder_list(p_org uuid, p_list uuid, p_post_ids uuid[], p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.social_lists where id = p_list and organization_id = p_org for update;
  if not found then
    raise exception 'no social list % in this brand', p_list using errcode = 'SC404';
  end if;
  if (select coalesce(array_agg(id order by id), '{}') from public.social_posts where list_id = p_list and state = 'rotation')
     is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(p_post_ids) x) then
    raise exception 'social list %: the items changed since you loaded them; reload', p_list using errcode = 'SC409';
  end if;
  -- two steps: list_position is unique per list while in rotation
  update public.social_posts p set list_position = 1000000 + o.n
  from unnest(p_post_ids) with ordinality o(id, n) where p.id = o.id;
  update public.social_posts p set list_position = o.n - 1
  from unnest(p_post_ids) with ordinality o(id, n) where p.id = o.id;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'rotation_reorder', jsonb_build_object('list_id', p_list, 'items', cardinality(p_post_ids)));
end $$;

-- delete a list: refused while it holds items (they move out first); its unsent materialised posts are withdrawn
create or replace function public.social_delete_list(p_org uuid, p_list uuid, p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_items integer;
begin
  perform 1 from public.social_lists where id = p_list and organization_id = p_org for update;
  if not found then
    raise exception 'no social list % in this brand', p_list using errcode = 'SC404';
  end if;
  select count(*) into v_items from public.social_posts where list_id = p_list and state = 'rotation';
  if v_items > 0 then
    raise exception 'the list still holds % rotation post(s); move them out first', v_items using errcode = 'SC409';
  end if;
  perform public.social_withdraw_list(p_org, p_list, 'list_deleted', p_actor);
  delete from public.social_lists where id = p_list and organization_id = p_org;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'list_delete', jsonb_build_object('list_id', p_list));
end $$;

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
      source_url    = case when p_post ? 'source_url' then p_post->>'source_url' else s.source_url end,
      -- 0101: a person who edits a materialised rotation post makes it a manual post (plan C7); an item still in
      -- rotation keeps its list
      list_id       = case when s.state = 'rotation' then s.list_id else null end
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

drop function if exists public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[]);
create or replace function public.social_save_list(
  p_org uuid, p_list_id uuid, p_name text, p_weekdays smallint[], p_send_time time, p_active boolean, p_account_ids uuid[], p_actor text)
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
  -- 0101: the schedule follows the list -- every save (pause included) takes back what was materialised and not yet
  -- sent; the caller materialises again from the saved list (lib/social/rotation.ts)
  perform public.social_withdraw_list(p_org, v_id, 'list_saved', p_actor);
  -- 0101 (plan C11): every list change is in the brand's log
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'list_save', jsonb_build_object('list_id', v_id, 'name', p_name, 'active', p_active, 'weekdays', p_weekdays));
  return v_id;
end $$;

revoke all on function public.social_withdraw_list(uuid, uuid, text, text), public.social_materialize_list(uuid, timestamptz[], text),
  public.social_reorder_list(uuid, uuid, uuid[], text), public.social_delete_list(uuid, uuid, text),
  public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[], text) from public, anon, authenticated;
grant execute on function public.social_withdraw_list(uuid, uuid, text, text), public.social_materialize_list(uuid, timestamptz[], text),
  public.social_reorder_list(uuid, uuid, uuid[], text), public.social_delete_list(uuid, uuid, text),
  public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[], text) to service_role;

notify pgrst, 'reload schema';

commit;
