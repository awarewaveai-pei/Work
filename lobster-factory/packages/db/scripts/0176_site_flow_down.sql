-- Back to 0175. Revert next-admin's site flow first (it reads these catalog rows). Refuses while any ops_action_runs
-- row points at a site.* action (action_id is ON DELETE RESTRICT, 0011): those runs are the record of host changes.
-- Only rows this migration seeded (metadata.source = '0176_site_flow') are deleted.
begin;
set local lock_timeout = '5s';

do $$
declare n bigint;
begin
  select count(*) into n
  from public.ops_action_runs r
  join public.ops_action_catalog c on c.id = r.action_id
  where c.metadata->>'source' = '0176_site_flow';
  if n > 0 then
    raise exception '0176 down: % ops_action_runs row(s) reference site.* actions; back them up and get the operator''s consent first', n;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0176_site_flow.sql';
  end if;
end $$;

delete from public.ops_action_catalog
where action_key in ('site.preflight', 'site.create', 'site.wp_install', 'site.vhost', 'site.mainwp', 'site.bridge', 'site.open')
  and metadata->>'source' = '0176_site_flow';

drop index if exists public.uq_environments_site_type_live;

commit;
