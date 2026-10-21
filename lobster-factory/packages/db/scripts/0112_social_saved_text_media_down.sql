-- Down for 0112_social_saved_text_media.sql.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0112_social_saved_text_media.sql';
  end if;
end $$;

drop function if exists public.social_save_text(uuid, text, uuid[]);
drop function if exists public.social_list_saved_texts(uuid);
drop table if exists public.social_saved_text_media;
alter table public.social_saved_texts drop constraint if exists social_saved_texts_id_org_key;

notify pgrst, 'reload schema';
commit;
