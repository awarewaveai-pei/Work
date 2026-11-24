-- 0181: one live environment per host site code (card SF-J2; SITE-FLOW-COMPLETION-PLAN.md §1-4).
-- environments.metadata->>'host_slug' names the site on the host (container <slug>-wp, volume <slug>_wordpress_data;
-- next-admin lib/site-flow/gate-client.ts gateTargetOf). Two live rows with one slug would point two sites at one
-- container. next-admin lib/site-flow/create-site.ts already checks before it writes; this index closes the
-- concurrent-create race (records.ts ensureEnvironment reads the 23505 as `conflict`, create-site answers
-- host_slug_taken). Archived rows and rows without a host_slug are outside the index.
-- Refuses to run if live duplicates already exist. Write access unchanged (environments: service role only, 0136).
-- Rollback: 0181_environments_host_slug_unique.down.sql.
begin;
set local lock_timeout = '5s';

do $$
declare d text;
begin
  select string_agg(format('%s (%s rows)', slug, n), ', ') into d from (
    select metadata->>'host_slug' as slug, count(*) as n
    from public.environments
    where status <> 'archived' and (metadata->>'host_slug') is not null
    group by 1
    having count(*) > 1
  ) dup;
  if d is not null then
    raise exception '0181: host_slug held by more than one non-archived environment: %; archive the extras first', d;
  end if;
end $$;

create unique index if not exists uq_environments_host_slug_live
  on public.environments ((metadata->>'host_slug'))
  where status <> 'archived' and (metadata->>'host_slug') is not null;

-- `if not exists` looks at the name only: a same-named index with another definition would be skipped silently.
do $$
declare def text := pg_get_indexdef('public.uq_environments_host_slug_live'::regclass);
begin
  if def not like 'CREATE UNIQUE INDEX%' or def not like '%host_slug%' or def not like '%WHERE%archived%' then
    raise exception '0181: uq_environments_host_slug_live exists with another definition: %', def;
  end if;
end $$;

commit;
