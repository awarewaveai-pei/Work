-- Back to 0146: the staff plan functions go. Plans they created or changed stay (a plan may already be sold); their
-- ops_audit_events rows stay. Edit such a plan by migration, as before 0147.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0147_plan_admin.sql';
  end if;
end $$;
drop function if exists public.plan_admin_update(text, jsonb, jsonb, text, text);
drop function if exists public.plan_admin_create(text, text, text, jsonb, jsonb, text, text);
drop function if exists public.plan_admin_guard(text, text);
drop function if exists public.plan_admin_check(text, text, text, jsonb, jsonb);
notify pgrst, 'reload schema';
commit;
