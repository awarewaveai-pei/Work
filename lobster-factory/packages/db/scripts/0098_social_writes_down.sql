-- Down for 0098_social_writes.sql: drops the three write functions and the connect-attempt table, with its rows (who
-- pressed "connect" when; nothing else reads them). 0096's tables and their rows are untouched (a save or state change
-- already made stays made). Removes 0098's ledger row in the same transaction so `apply-db-migration.mjs --status`
-- stays true.
-- ORDER: withdraw the next-admin social code first (its rpc calls would 500 with PGRST202), then this, then
-- 0096_social_manager_down.sql if wanted (0096 down fails with 2BP01 while 0098 is still here; atomic, no harm).
-- Dropping a table that references organizations takes an ACCESS EXCLUSIVE lock on it; lock_timeout 1s makes a busy
-- organizations table fail this fast (re-run) instead of queueing every organizations read behind it.
--
-- APPLY WITH:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0098_social_writes_down.sql
begin;
set local lock_timeout = '1s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0098_social_writes.sql';
  end if;
end $$;

drop function if exists public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text);
drop function if exists public.social_set_state(uuid, uuid, integer, text, timestamptz, uuid, integer, text, text, jsonb);
drop function if exists public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[]);
drop table if exists public.social_connect_attempts;
notify pgrst, 'reload schema';
commit;
