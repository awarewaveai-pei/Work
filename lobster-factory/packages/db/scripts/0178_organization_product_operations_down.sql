-- Back to 0177. Revert next-admin first (its 帳務 tab reads and writes this table). Drops every row: each one is a staff
-- switch to 代操 (or back) that the pre-0178 app cannot show; the switches stay in ops_audit_events
-- (client_product_operator_set) to re-enter by hand after re-applying 0178.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0178_organization_product_operations.sql';
  end if;
end $$;

drop table if exists public.organization_product_operations;
drop function if exists public.organization_product_operations_account_check();

notify pgrst, 'reload schema';
commit;
