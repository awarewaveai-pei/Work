-- 0163: a social video's cover image (card VD.5, video-workbench/docs/video-deliverable-pack-spec-20261114.md). The cover
-- is its own social_media image row (uploaded to Postiz like any image); the video row points at it. Postiz hands it to
-- YouTube (settings.thumbnail) and Instagram (cover_url) at send time (next-admin lib/social/compose.ts COVER_PLATFORMS).
-- Additive: null = no cover, the behaviour before 0163. Deleting the image clears only the pointer, never the video.
begin;
set local lock_timeout = '5s';
alter table public.social_media add column if not exists cover_media_id uuid;
-- 'image' exactly when a cover is set (CHECK social_media_cover_kind): the FK below then only matches an IMAGE row of the
-- same organization (a video, or another org's row, can never be a cover). Both null = no cover, FK not checked (MATCH
-- SIMPLE). A plain column, not a generated one: Postgres refuses ON DELETE SET NULL on an FK with a generated column.
alter table public.social_media add column if not exists cover_kind text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_media_id_org_kind_key') then
    alter table public.social_media add constraint social_media_id_org_kind_key unique (id, organization_id, kind);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_media_cover_fk') then
    alter table public.social_media add constraint social_media_cover_fk
      foreign key (cover_media_id, organization_id, cover_kind) references public.social_media (id, organization_id, kind)
      on delete set null (cover_media_id, cover_kind);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_media_cover_kind') then
    alter table public.social_media add constraint social_media_cover_kind
      -- written so it is never NULL (a NULL CHECK passes): both absent, or both present with kind 'image'
      check ((cover_media_id is null) = (cover_kind is null) and coalesce(cover_kind, 'image') = 'image');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_media_cover_on_video') then
    alter table public.social_media add constraint social_media_cover_on_video
      check (cover_media_id is null or (kind = 'video' and cover_media_id <> id));
  end if;
end $$;
create index if not exists social_media_cover_idx on public.social_media (cover_media_id) where cover_media_id is not null;
comment on column public.social_media.cover_media_id is 'The cover image (a kind=image row of the same organization) of this video; null = none.';
commit;
