-- 0124 rollback is only safe before any WordPress identity has been recorded.
begin;
set local lock_timeout = '5s';
lock table public.customer_identities, public.plans in access exclusive mode;
do $$
begin
  if exists (select 1 from public.customer_identities) then
    raise exception 'customer_identities has rows: 0124 is rolled forward, not down';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0124_customer_identities.sql';
  end if;
end $$;
drop table if exists public.customer_identities;
alter table public.plans add column woo_product_ids integer[] not null default '{}';
notify pgrst, 'reload schema';
commit;
