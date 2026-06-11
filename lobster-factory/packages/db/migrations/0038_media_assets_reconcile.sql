-- 0038_media_assets_reconcile.sql
--
-- ROOT CAUSE (found by critic review 2026-06-11, WORKLOG same day):
--   0007_v3_skeleton_modules.sql:40  and  0011_ops_console_control_plane.sql:35
--   BOTH run `create table if not exists media_assets` with mutually incompatible
--   shapes. On a fresh sequential replay 0007 wins and 0011 is a SILENT NO-OP, so
--   every 0011-shape consumer (app/api/tools/designs, media storage contract)
--   breaks with "column does not exist".
--   SG production was verified (2026-06-11, REST select) to hold the pure 0011
--   shape — the 0007-shape table was evidently dropped/recreated by hand around
--   2026-04-25 with no migration recording it. This file records the reconcile.
--
-- CANONICAL SHAPE = 0011 (storage_backend / asset_domain / object_key / ...).
-- This migration is idempotent and safe on BOTH states:
--   * fresh replay (0007 shape):  adds the canonical columns, relaxes legacy
--     NOT NULLs, installs canonical constraints/index.
--   * production (0011 shape):    every statement is a no-op.
-- Legacy 0007 columns (asset_type / storage_key / status / updated_at) are KEPT
-- (nullable) for compatibility — additive only, nothing is dropped.

-- 1) Canonical columns (no-op where they already exist).
alter table media_assets add column if not exists project_id uuid references projects(id) on delete set null;
alter table media_assets add column if not exists site_id uuid references sites(id) on delete set null;
alter table media_assets add column if not exists storage_backend text;
alter table media_assets add column if not exists asset_domain text;
alter table media_assets add column if not exists object_key text;
alter table media_assets add column if not exists object_url text;
alter table media_assets add column if not exists mime_type text;
alter table media_assets add column if not exists byte_size bigint;
alter table media_assets add column if not exists checksum_sha256 text;
alter table media_assets add column if not exists source_run_id uuid references ops_action_runs(id) on delete set null;
alter table media_assets add column if not exists version int not null default 1;
alter table media_assets add column if not exists is_current boolean not null default true;
alter table media_assets add column if not exists created_by uuid references profiles(id) on delete set null;

-- 2) Legacy 0007 NOT NULLs would reject canonical inserts — relax them.
--    workspace_id exists in both shapes (0011 wants it nullable); the others only
--    exist on the 0007 path, so they are guarded.
alter table media_assets alter column workspace_id drop not null;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'media_assets'
               and column_name = 'asset_type') then
    alter table media_assets alter column asset_type drop not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'media_assets'
               and column_name = 'storage_key') then
    alter table media_assets alter column storage_key drop not null;
  end if;
end $$;

-- 3) Canonical NOT NULLs — only when no existing row violates them (a fresh replay
--    table is empty, so they apply; a table with legacy rows stays nullable instead
--    of failing the whole migration).
do $$
begin
  if not exists (select 1 from media_assets where storage_backend is null) then
    alter table media_assets alter column storage_backend set not null;
  end if;
  if not exists (select 1 from media_assets where asset_domain is null) then
    alter table media_assets alter column asset_domain set not null;
  end if;
  if not exists (select 1 from media_assets where object_key is null) then
    alter table media_assets alter column object_key set not null;
  end if;
end $$;

-- 4) Canonical CHECK constraints (names match the ones PG auto-generates from the
--    inline checks in 0011, so this is a no-op on production). NOT VALID keeps any
--    pre-existing legacy rows from blocking the install; new writes are enforced.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.media_assets'::regclass
                   and conname = 'media_assets_storage_backend_check') then
    alter table media_assets
      add constraint media_assets_storage_backend_check
      check (storage_backend in ('r2', 'wp_uploads')) not valid;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.media_assets'::regclass
                   and conname = 'media_assets_asset_domain_check') then
    alter table media_assets
      add constraint media_assets_asset_domain_check
      check (asset_domain in ('ai_generated', 'wp_product', 'wp_blog')) not valid;
  end if;
end $$;

-- 5) Canonical unique index (no-op by name on production).
create unique index if not exists uq_media_assets_org_backend_key_version
  on media_assets(organization_id, storage_backend, object_key, version);
