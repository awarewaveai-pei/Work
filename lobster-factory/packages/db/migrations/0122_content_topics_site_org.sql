-- 0122: a topic's site belongs to the topic's own organization, held by the database (AUTO_CONTENT_EXECUTION_PLAN.md D8).
-- The app already gives a topic its site's organization and never changes site_id (lib/content/topics/store.ts); this
-- makes a wrong write fail instead of trusting every future writer. A site that some topic uses can then no longer
-- change its organization (no app path changes wp_sites.organization_id), and deleting a site still clears only the
-- topic's site_id. Down: packages/db/migrations/0122_content_topics_site_org.down.sql.
begin;
set local lock_timeout = '5s';
-- both up front: the check below reads them, the ALTERs need access exclusive; taking it late could deadlock (db-expert)
lock table public.wp_sites, public.content_topics in access exclusive mode;

do $$
begin
  if exists (select 1 from public.content_topics t join public.wp_sites s on s.id = t.site_id
             where s.organization_id is distinct from t.organization_id) then
    raise exception '0122: a topic uses a site of another organization; fix those rows first';
  end if;
end $$;

alter table public.wp_sites add constraint wp_sites_id_organization_key unique (id, organization_id);
alter table public.content_topics drop constraint content_topics_site_id_fkey;
-- MATCH SIMPLE: a topic without a site is not checked. SET NULL (site_id): organization_id is NOT NULL and stays.
alter table public.content_topics add constraint content_topics_site_organization_fkey
  foreign key (site_id, organization_id) references public.wp_sites (id, organization_id) on delete set null (site_id);

notify pgrst, 'reload schema';
commit;
