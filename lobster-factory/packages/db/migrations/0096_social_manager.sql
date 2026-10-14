-- 0096 — social manager (ADR 016, lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C1). The schedule's system of
-- record is here; Postiz only sends. A brand = an organizations row (timezone = organizations.default_timezone).
--
-- INVARIANTS the database keeps (the app cannot forget them):
--   * Isolation: every child row (target, media link, list account) carries organization_id and points at its parent
--     by (id, organization_id), so a post can never target another brand's account or use another brand's media.
--   * One Postiz integration belongs to exactly one brand: unique (postiz_instance, postiz_integration_id).
--     (0011 allowed the same integration under two orgs.) postiz_instance lets a second Postiz host join later.
--   * State shape: scheduled/queued/published need scheduled_at; rotation needs list_id+list_position and no time;
--     published needs published_at and published_at implies published or deleted; deleted needs deleted_at.
--     Transitions themselves live in one place in the app (lib/social/state.ts, plan C4).
--   * Once published_at is set the post's content and its targets/media are frozen (platforms cannot be edited from
--     here): it may only move between published and deleted, and only the sender's write-back columns of a target
--     (state, postiz_post_id, release_url, error) may change. Restoring a deleted published post gives a published
--     post back, never a draft that would be sent twice.
--   * social_audit_log is append-only: no UPDATE (trigger), no UPDATE/DELETE/TRUNCATE for service_role (grant);
--     rows leave only with their brand (FK cascade runs as the table owner).
--   * version goes up on every post update, for compare-and-set by two editors. Child edits (targets, media) must
--     touch the parent post in the same transaction (plan C4) so version covers them.
--   * A brand can be deleted: the restricting child FKs are DEFERRABLE INITIALLY DEFERRED, so the whole cascade
--     settles before they are checked; deleting a lone targeted account or used media still fails at commit.
-- platform stores Postiz's providerIdentifier verbatim (e.g. 'linkedin-page', 'x'); no enum to drift.
--
-- DATA: social_postiz_connections (0011) rows are copied into social_accounts; the old table stays until the code
-- reading it (lib/content/postiz.ts, api/content/social-admin) moves in plan C4. Apply in the same deploy as C4:
-- a connection made through the old route between the two would never reach social_accounts. An integration mapped
-- to two orgs in 0011 aborts the batch for a human call instead of silently dropping one mapping.
-- RLS: on, service_role only (0094 pattern); the app authorises per brand on the server (ADR 016 §3).
--
-- APPLY WITH (Medium, additive; needs go-ahead; ship with plan C4): node scripts/apply-db-migration.mjs 0096
-- DOWN: packages/db/scripts/0096_social_manager_down.sql
-- LOCAL PROOF: bash packages/db/scripts/0096_social_manager-local-verify.sh   (postgres 15.8 = production)

begin;
set local lock_timeout = '5s';

create or replace function public.social_touch_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if tg_table_name = 'social_posts' then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

create table if not exists public.social_accounts (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  postiz_instance       text not null default 'ks-aw-01' check (postiz_instance ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  postiz_integration_id text not null check (length(postiz_integration_id) between 1 and 100),
  platform              text not null check (platform ~ '^[a-z][a-z0-9-]{0,30}$'),
  label                 text not null default '',
  status                text not null default 'connected' check (status in ('connected', 'expired', 'disabled')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (postiz_instance, postiz_integration_id),
  unique (id, organization_id)
);
create index if not exists social_accounts_org_idx on public.social_accounts (organization_id);

create table if not exists public.social_lists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  weekdays        smallint[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  send_time       time not null default '10:00',
  active          boolean not null default false,
  cursor          integer not null default 0 check (cursor >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (not active or cardinality(weekdays) > 0),
  unique (id, organization_id)
);
create index if not exists social_lists_org_idx on public.social_lists (organization_id);

create table if not exists public.social_list_accounts (
  list_id         uuid not null,
  account_id      uuid not null,
  organization_id uuid not null,
  primary key (list_id, account_id),
  foreign key (list_id, organization_id) references public.social_lists (id, organization_id) on delete cascade,
  foreign key (account_id, organization_id) references public.social_accounts (id, organization_id) on delete cascade
);
create index if not exists social_list_accounts_account_idx on public.social_list_accounts (account_id);

create table if not exists public.social_posts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  state           text not null default 'draft'
                  check (state in ('draft', 'review', 'scheduled', 'queued', 'published', 'error', 'rotation', 'deleted')),
  body            text not null default '' check (length(body) <= 100000),
  scheduled_at    timestamptz,
  list_id         uuid,
  list_position   integer check (list_position >= 0),
  first_comment   text check (length(first_comment) <= 10000),
  link_url        text check (link_url is null or (link_url ~ '^https?://' and length(link_url) <= 2048)),
  link_utm        boolean not null default false,
  notes           text check (length(notes) <= 20000),
  source_url      text check (source_url is null or (source_url ~ '^https?://' and length(source_url) <= 2048)),
  published_at    timestamptz,
  deleted_at      timestamptz,
  created_by      text not null,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (list_id, organization_id) references public.social_lists (id, organization_id) on delete set null (list_id),
  check (state not in ('scheduled', 'queued', 'published') or scheduled_at is not null),
  check (state <> 'rotation' or (list_id is not null and list_position is not null and scheduled_at is null)),
  check (list_position is null or list_id is not null),
  check (state <> 'published' or published_at is not null),
  check (published_at is null or state in ('published', 'deleted')),
  check ((state = 'deleted') = (deleted_at is not null)),
  unique (id, organization_id)
);
create index if not exists social_posts_calendar_idx on public.social_posts (organization_id, scheduled_at) where state <> 'deleted';
create index if not exists social_posts_due_idx on public.social_posts (scheduled_at) where state = 'scheduled';
create index if not exists social_posts_queued_idx on public.social_posts (scheduled_at) where state = 'queued';
create index if not exists social_posts_needs_idx on public.social_posts (organization_id) where state in ('error', 'review');
create index if not exists social_posts_trash_idx on public.social_posts (organization_id, deleted_at desc) where state = 'deleted';
create index if not exists social_posts_list_idx on public.social_posts (list_id) where list_id is not null;
create unique index if not exists social_posts_list_order_idx on public.social_posts (list_id, list_position) where state = 'rotation';
-- a rotation run cannot materialise the same list slot twice (plan C7 idempotence)
create unique index if not exists social_posts_list_slot_idx on public.social_posts (list_id, scheduled_at)
  where list_id is not null and scheduled_at is not null and state <> 'deleted';

create table if not exists public.social_post_targets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  post_id         uuid not null,
  account_id      uuid not null,
  custom_body     text check (length(custom_body) <= 100000),
  format          text not null default 'post' check (format ~ '^[a-z][a-z0-9_-]{1,30}$'),
  state           text not null default 'pending' check (state in ('pending', 'queued', 'published', 'error')),
  postiz_post_id  text,
  release_url     text check (release_url is null or release_url ~ '^https?://'),
  error           text check (length(error) <= 4000),
  updated_at      timestamptz not null default now(),
  unique (post_id, account_id),
  foreign key (post_id, organization_id) references public.social_posts (id, organization_id) on delete cascade,
  foreign key (account_id, organization_id) references public.social_accounts (id, organization_id)
    on delete no action deferrable initially deferred
);
create unique index if not exists social_post_targets_postiz_idx on public.social_post_targets (postiz_post_id) where postiz_post_id is not null;
create index if not exists social_post_targets_account_idx on public.social_post_targets (account_id);

create table if not exists public.social_media (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             text not null check (kind in ('image', 'video')),
  file_name        text not null check (length(file_name) between 1 and 255),
  storage_path     text not null,
  postiz_media_id  text,
  postiz_path      text,
  bytes            bigint check (bytes >= 0),
  created_by       text not null,
  created_at       timestamptz not null default now(),
  unique (id, organization_id)
);
create index if not exists social_media_org_idx on public.social_media (organization_id, created_at desc);

create table if not exists public.social_post_media (
  post_id         uuid not null,
  media_id        uuid not null,
  organization_id uuid not null,
  position        smallint not null default 0 check (position >= 0),
  alt_text        text check (length(alt_text) <= 2000),
  primary key (post_id, media_id),
  foreign key (post_id, organization_id) references public.social_posts (id, organization_id) on delete cascade,
  foreign key (media_id, organization_id) references public.social_media (id, organization_id)
    on delete no action deferrable initially deferred
);
create index if not exists social_post_media_media_idx on public.social_post_media (media_id);

create table if not exists public.social_saved_texts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  body            text not null check (length(btrim(body)) between 1 and 10000),
  created_at      timestamptz not null default now()
);
create index if not exists social_saved_texts_org_idx on public.social_saved_texts (organization_id);

-- Brand roles for people outside ops (V2 customers; internal users keep ops_role). user_id = the auth user id.
create table if not exists public.social_brand_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null,
  role            text not null check (role in ('owner', 'editor', 'reviewer', 'client')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists social_brand_members_user_idx on public.social_brand_members (user_id);

-- Retention before V2 (2 rows per post on a 768 MB host): plan V2 list.
create table if not exists public.social_audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  at              timestamptz not null default now(),
  actor           text not null check (length(actor) <= 320),
  action          text not null check (action ~ '^[a-z][a-z_]{1,40}$'),
  post_id         uuid,
  detail          jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 16384)
);
create index if not exists social_audit_log_org_idx on public.social_audit_log (organization_id, at desc);
create index if not exists social_audit_log_post_idx on public.social_audit_log (post_id, at) where post_id is not null;

-- once published_at is set: content frozen; state only published <-> deleted
create or replace function public.social_posts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'a social post cannot move between brands' using errcode = 'check_violation';
  end if;
  if old.published_at is not null and (
       new.state not in ('published', 'deleted')
    or new.published_at is distinct from old.published_at
    or new.body is distinct from old.body or new.scheduled_at is distinct from old.scheduled_at
    or new.first_comment is distinct from old.first_comment or new.link_url is distinct from old.link_url
    or new.link_utm is distinct from old.link_utm or new.list_id is distinct from old.list_id) then
    raise exception 'social post % was published; copy it instead of editing', old.id using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- targets and media of a published post: no insert, no delete (a cascade from the post itself passes, the parent is
-- already gone), no edit except the sender's write-back of a target
create or replace function public.social_children_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pids uuid[];
begin
  pids := case tg_op when 'INSERT' then array[new.post_id] when 'DELETE' then array[old.post_id]
                     else array[old.post_id, new.post_id] end;
  if tg_op = 'UPDATE' and tg_table_name = 'social_post_targets' then
    -- nested: PL/pgSQL resolves every field in one condition, and social_post_media has no account_id
    if new.post_id = old.post_id and new.account_id = old.account_id and new.organization_id = old.organization_id
       and new.custom_body is not distinct from old.custom_body and new.format = old.format then
      new.updated_at := now();
      return new;   -- sender write-back (state, postiz_post_id, release_url, error)
    end if;
  end if;
  if exists (select 1 from public.social_posts p where p.id = any (pids) and p.published_at is not null for share) then
    raise exception 'social post % was published; its targets and media are frozen', pids[1] using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_table_name = 'social_post_targets' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function public.social_audit_log_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'social_audit_log is append-only' using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists social_accounts_touch on public.social_accounts;
create trigger social_accounts_touch before update on public.social_accounts for each row execute function public.social_touch_row();
drop trigger if exists social_lists_touch on public.social_lists;
create trigger social_lists_touch before update on public.social_lists for each row execute function public.social_touch_row();
drop trigger if exists social_posts_guard on public.social_posts;
create trigger social_posts_guard before update on public.social_posts for each row execute function public.social_posts_guard();
drop trigger if exists social_posts_touch on public.social_posts;
create trigger social_posts_touch before update on public.social_posts for each row execute function public.social_touch_row();
drop trigger if exists social_targets_guard on public.social_post_targets;
create trigger social_targets_guard before insert or update or delete on public.social_post_targets
  for each row execute function public.social_children_guard();
drop trigger if exists social_post_media_guard on public.social_post_media;
create trigger social_post_media_guard before insert or update or delete on public.social_post_media
  for each row execute function public.social_children_guard();
drop trigger if exists social_audit_log_no_update on public.social_audit_log;
create trigger social_audit_log_no_update before update on public.social_audit_log for each row execute function public.social_audit_log_append_only();

revoke all on function public.social_touch_row(), public.social_posts_guard(), public.social_children_guard(),
  public.social_audit_log_append_only() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['social_accounts', 'social_lists', 'social_list_accounts', 'social_posts', 'social_post_targets',
                           'social_media', 'social_post_media', 'social_saved_texts', 'social_brand_members', 'social_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role only" on public.%I', t);
    execute format('create policy "service_role only" on public.%I to service_role using (true) with check (true)', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  revoke update, delete, truncate on public.social_audit_log from service_role;
end $$;

-- copy 0011's mappings; two orgs on one integration is a human call, not a silent drop
do $$
declare
  dup text;
begin
  if to_regclass('public.social_postiz_connections') is null then
    return;
  end if;
  select string_agg(postiz_integration_id, ', ') into dup
  from (select postiz_integration_id from public.social_postiz_connections
        group by postiz_integration_id having count(distinct client_id) > 1) d;
  if dup is not null then
    raise exception 'social_postiz_connections maps these integrations to more than one org: % -- pick one owner, then re-run 0096', dup;
  end if;
  insert into public.social_accounts (organization_id, postiz_integration_id, platform, label, status, created_at)
  select distinct on (c.postiz_integration_id)
         c.client_id, c.postiz_integration_id, c.platform, coalesce(c.label, ''), c.status, c.created_at
  from public.social_postiz_connections c
  order by c.postiz_integration_id, c.created_at
  on conflict (postiz_instance, postiz_integration_id) do nothing;
end $$;

notify pgrst, 'reload schema';

commit;
