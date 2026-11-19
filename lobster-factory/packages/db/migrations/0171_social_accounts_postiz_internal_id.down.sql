-- Back to 0170: no postiz_internal_id. Revert the app first (store.ts startConnect reads it). The column is a mirror of
-- Postiz's own table, refilled within 5 minutes by the host job if 0171 is applied again: nothing is lost.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0171_social_accounts_postiz_internal_id.sql';
  end if;
end $$;

alter table public.social_accounts drop column if exists postiz_internal_id;

notify pgrst, 'reload schema';
commit;
