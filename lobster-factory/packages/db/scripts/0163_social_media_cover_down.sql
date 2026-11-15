-- Back to 0162. Revert next-admin first (it writes cover_media_id). The cover image rows stay as ordinary images in the
-- media library; only the video -> cover pointers are lost.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0163_social_media_cover.sql';
  end if;
end $$;
drop index if exists public.social_media_cover_idx;
alter table public.social_media drop constraint if exists social_media_cover_on_video;
alter table public.social_media drop constraint if exists social_media_cover_fk;
alter table public.social_media drop constraint if exists social_media_cover_kind;
alter table public.social_media drop column if exists cover_kind;
alter table public.social_media drop constraint if exists social_media_id_org_kind_key;
alter table public.social_media drop column if exists cover_media_id;
commit;
