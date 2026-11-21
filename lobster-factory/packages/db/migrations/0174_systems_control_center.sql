-- 0174: /ops/systems 系統總控中心 (agency-os/handoffs/2026-11-21-systems-control-center/PLAN.md §2, §3).
-- systems / system_phases / system_features = projection of git agency-os/systems/registry.json, written only by
-- next-admin POST /api/internal/systems/ingest via systems_apply_registry (one transaction; a definition gone from the
-- registry gets in_registry=false, never deleted, because events point at it). system_updates = the state: append-only events, unique event_key
-- (git:<sha>:<idx> | mig:<feature_id> | run:<head> | user:<uuid>); status, handoff card and completion are computed
-- from them (next-admin lib/systems/projection.ts). A correction is a new event (corrects_event_id), never an UPDATE.
-- RLS deny-by-default (same as 0166_vendor_invoices): RLS on, no policy, anon/authenticated revoked; only the service role.
-- Additive only: no existing table is touched. Rollback: 0174_systems_control_center.down.sql.
begin;
set local lock_timeout = '5s';

create table if not exists public.systems (
  id            uuid primary key,                       -- registry id, fixed at creation
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null check (length(btrim(name)) between 1 and 200),
  aliases       text[] not null default '{}',
  type          text not null check (type in ('product', 'internal', 'infrastructure', 'governance', 'client')),
  purpose       text not null default '',
  product_key   text,
  source_paths  text[] not null default '{}',
  position      integer not null default 0,             -- order in registry.json
  in_registry   boolean not null default true,
  updated_at    timestamptz not null default now()
);

create table if not exists public.system_phases (
  id                  uuid primary key,
  system_id           uuid not null references public.systems(id),
  slug                text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                text not null,
  legacy_source_path  text,                             -- old supervisor-page folder; null = never had one
  position            integer not null default 0,
  in_registry         boolean not null default true,
  updated_at          timestamptz not null default now()
);

create table if not exists public.system_features (
  id           uuid primary key,
  system_id    uuid not null references public.systems(id),
  phase_id     uuid references public.system_phases(id),
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null,
  position     integer not null default 0,
  in_registry  boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table if not exists public.system_updates (
  id                 uuid primary key default gen_random_uuid(),
  event_key          text not null unique check (length(event_key) between 1 and 200),
  system_id          uuid references public.systems(id),          -- null = unclassified
  phase_id           uuid references public.system_phases(id),
  feature_id         uuid references public.system_features(id),
  system_slug        text,                                         -- as sent, kept when it resolved to nothing
  phase_slug         text,
  feature_slug       text,
  event_type         text not null check (event_type in
                       ('activity', 'handoff', 'feature_update', 'status_change', 'review', 'revert', 'migration', 'import_run')),
  source             text not null check (source in ('agent', 'user', 'migration', 'importer')),
  commit_sha         text,
  occurred_at        timestamptz not null,
  payload            jsonb not null default '{}'::jsonb,
  evidence           jsonb,
  corrects_event_id  uuid references public.system_updates(id),
  created_at         timestamptz not null default now()
);

-- Slugs are unique among live rows only: a retired row keeps its slug (events point at it) without blocking a new
-- definition from reusing it, and a swap of two slugs inside one registry version passes (see systems_apply_registry).
create unique index if not exists systems_slug_live_idx on public.systems (slug) where in_registry;
create unique index if not exists system_phases_slug_live_idx on public.system_phases (system_id, slug) where in_registry;
create unique index if not exists system_features_slug_live_idx on public.system_features (system_id, slug) where in_registry;

create index if not exists system_updates_system_occurred_idx on public.system_updates (system_id, occurred_at desc);
create index if not exists system_updates_event_type_idx on public.system_updates (event_type);

alter table public.systems         enable row level security;
alter table public.system_phases   enable row level security;
alter table public.system_features enable row level security;
alter table public.system_updates  enable row level security;
revoke all on public.systems, public.system_phases, public.system_features, public.system_updates from anon, authenticated;

-- Append-only in the database, not just in the app: any UPDATE / DELETE (service role included) is refused.
create or replace function public.system_updates_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'system_updates is append-only: add a new event instead of changing %', old.id;
end $$;
drop trigger if exists system_updates_append_only on public.system_updates;
create trigger system_updates_append_only before update or delete on public.system_updates
  for each row execute function public.system_updates_append_only();

-- The registry projection in one transaction: retire every live row, then upsert the registry (a row in it comes back
-- live). A failure leaves the previous projection whole. Called only by the ingest route (service role).
create or replace function public.systems_apply_registry(p_systems jsonb, p_phases jsonb, p_features jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.systems         set in_registry = false where in_registry;
  update public.system_phases   set in_registry = false where in_registry;
  update public.system_features set in_registry = false where in_registry;

  insert into public.systems (id, slug, name, aliases, type, purpose, product_key, source_paths, position, in_registry, updated_at)
  select x.id, x.slug, x.name, coalesce(x.aliases, '{}'), x.type, coalesce(x.purpose, ''), x.product_key, coalesce(x.source_paths, '{}'), x.position, true, now()
  from jsonb_to_recordset(p_systems) as x(id uuid, slug text, name text, aliases text[], type text, purpose text, product_key text, source_paths text[], position int)
  on conflict (id) do update set slug = excluded.slug, name = excluded.name, aliases = excluded.aliases, type = excluded.type,
    purpose = excluded.purpose, product_key = excluded.product_key, source_paths = excluded.source_paths,
    position = excluded.position, in_registry = true, updated_at = excluded.updated_at;

  insert into public.system_phases (id, system_id, slug, name, legacy_source_path, position, in_registry, updated_at)
  select x.id, x.system_id, x.slug, x.name, x.legacy_source_path, x.position, true, now()
  from jsonb_to_recordset(p_phases) as x(id uuid, system_id uuid, slug text, name text, legacy_source_path text, position int)
  on conflict (id) do update set system_id = excluded.system_id, slug = excluded.slug, name = excluded.name,
    legacy_source_path = excluded.legacy_source_path, position = excluded.position, in_registry = true, updated_at = excluded.updated_at;

  insert into public.system_features (id, system_id, phase_id, slug, name, position, in_registry, updated_at)
  select x.id, x.system_id, x.phase_id, x.slug, x.name, x.position, true, now()
  from jsonb_to_recordset(p_features) as x(id uuid, system_id uuid, phase_id uuid, slug text, name text, position int)
  on conflict (id) do update set system_id = excluded.system_id, phase_id = excluded.phase_id, slug = excluded.slug,
    name = excluded.name, position = excluded.position, in_registry = true, updated_at = excluded.updated_at;
end $$;
revoke all on function public.systems_apply_registry(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.systems_apply_registry(jsonb, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
