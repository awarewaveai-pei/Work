-- Every public table has RLS on: anon/authenticated reach a table over REST only through a policy
-- someone wrote. public's default ACL grants both roles every privilege, so a table without RLS is
-- anon-key read/write (the anon key ships in the browser bundle).
-- 2026-10-01 prod had 3 such tables: kb_cleanup_20260920_bad_crawl (manual backup, 159 KB docs
-- with body), social_postiz_connections, ops_health_probes. All app access is service role
-- (lib/supabase-server.ts getSupabaseWriteClient / getSupabaseServerClient).
-- 1) lock down whatever lacks RLS at apply time; 2) event trigger turns RLS on for every future
--    public table, whatever creates it (migration, psql, Studio). A table meant for anon or
--    authenticated still gets its policy explicitly, as 0016/0053 already do.
-- Rollback: drop event trigger public_tables_rls_default_deny; drop function
-- public.enforce_public_table_rls(); per table `alter table ... disable row level security`.

begin;
set local lock_timeout = '5s';

create or replace function public.enforce_public_table_rls()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type = 'table' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end $$;

revoke all on function public.enforce_public_table_rls() from public, anon, authenticated;

drop event trigger if exists public_tables_rls_default_deny;
create event trigger public_tables_rls_default_deny
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.enforce_public_table_rls();

-- Trigger first, inventory last: a table created concurrently before this commit is still a
-- residual window -- after applying, `select relname from pg_class ... where not relrowsecurity`
-- in public must return 0 rows.
do $$
declare
  t text;
  verified constant text[] := array['kb_cleanup_20260920_bad_crawl', 'social_postiz_connections', 'ops_health_probes'];
  unknown text;
begin
  -- Only the tables verified above; any other RLS-less table aborts the batch for a human call.
  select string_agg(c.relname, ', ') into unknown
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    and c.relname <> all (verified);
  if unknown is not null then
    raise exception 'public tables without RLS not reviewed by 0094: %', unknown;
  end if;
  foreach t in array verified loop
    continue when to_regclass('public.' || quote_ident(t)) is null;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role only" on public.%I', t);
    execute format('create policy "service_role only" on public.%I to service_role using (true) with check (true)', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    raise notice 'locked down public.%', t;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
