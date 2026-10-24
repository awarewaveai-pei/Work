-- Back to 0121: the topic's site is checked by id only again. No data changes. Revert the app first, then this.
begin;
set local lock_timeout = '5s';
alter table public.content_topics drop constraint if exists content_topics_site_organization_fkey;
alter table public.content_topics drop constraint if exists content_topics_site_id_fkey;
alter table public.content_topics add constraint content_topics_site_id_fkey
  foreign key (site_id) references public.wp_sites (id) on delete set null;
alter table public.wp_sites drop constraint if exists wp_sites_id_organization_key;
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0122_content_topics_site_org.sql';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
