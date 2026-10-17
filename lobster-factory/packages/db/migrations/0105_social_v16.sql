-- 0105 — social manager V1.5 schema (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md §1b C20; mock v16, ADR 016 §5).
-- Everything the V1.5 UI cards (C19, C21-C31) read or write, so none of them opens a migration (C28's ads tables are
-- its own 0106). Tables 0096, writes 0098, sender 0100, rotation 0101.
--
-- SAFE TO APPLY ALONE, BEFORE ANY V1.5 CODE (operator 2026-10-17): additive only; every backfill re-runs as a no-op;
-- the code deployed today keeps working against it:
--   * social_save_post / social_save_list keep every parameter name they had and add new ones WITH DEFAULTS (the old
--     signatures are dropped -- two overloads make PostgREST refuse the call, PGRST203 -- and a call by the old names
--     resolves to the new function).
--   * social_posts.first_comment stays and stays equal to comment position 0: the sender (dispatch-store.ts) still reads
--     it until C21 moves compose.ts to social_post_comments; a save through either shape updates both. Dropped by the
--     migration after C21 ships.
--   * social_lists.weekdays / send_time stay and follow the slots (weekdays = the slots' days, send_time = the earliest
--     slot time); the 0096 check "an active list has a weekday" keeps holding. Dropped after C23 ships.
--
-- INVARIANTS:
--   * Isolation (0096): every new child row that points at a post, tag or media item carries organization_id and points
--     by (id, organization_id). A tag, comment media, rule post or report account of another brand is refused.
--   * Comments are post content (0098): once any target is queued or published, social_save_post refuses a change to
--     them (SC409); once published_at is set no comment row may be inserted, edited or removed (0096 children guard).
--     Tags are labels, not content: no freeze.
--   * Repeat series ("週期性安排"): the template post is the first occurrence and holds repeat; each later occurrence is
--     an ordinary scheduled child post with repeat_of = template and origin_slot = its slot. Both are set when the child
--     is made and never changed (C22 hides a computed occurrence that has its child by that pair), and (repeat_of,
--     origin_slot) is unique over every state, so a slot whose child a person edited, moved or deleted is never made
--     again. A child is never itself a template.
--   * A series makes children only while its template is scheduled, queued, published or error -- or deleted after it
--     went out (published_at set). A draft or review template makes none (nothing unapproved goes on the schedule,
--     0102), and deleting the template before it went out stops the series.
--   * The series follows its template: an UNTOUCHED child -- state scheduled and version 1 (0096 social_touch_row bumps
--     version on every update, so version 1 = nobody edited, moved or claimed it since it was made) -- is withdrawn in
--     the same transaction as every save (social_save_post) and state change (social_set_state) of its template; the
--     app then makes them again from the saved template (lib/social/repeat.ts refreshRepeat; same slots, new content).
--     A child a person changed, or the sender claimed, is an ordinary post from then on; one already due stays (made
--     again its slot would be past). A child (and a materialised rotation post) is a snapshot of its template (item):
--     content, targets, media, comments, tags and its own auto-reply rules. A post's own rule is its child too: saving
--     or deleting one touches the post (version) and takes back a template's untouched children.
--   * Smart link slugs: lower-case ASCII letters, digits and '-', unique across all brands, never go / admin / api / new
--     (operator 2026-10-17: social.aware-wave.com/smartlink/<slug>).
--   * Every new table: RLS on, service_role only (0094/0096 pattern); the app authorises per brand on the server.
--     Every change to tags, auto-reply rules, smart links and reports writes its social_audit_log row in the same
--     transaction (actions tag / auto_rule / smart_link / report, detail.op says what).
--
-- APPLY WITH (High: production schema; operator go-ahead first): node scripts/apply-db-migration.mjs 0105
-- DOWN: packages/db/migrations/0105_social_v16.down.sql
-- LOCAL PROOF: bash packages/db/scripts/0105_social_v16-local-verify.sh   (postgres 15.8 = production)

begin;
set local lock_timeout = '5s';
-- the comment backfill would queue deferred FK checks, and ALTER TABLE on a table with pending trigger events fails
set constraints all immediate;
-- every lock this file needs, strongest first and in one go: no upgrade mid-file for a running save or sender to
-- deadlock against (db-expert 2026-10-17)
lock table public.social_posts, public.social_accounts, public.social_post_targets, public.social_lists, public.social_media
  in access exclusive mode;

-- ---- 1, 10: channel picture, handle, Chatwoot inbox ---------------------------------------------------------------
alter table public.social_accounts add column if not exists picture text check (length(picture) <= 2048);
alter table public.social_accounts add column if not exists handle text check (length(handle) <= 200);
alter table public.social_accounts add column if not exists chatwoot_inbox_id integer check (chatwoot_inbox_id > 0);

-- ---- 2: tags (colour = a token key; the page maps a..e to --red / --accent / --green / --yellow / --p-li) ----------
create table if not exists public.social_tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 40),
  colour          text not null default 'a' check (colour in ('a', 'b', 'c', 'd', 'e')),
  created_at      timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index if not exists social_tags_name_idx on public.social_tags (organization_id, lower(btrim(name)));

create table if not exists public.social_post_tags (
  post_id         uuid not null,
  tag_id          uuid not null,
  organization_id uuid not null,
  primary key (post_id, tag_id),
  foreign key (post_id, organization_id) references public.social_posts (id, organization_id) on delete cascade,
  foreign key (tag_id, organization_id) references public.social_tags (id, organization_id) on delete cascade
);
create index if not exists social_post_tags_tag_idx on public.social_post_tags (tag_id);

-- ---- 3: N comments (position 0 = the old first_comment) -----------------------------------------------------------
create table if not exists public.social_post_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  post_id         uuid not null,
  position        smallint not null check (position between 0 and 49),
  body            text not null default '' check (length(body) <= 10000),
  delay_minutes   integer not null default 0 check (delay_minutes in (0, 1, 5, 60)),
  media_id        uuid,
  unique (post_id, position),
  check (length(btrim(body)) > 0 or media_id is not null),
  foreign key (post_id, organization_id) references public.social_posts (id, organization_id) on delete cascade,
  foreign key (media_id, organization_id) references public.social_media (id, organization_id)
    on delete no action deferrable initially deferred
);
create index if not exists social_post_comments_media_idx on public.social_post_comments (media_id) where media_id is not null;

-- before the guard trigger below: a published post's first comment is copied too. Re-run: posts that have comments are
-- skipped before the insert (the guard fires before ON CONFLICT would).
insert into public.social_post_comments (organization_id, post_id, position, body)
select p.organization_id, p.id, 0, p.first_comment
from public.social_posts p
where btrim(coalesce(p.first_comment, '')) <> ''
  and not exists (select 1 from public.social_post_comments c where c.post_id = p.id);

drop trigger if exists social_post_comments_guard on public.social_post_comments;
create trigger social_post_comments_guard before insert or update or delete on public.social_post_comments
  for each row execute function public.social_children_guard();

-- a post's comments as the save functions compare them (order = position)
create or replace function public.social_comments_json(p_post uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('body', c.body, 'delay_minutes', c.delay_minutes, 'media_id', c.media_id)
                            order by c.position), '[]'::jsonb)
  from public.social_post_comments c where c.post_id = p_post
$$;

-- ---- 4: repeat series ---------------------------------------------------------------------------------------------
-- {freq: day|week|month, days: [1..7] (1 = Monday, week needs one), mday: 1..31 (month needs it), end: never|count,
--  count: 1..1000 (end=count needs it)}; no other keys
create or replace function public.social_repeat_ok(r jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  -- coalesce: a missing key makes a term NULL, and a CHECK accepts NULL
  select r is null or coalesce((
        jsonb_typeof(r) = 'object'
    and not exists (select 1 from jsonb_object_keys(r) k where k not in ('freq', 'days', 'mday', 'end', 'count'))
    and coalesce(r->>'freq', '') in ('day', 'week', 'month')
    and coalesce(r->>'end', '') in ('never', 'count')
    and (r->'days' is null or jsonb_typeof(r->'days') = 'null' or (jsonb_typeof(r->'days') = 'array'
         and jsonb_array_length(r->'days') <= 7
         and not exists (select 1 from jsonb_array_elements(r->'days') d where d::text !~ '^[1-7]$')))
    and (r->>'freq' <> 'week' or (jsonb_typeof(r->'days') = 'array' and jsonb_array_length(r->'days') > 0))
    and (r->'mday' is null or jsonb_typeof(r->'mday') = 'null' or (r->'mday')::text ~ '^([1-9]|[12][0-9]|3[01])$')
    and (r->>'freq' <> 'month' or (r->'mday')::text ~ '^([1-9]|[12][0-9]|3[01])$')
    and (r->'count' is null or jsonb_typeof(r->'count') = 'null' or (r->'count')::text ~ '^[1-9][0-9]{0,2}$|^1000$')
    and (r->>'end' <> 'count' or (r->'count')::text ~ '^[1-9][0-9]{0,2}$|^1000$')), false)
$$;

alter table public.social_posts add column if not exists repeat jsonb;
alter table public.social_posts add column if not exists repeat_of uuid;
alter table public.social_posts add column if not exists auto_mode text not null default 'brand';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_posts_repeat_shape') then
    alter table public.social_posts add constraint social_posts_repeat_shape check (public.social_repeat_ok(repeat));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_posts_repeat_child') then
    -- a child is not a template, carries its slot, and a rotation item has no series
    alter table public.social_posts add constraint social_posts_repeat_child check (
      (repeat_of is null or (repeat is null and origin_slot is not null)) and (repeat is null or state <> 'rotation'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_posts_repeat_of_fk') then
    alter table public.social_posts add constraint social_posts_repeat_of_fk
      foreign key (repeat_of, organization_id) references public.social_posts (id, organization_id) on delete set null (repeat_of);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_posts_auto_mode_check') then
    alter table public.social_posts add constraint social_posts_auto_mode_check check (auto_mode in ('brand', 'none', 'own'));
  end if;
end $$;
create unique index if not exists social_posts_repeat_slot_idx on public.social_posts (repeat_of, origin_slot) where repeat_of is not null;
create index if not exists social_posts_repeat_idx on public.social_posts (organization_id) where repeat is not null;

-- withdraw a template's untouched children (callers hold the template row); returns how many
create or replace function public.social_withdraw_repeat(p_org uuid, p_template uuid, p_reason text, p_actor text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  with gone as (
    delete from public.social_posts c
    -- a due one the sender has not claimed yet stays: made again, its slot would be past and skipped
    where c.repeat_of = p_template and c.organization_id = p_org and c.state = 'scheduled' and c.version = 1
      and c.scheduled_at > now()
    returning c.id
  )
  select count(*) into v_n from gone;
  if v_n > 0 then
    insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
    values (p_org, p_actor, 'repeat_withdraw', p_template, jsonb_build_object('posts', v_n, 'reason', p_reason));
  end if;
  return v_n;
end $$;

-- make the given slots (the app computes them in the brand's zone, lib/social/repeat-rule.ts) of an eligible template
-- into children; p_withdraw first takes back the untouched ones. Returns how many children were made.
create or replace function public.social_repeat_materialize(p_org uuid, p_template uuid, p_slots timestamptz[], p_withdraw boolean,
  p_actor text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_t public.social_posts%rowtype;
  v_slot timestamptz;
  v_new uuid;
  v_done integer := 0;
begin
  select * into v_t from public.social_posts where id = p_template and organization_id = p_org for no key update;
  if not found then
    return 0;
  end if;
  if p_withdraw then
    perform public.social_withdraw_repeat(p_org, p_template, 'refresh', p_actor);
  end if;
  if v_t.repeat is null or v_t.repeat_of is not null or v_t.scheduled_at is null
     or not (v_t.state in ('scheduled', 'queued', 'published', 'error') or (v_t.state = 'deleted' and v_t.published_at is not null))
     or not exists (select 1 from public.social_post_targets where post_id = p_template) then
    return 0;
  end if;
  foreach v_slot in array coalesce(p_slots, '{}') loop
    continue when v_slot <= now() or v_slot <= v_t.scheduled_at;
    insert into public.social_posts (organization_id, state, body, scheduled_at, repeat_of, origin_slot, first_comment, link_url,
                                     link_utm, notes, source_url, auto_mode, created_by)
    values (p_org, 'scheduled', v_t.body, v_slot, p_template, v_slot, v_t.first_comment, v_t.link_url,
            v_t.link_utm, v_t.notes, v_t.source_url, v_t.auto_mode, p_actor)
    on conflict do nothing   -- the slot has its child already (social_posts_repeat_slot_idx)
    returning id into v_new;
    if v_new is not null then
      insert into public.social_post_targets (organization_id, post_id, account_id, custom_body, format)
      select p_org, v_new, t.account_id, t.custom_body, t.format from public.social_post_targets t where t.post_id = p_template;
      insert into public.social_post_media (organization_id, post_id, media_id, position, alt_text)
      select p_org, v_new, m.media_id, m.position, m.alt_text from public.social_post_media m where m.post_id = p_template;
      insert into public.social_post_comments (organization_id, post_id, position, body, delay_minutes, media_id)
      select p_org, v_new, c.position, c.body, c.delay_minutes, c.media_id from public.social_post_comments c where c.post_id = p_template;
      insert into public.social_post_tags (post_id, tag_id, organization_id)
      select v_new, g.tag_id, p_org from public.social_post_tags g where g.post_id = p_template;
      insert into public.social_auto_rules (organization_id, post_id, name, trigger, keywords, platforms, action, reply, active)
      select p_org, v_new, r.name, r.trigger, r.keywords, r.platforms, r.action, r.reply, r.active
      from public.social_auto_rules r where r.post_id = p_template;
      insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
      values (p_org, p_actor, 'repeat_post', v_new, jsonb_build_object('template', p_template, 'scheduled_at', v_slot));
      v_done := v_done + 1;
    end if;
    v_new := null;
  end loop;
  return v_done;
end $$;

-- "全部" on a series: the rule goes (also on a template already sent: repeat is not frozen content) and the untouched
-- children with it; the template itself and the children people changed stay as they are
create or replace function public.social_stop_repeat(p_org uuid, p_template uuid, p_expected_version integer, p_actor text)
returns table (saved_post_id uuid, saved_version integer, withdrawn integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_version integer;
  v_n integer;
  v_state text;
begin
  -- 0100: a queued post changes only through social_release_post (a version bump here would orphan a send in flight)
  select state into v_state from public.social_posts where id = p_template and organization_id = p_org for no key update;
  if v_state = 'queued' then
    raise exception 'social post % is being sent; stop its series after it went out', p_template using errcode = 'SC409';
  end if;
  update public.social_posts s set repeat = null
  where s.id = p_template and s.organization_id = p_org and s.version = p_expected_version
  returning s.id, s.version into v_id, v_version;
  if v_id is null then
    if exists (select 1 from public.social_posts where id = p_template and organization_id = p_org) then
      raise exception 'social post % changed since version %', p_template, p_expected_version using errcode = 'SC409';
    end if;
    raise exception 'no social post % in this brand', p_template using errcode = 'SC404';
  end if;
  v_n := public.social_withdraw_repeat(p_org, v_id, 'stopped', p_actor);
  insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
  values (p_org, p_actor, 'repeat_stop', v_id, jsonb_build_object('withdrawn', v_n));
  return query select v_id, v_version, v_n;
end $$;

-- ---- 5: rotation list slots (weekday x time grid) -----------------------------------------------------------------
create table if not exists public.social_list_slots (
  list_id   uuid not null references public.social_lists(id) on delete cascade,
  weekday   smallint not null check (weekday between 1 and 7),
  send_time time not null,
  primary key (list_id, weekday, send_time)
);
insert into public.social_list_slots (list_id, weekday, send_time)
select l.id, w, l.send_time from public.social_lists l, unnest(l.weekdays) w
where not exists (select 1 from public.social_list_slots s where s.list_id = l.id)   -- re-run: a saved grid is not widened
on conflict do nothing;

-- ---- 6: auto-reply rules (post_id null = the brand's; set = that post's own, which wins) ---------------------------
create table if not exists public.social_auto_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  post_id         uuid,
  name            text not null default '' check (length(name) <= 80),
  trigger         text not null check (trigger in ('comment', 'dm')),
  keywords        text[] not null default '{}' check (cardinality(keywords) <= 50 and length(array_to_string(keywords, ',')) <= 2000),
  platforms       text[] not null check (cardinality(platforms) > 0 and platforms <@ array['facebook', 'instagram']::text[]),
  action          text not null check (action in ('reply', 'dm', 'both')),
  reply           text not null default '' check (length(reply) <= 2000),
  active          boolean not null default true,
  hits            integer not null default 0 check (hits >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (post_id, organization_id) references public.social_posts (id, organization_id) on delete cascade
);
create index if not exists social_auto_rules_brand_idx on public.social_auto_rules (organization_id) where post_id is null;
create index if not exists social_auto_rules_post_idx on public.social_auto_rules (post_id) where post_id is not null;

-- ---- 7: smart link page --------------------------------------------------------------------------------------------
create table if not exists public.social_smart_links (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$' and slug not in ('go', 'admin', 'api', 'new')),
  title           text not null default '' check (length(title) <= 120),
  bio             text not null default '' check (length(bio) <= 300),
  colour          text not null default 'a' check (colour in ('a', 'b', 'c', 'd', 'e')),
  published       boolean not null default false,
  updated_at      timestamptz not null default now()
);
create table if not exists public.social_smart_link_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.social_smart_links(organization_id) on delete cascade,
  position        smallint not null default 0 check (position >= 0),
  title           text not null check (length(btrim(title)) between 1 and 80),
  url             text not null check (url ~ '^https?://' and length(url) <= 2048),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists social_smart_link_items_org_idx on public.social_smart_link_items (organization_id, position);
create table if not exists public.social_smart_link_clicks (
  item_id uuid not null references public.social_smart_link_items(id) on delete cascade,
  day     date not null,
  n       integer not null default 0 check (n >= 0),
  primary key (item_id, day)
);

-- ---- 8: daily metrics snapshots (null = the platform did not give it; never a made-up 0) -------------------------
create table if not exists public.social_metrics_daily (
  account_id  uuid not null references public.social_accounts(id) on delete cascade,
  day         date not null,
  followers   integer check (followers >= 0),
  reach       integer check (reach >= 0),
  impressions integer check (impressions >= 0),
  engagement  integer check (engagement >= 0),
  posts       integer check (posts >= 0),
  primary key (account_id, day)
);
create table if not exists public.social_post_metrics (
  target_id  uuid primary key references public.social_post_targets(id) on delete cascade,
  reach      integer check (reach >= 0),
  engagement integer check (engagement >= 0),
  fetched_at timestamptz not null default now()
);

-- ---- 9: reports (PDF only in V1, operator 2026-10-17; colour = the mock's swatch, a token key) --------------------
create table if not exists public.social_reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  period_from     date not null,
  period_to       date not null,
  format          text not null default 'pdf' check (format in ('pdf')),
  colour          text not null default 'a' check (colour in ('a', 'b', 'c', 'd', 'e')),
  account_ids     uuid[] not null default '{}' check (cardinality(account_ids) <= 100),
  sections        text[] not null default '{}' check (cardinality(sections) <= 20),
  created_at      timestamptz not null default now(),
  created_by      text not null check (length(created_by) <= 320),
  check (period_from <= period_to)
);
create index if not exists social_reports_org_idx on public.social_reports (organization_id, created_at desc);

drop trigger if exists social_auto_rules_touch on public.social_auto_rules;
create trigger social_auto_rules_touch before update on public.social_auto_rules for each row execute function public.social_touch_row();
drop trigger if exists social_smart_links_touch on public.social_smart_links;
create trigger social_smart_links_touch before update on public.social_smart_links for each row execute function public.social_touch_row();

-- ---- writes: posts ------------------------------------------------------------------------------------------------
-- 0101's social_save_post plus: p_comments (null = unchanged; replaces the set, first_comment follows position 0) or,
-- from a caller that only knows first_comment, position 0 follows it; p_tags (null = unchanged); fields repeat and
-- auto_mode; the template's untouched children are withdrawn (header).
drop function if exists public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text);
create or replace function public.social_save_post(
  p_org uuid, p_post_id uuid, p_expected_version integer, p_post jsonb, p_targets jsonb, p_media jsonb, p_actor text,
  p_comments jsonb default null, p_tags uuid[] default null)
returns table (saved_post_id uuid, saved_version integer)  -- not post_id: it would shadow the children's column
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_version integer;
  v_action text;
  v_old public.social_posts%rowtype;
  v_cur jsonb := '[]'::jsonb;
  v_comments jsonb;
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
  if p_comments is not null and jsonb_typeof(p_comments) <> 'array' then
    raise exception 'comments must be an array' using errcode = '22023';
  end if;
  if p_post_id is not null then
    -- the row lock first (0098 lock order; the lock the UPDATE below takes anyway), so the checks cannot race the sender
    select * into v_old from public.social_posts where id = p_post_id and organization_id = p_org for no key update;
    if found then
      v_cur := public.social_comments_json(p_post_id);
    end if;
  end if;
  -- 0105: the comment set this save leaves (null = unchanged), normalised like social_comments_json
  if p_comments is not null then
    select coalesce(jsonb_agg(jsonb_build_object('body', coalesce(n->>'body', ''), 'delay_minutes', coalesce((n->>'delay_minutes')::integer, 0),
                                                 'media_id', (nullif(n->>'media_id', ''))::uuid) order by o), '[]'::jsonb)
    into v_comments from jsonb_array_elements(p_comments) with ordinality e(n, o);
  elsif p_post ? 'first_comment' then
    if btrim(coalesce(p_post->>'first_comment', '')) = '' then
      v_comments := case when jsonb_array_length(v_cur) > 0 and v_cur->0->>'media_id' is not null then jsonb_set(v_cur, '{0,body}', '""')
                         else v_cur - 0 end;
    elsif jsonb_array_length(v_cur) > 0 then
      v_comments := jsonb_set(v_cur, '{0,body}', to_jsonb(p_post->>'first_comment'));
    else
      v_comments := jsonb_build_array(jsonb_build_object('body', p_post->>'first_comment', 'delay_minutes', 0, 'media_id', null));
    end if;
  end if;
  if p_post_id is not null then
    if v_old.id is not null and exists (select 1 from public.social_post_targets t where t.post_id = p_post_id and t.state in ('queued', 'published'))
       and ((p_post ? 'body' and coalesce(p_post->>'body', '') is distinct from v_old.body)
         or (p_post ? 'first_comment' and p_post->>'first_comment' is distinct from v_old.first_comment)
         or (v_comments is not null and v_comments is distinct from v_cur)
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
    insert into public.social_posts (organization_id, body, first_comment, link_url, link_utm, notes, source_url, repeat, auto_mode, created_by)
    values (p_org, coalesce(p_post->>'body', ''),
            case when btrim(coalesce(v_comments->0->>'body', '')) = '' then null else v_comments->0->>'body' end,
            p_post->>'link_url', coalesce((p_post->>'link_utm')::boolean, false), p_post->>'notes', p_post->>'source_url',
            nullif(p_post->'repeat', 'null'::jsonb), coalesce(p_post->>'auto_mode', 'brand'), p_actor)
    returning id into v_id;
    v_action := 'create';
  else
    -- every save updates the row, so version goes up once and covers the children changed below
    update public.social_posts s set
      body          = case when p_post ? 'body' then coalesce(p_post->>'body', '') else s.body end,
      first_comment = case when v_comments is null then s.first_comment
                           when btrim(coalesce(v_comments->0->>'body', '')) = '' then null else v_comments->0->>'body' end,
      link_url      = case when p_post ? 'link_url' then p_post->>'link_url' else s.link_url end,
      link_utm      = case when p_post ? 'link_utm' then coalesce((p_post->>'link_utm')::boolean, false) else s.link_utm end,
      notes         = case when p_post ? 'notes' then p_post->>'notes' else s.notes end,
      source_url    = case when p_post ? 'source_url' then p_post->>'source_url' else s.source_url end,
      repeat        = case when p_post ? 'repeat' then nullif(p_post->'repeat', 'null'::jsonb) else s.repeat end,
      auto_mode     = case when p_post ? 'auto_mode' then coalesce(p_post->>'auto_mode', 'brand') else s.auto_mode end,
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
  -- 0105: comments are replaced as a set, and only when they changed (a published post's rows may not be touched)
  if v_comments is not null and v_comments is distinct from v_cur then
    delete from public.social_post_comments c where c.post_id = v_id;
    insert into public.social_post_comments (organization_id, post_id, position, body, delay_minutes, media_id)
    select p_org, v_id, (o - 1)::smallint, n->>'body', (n->>'delay_minutes')::integer, (n->>'media_id')::uuid
    from jsonb_array_elements(v_comments) with ordinality e(n, o);
  end if;
  if p_tags is not null then
    delete from public.social_post_tags g where g.post_id = v_id and g.tag_id <> all (p_tags);
    insert into public.social_post_tags (post_id, tag_id, organization_id)
    select distinct v_id, t, p_org from unnest(p_tags) t
    on conflict do nothing;
  end if;
  -- 0105: a template's untouched children follow it (header); the app makes them again from the saved template
  if p_post_id is not null then
    perform public.social_withdraw_repeat(p_org, v_id, 'template_saved', p_actor);
  end if;

  select version into v_version from public.social_posts where id = v_id;
  insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
  values (p_org, p_actor, v_action, v_id, jsonb_build_object(
    'fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_post) k),
    'targets', case when p_targets is null then null else jsonb_array_length(p_targets) end,
    'media', case when p_media is null then null else jsonb_array_length(p_media) end,
    'comments', case when p_comments is null then null else jsonb_array_length(p_comments) end,
    'tags', case when p_tags is null then null else cardinality(p_tags) end));
  return query select v_id, v_version;
end $$;

-- 0098's social_set_state plus the template rule (header): a person's state change of a template withdraws its
-- untouched children in the same transaction
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
  perform public.social_withdraw_repeat(p_org, v_id, 'template_' || coalesce(p_action, 'state'), p_actor);   -- 0105
  return query select v_id, v_version;
end $$;

-- 0101's social_materialize_list plus the item's comments, tags and auto_mode on each materialised post
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
                                     link_url, link_utm, source_url, auto_mode, created_by)
    values (v_list.organization_id, 'scheduled', v_item.body, v_slot, p_list, p_list, v_slot, v_item.first_comment,
            v_item.link_url, v_item.link_utm, v_item.source_url, v_item.auto_mode, p_actor)
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
      insert into public.social_post_comments (organization_id, post_id, position, body, delay_minutes, media_id)
      select v_list.organization_id, v_new, c.position, c.body, c.delay_minutes, c.media_id
      from public.social_post_comments c where c.post_id = v_item.id;
      insert into public.social_post_tags (post_id, tag_id, organization_id)
      select v_new, g.tag_id, v_list.organization_id from public.social_post_tags g where g.post_id = v_item.id;
      insert into public.social_auto_rules (organization_id, post_id, name, trigger, keywords, platforms, action, reply, active)
      select v_list.organization_id, v_new, r.name, r.trigger, r.keywords, r.platforms, r.action, r.reply, r.active
      from public.social_auto_rules r where r.post_id = v_item.id;
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

-- 0101's social_save_list plus p_slots ([{weekday, send_time}]; null = p_weekdays x p_send_time, the old callers);
-- weekdays / send_time follow the slots (header)
drop function if exists public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[], text);
create or replace function public.social_save_list(
  p_org uuid, p_list_id uuid, p_name text, p_weekdays smallint[], p_send_time time, p_active boolean, p_account_ids uuid[], p_actor text,
  p_slots jsonb default null)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_slots jsonb;
  v_weekdays smallint[];
  v_time time;
begin
  p_account_ids := coalesce(p_account_ids, '{}');
  if p_slots is null then
    select coalesce(jsonb_agg(jsonb_build_object('weekday', w, 'send_time', coalesce(p_send_time, '10:00')::text)), '[]'::jsonb)
    into v_slots from unnest(coalesce(p_weekdays, '{}')) w;
  elsif jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be an array' using errcode = '22023';
  else
    v_slots := p_slots;
  end if;
  v_weekdays := array(select distinct (n->>'weekday')::smallint from jsonb_array_elements(v_slots) n order by 1);
  v_time := coalesce((select min((n->>'send_time')::time) from jsonb_array_elements(v_slots) n), p_send_time, '10:00');
  if p_list_id is null then
    insert into public.social_lists (organization_id, name, weekdays, send_time, active)
    values (p_org, p_name, v_weekdays, v_time, p_active) returning id into v_id;
  else
    update public.social_lists set name = p_name, weekdays = v_weekdays, send_time = v_time, active = p_active
    where id = p_list_id and organization_id = p_org returning id into v_id;
    if v_id is null then
      raise exception 'no social list % in this brand', p_list_id using errcode = 'SC404';
    end if;
  end if;
  delete from public.social_list_slots s where s.list_id = v_id
    and not exists (select 1 from jsonb_array_elements(v_slots) n
                    where (n->>'weekday')::smallint = s.weekday and (n->>'send_time')::time = s.send_time);
  insert into public.social_list_slots (list_id, weekday, send_time)
  select v_id, (n->>'weekday')::smallint, (n->>'send_time')::time from jsonb_array_elements(v_slots) n
  on conflict do nothing;
  delete from public.social_list_accounts la where la.list_id = v_id and la.account_id <> all (p_account_ids);
  insert into public.social_list_accounts (list_id, account_id, organization_id)
  select v_id, a, p_org from unnest(p_account_ids) a
  on conflict (list_id, account_id) do nothing;
  -- 0101: the schedule follows the list -- every save (pause included) takes back what was materialised and not yet
  -- sent; the caller materialises again from the saved list (lib/social/rotation.ts)
  perform public.social_withdraw_list(p_org, v_id, 'list_saved', p_actor);
  -- 0101 (plan C11): every list change is in the brand's log
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'list_save', jsonb_build_object('list_id', v_id, 'name', p_name, 'active', p_active, 'weekdays', v_weekdays,
                                                          'slots', jsonb_array_length(v_slots)));
  return v_id;
end $$;

-- ---- writes: tags, rules, smart link, reports (each with its log row) ---------------------------------------------
create or replace function public.social_save_tag(p_org uuid, p_tag_id uuid, p_name text, p_colour text, p_actor text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_tag_id is null then
    insert into public.social_tags (organization_id, name, colour) values (p_org, btrim(p_name), coalesce(p_colour, 'a')) returning id into v_id;
  else
    update public.social_tags set name = btrim(p_name), colour = coalesce(p_colour, colour)
    where id = p_tag_id and organization_id = p_org returning id into v_id;
    if v_id is null then
      raise exception 'no social tag % in this brand', p_tag_id using errcode = 'SC404';
    end if;
  end if;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'tag', jsonb_build_object('op', case when p_tag_id is null then 'create' else 'edit' end,
                                                    'tag_id', v_id, 'name', btrim(p_name), 'colour', p_colour));
  return v_id;
end $$;

create or replace function public.social_delete_tag(p_org uuid, p_tag_id uuid, p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  delete from public.social_tags where id = p_tag_id and organization_id = p_org returning name into v_name;
  if v_name is null then
    raise exception 'no social tag % in this brand', p_tag_id using errcode = 'SC404';
  end if;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'tag', jsonb_build_object('op', 'delete', 'tag_id', p_tag_id, 'name', v_name));
end $$;

-- a post's own rules are its children (0096: a child edit touches the parent, so version covers it -- an untouched repeat
-- child that got a rule is no longer withdrawn with its template, db-expert 2026-10-17); a template's untouched children
-- carry a copy of its rules, so they are taken back here and the app makes them again (store.ts materializeSeries)
create or replace function public.social_touch_post_rules(p_org uuid, p_post uuid, p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_post is null then
    return;
  end if;
  update public.social_posts set updated_at = now() where id = p_post and organization_id = p_org;
  perform public.social_withdraw_repeat(p_org, p_post, 'template_rule', p_actor);
end $$;

-- p_rule: {post_id?, name, trigger, keywords: [text], platforms: [text], action, reply, active}
create or replace function public.social_save_auto_rule(p_org uuid, p_rule_id uuid, p_rule jsonb, p_actor text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_post uuid;
  v_keywords text[];
  v_platforms text[];
begin
  if jsonb_typeof(p_rule) is distinct from 'object' then
    raise exception 'rule must be an object' using errcode = '22023';
  end if;
  v_keywords := array(select btrim(k) from jsonb_array_elements_text(coalesce(p_rule->'keywords', '[]')) k where btrim(k) <> '');
  v_platforms := array(select distinct p from jsonb_array_elements_text(coalesce(p_rule->'platforms', '[]')) p order by 1);
  -- the post row first (0098 lock order), then the rule
  v_post := case when p_rule_id is null then (p_rule->>'post_id')::uuid
                 else (select post_id from public.social_auto_rules where id = p_rule_id and organization_id = p_org) end;
  perform public.social_touch_post_rules(p_org, v_post, p_actor);
  if p_rule_id is null then
    insert into public.social_auto_rules (organization_id, post_id, name, trigger, keywords, platforms, action, reply, active)
    values (p_org, (p_rule->>'post_id')::uuid, coalesce(p_rule->>'name', ''), p_rule->>'trigger', v_keywords, v_platforms,
            p_rule->>'action', coalesce(p_rule->>'reply', ''), coalesce((p_rule->>'active')::boolean, true))
    returning id into v_id;
  else
    -- post_id stays what it was: a post's own rule does not become the brand's, or another post's
    update public.social_auto_rules set name = coalesce(p_rule->>'name', ''), trigger = p_rule->>'trigger', keywords = v_keywords,
      platforms = v_platforms, action = p_rule->>'action', reply = coalesce(p_rule->>'reply', ''),
      active = coalesce((p_rule->>'active')::boolean, true)
    where id = p_rule_id and organization_id = p_org returning id into v_id;
    if v_id is null then
      raise exception 'no auto-reply rule % in this brand', p_rule_id using errcode = 'SC404';
    end if;
  end if;
  insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
  values (p_org, p_actor, 'auto_rule', v_post,
          jsonb_build_object('op', case when p_rule_id is null then 'create' else 'edit' end, 'rule_id', v_id,
                             'name', p_rule->>'name', 'active', coalesce((p_rule->>'active')::boolean, true)));
  return v_id;
end $$;

create or replace function public.social_delete_auto_rule(p_org uuid, p_rule_id uuid, p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_post uuid;
begin
  select post_id into v_post from public.social_auto_rules where id = p_rule_id and organization_id = p_org;
  perform public.social_touch_post_rules(p_org, v_post, p_actor);   -- the post row first (0098 lock order)
  delete from public.social_auto_rules where id = p_rule_id and organization_id = p_org returning name into v_name;
  if v_name is null then
    raise exception 'no auto-reply rule % in this brand', p_rule_id using errcode = 'SC404';
  end if;
  insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
  values (p_org, p_actor, 'auto_rule', v_post, jsonb_build_object('op', 'delete', 'rule_id', p_rule_id, 'name', v_name));
end $$;

-- the executor (C27) counts a reply it sent; null = the rule is gone or off
create or replace function public.social_auto_rule_hit(p_org uuid, p_rule_id uuid, p_actor text, p_detail jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hits integer;
  v_post uuid;
begin
  update public.social_auto_rules set hits = hits + 1
  where id = p_rule_id and organization_id = p_org and active returning hits, post_id into v_hits, v_post;
  if v_hits is not null then
    insert into public.social_audit_log (organization_id, actor, action, post_id, detail)
    values (p_org, p_actor, 'auto_rule', v_post, coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('op', 'hit', 'rule_id', p_rule_id));
  end if;
  return v_hits;
end $$;

-- p_link: {slug, title, bio, colour, published}; p_items (null = unchanged): [{id?, title, url, active}] in page order,
-- an item left out is removed, one without id is new
create or replace function public.social_save_smart_link(p_org uuid, p_link jsonb, p_items jsonb, p_actor text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_slug text;
begin
  if jsonb_typeof(p_link) is distinct from 'object' or (p_items is not null and jsonb_typeof(p_items) <> 'array') then
    raise exception 'link must be an object and items an array' using errcode = '22023';
  end if;
  insert into public.social_smart_links (organization_id, slug, title, bio, colour, published)
  values (p_org, p_link->>'slug', coalesce(p_link->>'title', ''), coalesce(p_link->>'bio', ''), coalesce(p_link->>'colour', 'a'),
          coalesce((p_link->>'published')::boolean, false))
  on conflict (organization_id) do update set slug = excluded.slug, title = excluded.title, bio = excluded.bio,
    colour = excluded.colour, published = excluded.published
  returning slug into v_slug;
  if p_items is not null then
    if exists (select 1 from jsonb_array_elements(p_items) n where n ? 'id' and not exists (
                 select 1 from public.social_smart_link_items i where i.id = (n->>'id')::uuid and i.organization_id = p_org)) then
      raise exception 'a smart link item is not this brand''s' using errcode = 'SC404';
    end if;
    delete from public.social_smart_link_items i where i.organization_id = p_org
      and not exists (select 1 from jsonb_array_elements(p_items) n where (n->>'id')::uuid = i.id);
    update public.social_smart_link_items i set position = (o - 1)::smallint, title = n->>'title', url = n->>'url',
      active = coalesce((n->>'active')::boolean, true)
    from jsonb_array_elements(p_items) with ordinality e(n, o)
    where n ? 'id' and i.id = (n->>'id')::uuid and i.organization_id = p_org;
    insert into public.social_smart_link_items (organization_id, position, title, url, active)
    select p_org, (o - 1)::smallint, n->>'title', n->>'url', coalesce((n->>'active')::boolean, true)
    from jsonb_array_elements(p_items) with ordinality e(n, o) where not n ? 'id';
  end if;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'smart_link', jsonb_build_object('op', 'save', 'slug', v_slug, 'published', coalesce((p_link->>'published')::boolean, false),
                                                           'items', case when p_items is null then null else jsonb_array_length(p_items) end));
  return v_slug;
end $$;

-- the public page's click (C26 /smartlink/<slug>/go/<item>): counts it on the brand's own calendar day and returns
-- where to send the visitor; null = no such published page, or the item is off or not on it
create or replace function public.social_smart_link_click(p_slug text, p_item uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_tz text;
begin
  select i.url, o.default_timezone into v_url, v_tz
  from public.social_smart_links l
  join public.social_smart_link_items i on i.organization_id = l.organization_id and i.id = p_item and i.active
  join public.organizations o on o.id = l.organization_id
  where l.slug = p_slug and l.published;
  if v_url is null then
    return null;
  end if;
  insert into public.social_smart_link_clicks (item_id, day, n) values (p_item, (now() at time zone coalesce(v_tz, 'UTC'))::date, 1)
  on conflict (item_id, day) do update set n = social_smart_link_clicks.n + 1;
  return v_url;
end $$;

-- p_report: {name, period_from, period_to, format?, colour?, account_ids: [uuid], sections: [text]}
create or replace function public.social_create_report(p_org uuid, p_report jsonb, p_actor text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_accounts uuid[];
begin
  if jsonb_typeof(p_report) is distinct from 'object' then
    raise exception 'report must be an object' using errcode = '22023';
  end if;
  v_accounts := array(select distinct (a)::uuid from jsonb_array_elements_text(coalesce(p_report->'account_ids', '[]')) a);
  -- an array cannot carry a foreign key: the brand check is here
  if exists (select 1 from unnest(v_accounts) a where not exists (
               select 1 from public.social_accounts s where s.id = a and s.organization_id = p_org)) then
    raise exception 'an account in the report is not this brand''s' using errcode = 'SC404';
  end if;
  insert into public.social_reports (organization_id, name, period_from, period_to, format, colour, account_ids, sections, created_by)
  values (p_org, btrim(p_report->>'name'), (p_report->>'period_from')::date, (p_report->>'period_to')::date,
          coalesce(p_report->>'format', 'pdf'), coalesce(p_report->>'colour', 'a'), v_accounts,
          array(select s from jsonb_array_elements_text(coalesce(p_report->'sections', '[]')) s), p_actor)
  returning id into v_id;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'report', jsonb_build_object('op', 'create', 'report_id', v_id, 'name', btrim(p_report->>'name')));
  return v_id;
end $$;

create or replace function public.social_delete_report(p_org uuid, p_report_id uuid, p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  delete from public.social_reports where id = p_report_id and organization_id = p_org returning name into v_name;
  if v_name is null then
    raise exception 'no report % in this brand', p_report_id using errcode = 'SC404';
  end if;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'report', jsonb_build_object('op', 'delete', 'report_id', p_report_id, 'name', v_name));
end $$;

-- ---- privileges: service_role only (Supabase's default privileges grant new tables and functions to anon) ---------
do $$
declare
  t text;
begin
  foreach t in array array['social_tags', 'social_post_tags', 'social_post_comments', 'social_list_slots', 'social_auto_rules',
                           'social_smart_links', 'social_smart_link_items', 'social_smart_link_clicks', 'social_metrics_daily',
                           'social_post_metrics', 'social_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role only" on public.%I', t);
    execute format('create policy "service_role only" on public.%I to service_role using (true) with check (true)', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- the writer runs social_repeat_ok (a check constraint runs as the writing role) and social_comments_json
revoke all on function public.social_comments_json(uuid), public.social_repeat_ok(jsonb) from public, anon, authenticated;
grant execute on function public.social_comments_json(uuid), public.social_repeat_ok(jsonb) to service_role;
revoke all on function public.social_touch_post_rules(uuid, uuid, text), public.social_withdraw_repeat(uuid, uuid, text, text),
  public.social_repeat_materialize(uuid, uuid, timestamptz[], boolean, text),
  public.social_stop_repeat(uuid, uuid, integer, text),
  public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text, jsonb, uuid[]),
  public.social_set_state(uuid, uuid, integer, text, timestamptz, uuid, integer, text, text, jsonb),
  public.social_materialize_list(uuid, timestamptz[], text),
  public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[], text, jsonb),
  public.social_save_tag(uuid, uuid, text, text, text), public.social_delete_tag(uuid, uuid, text),
  public.social_save_auto_rule(uuid, uuid, jsonb, text), public.social_delete_auto_rule(uuid, uuid, text),
  public.social_auto_rule_hit(uuid, uuid, text, jsonb),
  public.social_save_smart_link(uuid, jsonb, jsonb, text), public.social_smart_link_click(text, uuid),
  public.social_create_report(uuid, jsonb, text), public.social_delete_report(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.social_touch_post_rules(uuid, uuid, text), public.social_withdraw_repeat(uuid, uuid, text, text),
  public.social_repeat_materialize(uuid, uuid, timestamptz[], boolean, text),
  public.social_stop_repeat(uuid, uuid, integer, text),
  public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text, jsonb, uuid[]),
  public.social_set_state(uuid, uuid, integer, text, timestamptz, uuid, integer, text, text, jsonb),
  public.social_materialize_list(uuid, timestamptz[], text),
  public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[], text, jsonb),
  public.social_save_tag(uuid, uuid, text, text, text), public.social_delete_tag(uuid, uuid, text),
  public.social_save_auto_rule(uuid, uuid, jsonb, text), public.social_delete_auto_rule(uuid, uuid, text),
  public.social_auto_rule_hit(uuid, uuid, text, jsonb),
  public.social_save_smart_link(uuid, jsonb, jsonb, text), public.social_smart_link_click(text, uuid),
  public.social_create_report(uuid, jsonb, text), public.social_delete_report(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
