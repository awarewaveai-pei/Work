-- Back to 0126: drops 0127's two reads (billing_overview was never touched). Read-only functions, no data.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0127_billing_account_views.sql';
  end if;
end $$;
drop function if exists public.billing_attention(integer, integer);
drop function if exists public.billing_account(uuid, integer, integer);

notify pgrst, 'reload schema';
commit;
