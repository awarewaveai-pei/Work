-- DOWN migration for 0038_media_assets_reconcile.sql — fresh-replay path ONLY.
-- ⚠ Do NOT run on SG production: there the table is natively 0011-shape and these
-- columns are load-bearing (designs route, media storage contract). This down file
-- exists for the disaster-recovery/replay environment where 0038 transformed a
-- 0007-shape table and needs to be undone.

alter table media_assets drop constraint if exists media_assets_storage_backend_check;
alter table media_assets drop constraint if exists media_assets_asset_domain_check;
drop index if exists uq_media_assets_org_backend_key_version;

alter table media_assets drop column if exists project_id;
alter table media_assets drop column if exists site_id;
alter table media_assets drop column if exists storage_backend;
alter table media_assets drop column if exists asset_domain;
alter table media_assets drop column if exists object_key;
alter table media_assets drop column if exists object_url;
alter table media_assets drop column if exists mime_type;
alter table media_assets drop column if exists byte_size;
alter table media_assets drop column if exists checksum_sha256;
alter table media_assets drop column if exists source_run_id;
alter table media_assets drop column if exists version;
alter table media_assets drop column if exists is_current;
alter table media_assets drop column if exists created_by;

-- Restore legacy NOT NULLs only if the data allows it (guarded; skip on violation).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'media_assets'
               and column_name = 'asset_type')
     and not exists (select 1 from media_assets where asset_type is null) then
    alter table media_assets alter column asset_type set not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'media_assets'
               and column_name = 'storage_key')
     and not exists (select 1 from media_assets where storage_key is null) then
    alter table media_assets alter column storage_key set not null;
  end if;
  if not exists (select 1 from media_assets where workspace_id is null) then
    alter table media_assets alter column workspace_id set not null;
  end if;
end $$;

notify pgrst, 'reload schema';
