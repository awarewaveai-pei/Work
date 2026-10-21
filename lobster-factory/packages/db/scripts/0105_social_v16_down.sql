-- Down for 0105_social_v16.sql: the functions back to their 0098 / 0101 text (generated from those files by a script, so the
-- copies match), the 0105 tables, columns, constraints and functions gone. Run by hand (psql as supabase_admin):
-- apply-db-migration.mjs skips .down files, so this file clears its own ledger row and reloads PostgREST.
-- ORDER: deploy code that does not read the 0105 tables or columns first (lib/social/store.ts POST_COLUMNS selects them).
-- ONE-WAY LOSS (by design: the old shape cannot hold them): comments after position 0 (position 0 is first_comment,
-- which 0105 kept in step), list slots beyond the legacy weekdays x send_time (send_time keeps the earliest), tags, repeat
-- rules (children already made stay as ordinary scheduled posts), auto-reply rules, smart links and their clicks,
-- metrics snapshots, reports, channel pictures / handles / Chatwoot inbox ids, auto_mode none / own, comment 0's
-- delay and media (a comment 0 that is only an image is gone: first_comment holds text only).
-- Dropping tables with a foreign key to organizations takes that table's ACCESS EXCLUSIVE lock: run it off-peak.
--
-- APPLY WITH:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0105_social_v16.down.sql
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0105_social_v16.sql';
  end if;
end $$;

drop function if exists public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text, jsonb, uuid[]);
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

revoke all on function public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text) to service_role;

drop function if exists public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[], text, jsonb);
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

revoke all on function public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[], text) from public, anon, authenticated;
grant execute on function public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[], text) to service_role;

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

drop function if exists public.social_repeat_materialize(uuid, uuid, timestamptz[], boolean, text);
drop function if exists public.social_touch_post_rules(uuid, uuid, text);
drop function if exists public.social_stop_repeat(uuid, uuid, integer, text);
drop function if exists public.social_withdraw_repeat(uuid, uuid, text, text);
drop function if exists public.social_save_tag(uuid, uuid, text, text, text);
drop function if exists public.social_delete_tag(uuid, uuid, text);
drop function if exists public.social_save_auto_rule(uuid, uuid, jsonb, text);
drop function if exists public.social_delete_auto_rule(uuid, uuid, text);
drop function if exists public.social_auto_rule_hit(uuid, uuid, text, jsonb);
drop function if exists public.social_save_smart_link(uuid, jsonb, jsonb, text);
drop function if exists public.social_smart_link_click(text, uuid);
drop function if exists public.social_create_report(uuid, jsonb, text);
drop function if exists public.social_delete_report(uuid, uuid, text);

drop table if exists public.social_reports;
drop table if exists public.social_post_metrics;
drop table if exists public.social_metrics_daily;
drop table if exists public.social_smart_link_clicks;
drop table if exists public.social_smart_link_items;
drop table if exists public.social_smart_links;
drop table if exists public.social_auto_rules;
drop table if exists public.social_list_slots;
drop table if exists public.social_post_comments;
drop table if exists public.social_post_tags;
drop table if exists public.social_tags;
drop function if exists public.social_comments_json(uuid);

drop index if exists public.social_posts_repeat_idx;
drop index if exists public.social_posts_repeat_slot_idx;
alter table public.social_posts drop constraint if exists social_posts_repeat_of_fk;
alter table public.social_posts drop constraint if exists social_posts_repeat_child;
alter table public.social_posts drop constraint if exists social_posts_repeat_shape;
alter table public.social_posts drop constraint if exists social_posts_auto_mode_check;
alter table public.social_posts drop column if exists repeat;
alter table public.social_posts drop column if exists repeat_of;
alter table public.social_posts drop column if exists auto_mode;
drop function if exists public.social_repeat_ok(jsonb);
alter table public.social_accounts drop column if exists picture;
alter table public.social_accounts drop column if exists handle;
alter table public.social_accounts drop column if exists chatwoot_inbox_id;

notify pgrst, 'reload schema';
commit;
