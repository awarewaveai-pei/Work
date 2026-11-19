-- Down migration for 0079_organizations_chatwoot_account_id_unique.sql
BEGIN;

DROP INDEX IF EXISTS public.organizations_chatwoot_account_id_unique;

do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0079_organizations_chatwoot_account_id_unique.sql';
  end if;
end $$;
COMMIT;
