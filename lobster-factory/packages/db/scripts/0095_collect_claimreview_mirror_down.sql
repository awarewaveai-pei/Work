-- Down migration for 0095_collect_claimreview_mirror.sql. Withdraw the next-admin code first (it only reads and
-- refreshes the mirror; without the tables it answers 無法檢查). The mirror is a public dataset re-downloadable at any
-- time: dropping it loses nothing the next daily refresh cannot rebuild. Removes 0095's ledger row in the same
-- transaction so `apply-db-migration.mjs --status` stays true and a re-apply needs no --force-reapply.
--
-- APPLY WITH:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0095_collect_claimreview_mirror_down.sql

begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0095_collect_claimreview_mirror.sql';
  end if;
end $$;

drop function if exists public.collect_claimreview_prune(integer);
drop function if exists public.collect_claimreview_fail_refresh(text);
drop function if exists public.collect_claimreview_finish_refresh(bigint, integer, integer, text);
drop function if exists public.collect_claimreview_begin_refresh(integer, integer);
drop function if exists public.collect_claimreview_candidates(text[], integer);
drop table if exists public.collect_claimreview_reviews;
drop table if exists public.collect_claimreview_mirror;
drop function if exists public.collect_claimreview_pieces(text);

notify pgrst, 'reload schema';

commit;
