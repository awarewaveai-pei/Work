-- Back to 0129: drops 0130's billing_ledger (0127's billing_attention was never touched). Read-only function, no data.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0130_billing_ledger.sql';
  end if;
end $$;
drop function if exists public.billing_ledger(text, text, integer, integer);

notify pgrst, 'reload schema';
commit;
