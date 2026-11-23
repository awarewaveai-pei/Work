-- Back to 0178. Revert next-admin first: the client rail's 訂閱 tag reads this function (without it the answer says
-- tagsFailed and the contract-source accounts drop out of 訂閱).
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0179_entitlement_held_products.sql';
  end if;
end $$;

drop function if exists public.entitlement_held_products();

notify pgrst, 'reload schema';
commit;
