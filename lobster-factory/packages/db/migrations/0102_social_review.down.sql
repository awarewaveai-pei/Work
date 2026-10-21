-- Down for 0102_social_review.sql: drops the per-brand review setting (every brand back to "no review required").
-- ORDER: withdraw the next-admin code reading it first (lib/social/review.ts would answer 500 on a missing table).
--
-- APPLY WITH:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0102_social_review_down.sql
begin;
set local lock_timeout = '1s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0102_social_review.sql';
  end if;
end $$;

drop function if exists public.social_set_review(uuid, boolean, text);
drop table if exists public.social_brand_settings;
notify pgrst, 'reload schema';
commit;
