-- Back to 0142: the staff give/take functions and the one-live-staff-row index go. Rows they wrote stay (grants are
-- never deleted, audit); a live 'staff:%' row keeps working in can() like any comp row and is ended by hand if needed.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0143_entitlement_staff_grants.sql';
  end if;
end $$;
drop function if exists public.entitlement_staff_revoke(uuid, text, text, text[], text, text, text);
drop function if exists public.entitlement_staff_grant(uuid, text, text, jsonb, text, text, text);
drop function if exists public.entitlement_staff_account(uuid, text);
drop index if exists public.organization_entitlements_staff_live_uniq;
notify pgrst, 'reload schema';
commit;
